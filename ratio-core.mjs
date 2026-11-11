export function extractLocations(parsed) {
 if(Array.isArray(parsed))return parsed;
 if(parsed?.type==='FeatureCollection'&&Array.isArray(parsed.features))return parsed.features;
 for(const key of ['customCoordinates','locations','records'])if(Array.isArray(parsed?.[key]))return parsed[key];
 if(parsed?.type==='Feature')return [parsed];
 throw new Error('未找到地点列表。支持 customCoordinates、locations、records、地点数组及 GeoJSON Point 文件。');
}
function numeric(v){return (typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;}
export function locationPoint(raw) {
 if(!raw||typeof raw!=='object')return null;
 let lat,lng;
 if(raw.type==='Feature'){
  if(raw.geometry?.type!=='Point')return null;
  [lng,lat]=raw.geometry.coordinates||[];
 }else if(raw.type==='Point') [lng,lat]=raw.coordinates||[];
 else{
  const p=raw.latLng||raw;
  lat=p.lat??p.latitude??p.Lat??p.Latitude;
  lng=p.lng??p.lon??p.longitude??p.Lng??p.Lon??p.Longitude;
 }
 lat=numeric(lat);lng=numeric(lng);
 if(lat===null||lng===null||lat<-90||lat>90||lng<-180||lng>180)return null;
 return {lat,lng,pano:raw.panoId||raw.pano||raw.properties?.panoId||''};
}
export function comparisonRows(country,counts,template) {
 const total=Object.values(counts).reduce((a,b)=>a+b,0);
 const config=template.countries[country],templates=new Map(config.subdivisions.map(r=>[r.code,r]));
 const codes=new Set([...templates.keys(),...Object.keys(counts)]);
 return [...codes].map(code=>{
  const target=templates.get(code),entry=counts[code]||{count:0};
  // Counts are plain integers in persisted results; names are provided separately.
  const count=typeof entry==='number'?entry:entry.count;
  const actual=total?count/total:0,expected=target?target.weight/config.totalWeight:null;
  const relative=expected>0&&total>0?actual/expected*100:null;
  return {code,name:target?.name||target?.valiName||code,count,actual:total?actual:null,expected,relative,
   relativeDeviation:relative===null?null:relative-100,percentagePoints:expected===null||!total?null:(actual-expected)*100,
   targetWeight:target?.weight??null};
 });
}
export async function analyzeFiles(files,indexes,template,{deduplicate=false,progress=()=>{},cancelled=()=>false}={}) {
 const counts={},names={},totals={input:0,invalid:0,unmatched:0,duplicates:0,excludedDuplicates:0,matched:0};
 const perFile=[];const seenPanos=new Set(),seenCoordinates=new Set();
 for(const [iso,index] of Object.entries(indexes)){
  counts[iso]=Object.fromEntries(index.regions.map(r=>[r.code,0]));names[iso]=Object.fromEntries(index.regions.map(r=>[r.code,r.name]));
 }
 let processed=0;
 for(const file of files){
  let parsed;try{parsed=JSON.parse(file.text)}catch{throw new Error(`“${file.name}”不是有效的 JSON。`)}
  const locations=extractLocations(parsed),info={name:file.name,total:locations.length};perFile.push(info);totals.input+=locations.length;
  for(let i=0;i<locations.length;i++){
   if(cancelled())throw new Error('分析已取消。');
   const p=locationPoint(locations[i]);
   if(!p)totals.invalid++;
   else{
    // Never use a string ID or an imported ISO tag as a substitute for coordinates.
    const coordinateKey=p.lat.toFixed(7)+','+p.lng.toFixed(7);
    const duplicate=p.pano?seenPanos.has(p.pano):seenCoordinates.has(coordinateKey);
    if(p.pano)seenPanos.add(p.pano);seenCoordinates.add(coordinateKey);
    if(duplicate)totals.duplicates++;
    if(duplicate&&deduplicate)totals.excludedDuplicates++;
    else{
     let match=null;
     for(const [iso,index] of Object.entries(indexes)){const region=index.find(p.lat,p.lng);if(region){match={iso,region};break;}}
     if(match){const {iso,region}=match;counts[iso][region.code]=(counts[iso][region.code]||0)+1;totals.matched++;}
     else totals.unmatched++;
    }
   }
   processed++;
   if(processed%500===0){progress({processed,input:totals.input});await new Promise(r=>setTimeout(r,0));}
  }
 }
 const countries={};
 for(const [iso,index] of Object.entries(indexes)){
  const rows=comparisonRows(iso,counts[iso],template);
  for(const row of rows)row.name=names[iso][row.code]||row.name;
  rows.sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  countries[iso]={total:Object.values(counts[iso]).reduce((a,b)=>a+b,0),rows};
 }
 return {totals,countries,files:perFile,deduplicate,templateCommit:template.commit};
}
