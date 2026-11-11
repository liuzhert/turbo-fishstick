export const COUNTRIES = {ARG:{name:'阿根廷',fileName:'Argentina'},CHL:{name:'智利',fileName:'Chile'},BRA:{name:'巴西',fileName:'Brazil'},PER:{name:'秘鲁',fileName:'Peru'},COL:{name:'哥伦比亚',fileName:'Colombia'},MEX:{name:'墨西哥',fileName:'Mexico'},USA:{name:'美国',fileName:'United States'}};
const STEP=2, RAD=Math.PI/180;
export const wrapLongitude = lng => ((lng+180)%360+360)%360-180;
export function pointInRing(x,y,ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [xi,yi]=ring[i], [xj,yj]=ring[j];
    const dx=xj-xi,dy=yj-yi;
    if((dx||dy) && Math.abs((x-xi)*dy-(y-yi)*dx)<1e-10 && x>=Math.min(xi,xj)-1e-10 && x<=Math.max(xi,xj)+1e-10 && y>=Math.min(yi,yj)-1e-10 && y<=Math.max(yi,yj)+1e-10) return true;
    if(((yi>y)!==(yj>y)) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
export function pointInGeometry(lng,lat,geometry) {
  const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];
  return polygons.some(r=>pointInRing(lng,lat,r[0])&&!r.slice(1).some(h=>pointInRing(lng,lat,h)));
}
function bounds(ring) {
 let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;
 for(const [x,y] of ring){w=Math.min(w,x);e=Math.max(e,x);s=Math.min(s,y);n=Math.max(n,y);}
 return [w,s,e,n];
}
function windowsForPart(b) {
 const [w,s,e,n]=b;
 if(e<=180) return [[w,s,e,n]];
 return [[w,s,180,n],[-180,s,e-360,n]];
}
function key(x,y){return x+','+y;}
function cellXY(lng,lat){return [Math.min(179,Math.max(0,Math.floor((lng+180)/STEP))),Math.min(89,Math.max(0,Math.floor((lat+90)/STEP)))];}
export class CountryIndex {
 constructor(iso,data) {
  if(!data||data.type!=='FeatureCollection')throw new Error('行政区文件格式错误：'+iso);
  this.iso=iso;this.regions=[];this.grid=new Map();this.samplers=new Map();
  for(const f of data.features) {
   const p=f.properties||{}, code=p.iso3166_2;
   if(!code||!p.name)throw new Error('行政区缺少标准代码或名称：'+iso);
   const region={code,name:p.name,feature:f};this.regions.push(region);
   const polygons=f.geometry?.type==='Polygon'?[f.geometry.coordinates]:f.geometry?.type==='MultiPolygon'?f.geometry.coordinates:[];
   for(const original of polygons) {
    if(!original.length||original[0].length<3)continue;
    let rings=original,b=bounds(original[0]);
    // A date-line crossing ring is evaluated in a continuous 0..360 longitude space.
    if(b[2]-b[0]>180){rings=original.map(r=>r.map(([x,y])=>[x<0?x+360:x,y]));b=bounds(rings[0]);}
    const part={region,rings,bounds:b,shift:b[2]>180};
    for(const win of windowsForPart(b)) {
     const minLat=['ARG','CHL'].includes(iso)?Math.max(-57,win[1]):win[1];
     if(win[3]<minLat)continue;
     const [x0,y0]=cellXY(win[0],minLat),[x1,y1]=cellXY(win[2],win[3]);
     for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
      const k=key(x,y);if(!this.grid.has(k))this.grid.set(k,{x,y,parts:[]});
      const cell=this.grid.get(k);if(!cell.parts.includes(part))cell.parts.push(part);
     }
    }
   }
  }
 }
 find(lat,lng) {
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180)return null;
  if(['ARG','CHL'].includes(this.iso)&&lat < -57)return null;
  if(this.iso==='ARG'&&lat>=-53&&lat<=-50&&lng>=-62&&lng<=-56)return null;
  const norm=wrapLongitude(lng),[x,y]=cellXY(norm,lat),cell=this.grid.get(key(x,y));if(!cell)return null;
  for(const p of cell.parts){
   const px=p.shift&&norm<0?norm+360:norm,[w,s,e,n]=p.bounds;
   if(px<w-1e-10||px>e+1e-10||lat<s-1e-10||lat>n+1e-10)continue;
   if(pointInRing(px,lat,p.rings[0])&&!p.rings.slice(1).some(h=>pointInRing(px,lat,h)))return p.region;
  }
  return null;
 }
 randomPoint(scope='',random=Math.random) {
  if(!this.samplers.has(scope)) {
   let sum=0;const cells=[];
   for(const c of this.grid.values()) {
    if(scope&&!c.parts.some(p=>p.region.name===scope))continue;
    const west=c.x*STEP-180,east=west+STEP;
    const south=Math.max(c.y*STEP-90,['ARG','CHL'].includes(this.iso)?-57:-90),north=c.y*STEP-90+STEP;
    if(north<=south)continue;
    sum+=(east-west)*(Math.sin(north*RAD)-Math.sin(south*RAD));
    cells.push({west,east,south,north,cumulative:sum});
   }
   if(!cells.length)throw new Error('所选行政区没有可抽样范围。');
   this.samplers.set(scope,{cells,sum});
  }
  const {cells,sum}=this.samplers.get(scope);
  // Unique, disjoint cells weighted by spherical area: conditional acceptance is
  // uniform on the selected polygons; no equal weighting of states or islands.
  for(let i=0;i<100000;i++) {
   const target=random()*sum;let lo=0,hi=cells.length-1;
   while(lo<hi){const m=(lo+hi)>>1;if(cells[m].cumulative<target)lo=m+1;else hi=m;}
   const c=cells[lo],lng=c.west+random()*(c.east-c.west);
   const lat=Math.asin(Math.sin(c.south*RAD)+random()*(Math.sin(c.north*RAD)-Math.sin(c.south*RAD)))/RAD;
   const region=this.find(lat,lng);
   if(region&&(!scope||region.name===scope))return {lat,lng};
  }
  throw new Error('所选范围随机选点失败，请稍后重试。');
 }
}
let codeMapPromise;
export function normalizeBoundaryData(iso,data,map) {
 if(!Array.isArray(data?.features))throw new Error('边界文件格式错误：'+iso);
 return {...data,features:data.features.map(f=>{
  const p=f.properties||{};
  let info;
  for(const key of ['id','shapeID','nombre','shapeName','name']) {
   if(p[key]!==undefined && map[iso]?.[key+':'+String(p[key])]){info=map[iso][key+':'+String(p[key])];break;}
  }
  if(!info && (!p.iso3166_2||!p.name))throw new Error('无法识别行政区：'+(p.name||p.nombre||p.shapeName||iso)+'。请使用配套边界文件。');
  return {...f,properties:{...p,iso3166_2:info?.code||p.iso3166_2,name:info?.name||p.name}};
 })};
}
const cache=new Map();
export async function loadCountry(iso) {
 if(!COUNTRIES[iso])throw new Error('不支持的国家');
 if(!cache.has(iso))cache.set(iso,(async()=>{
  const response=await fetch(new URL(`./${iso}-ADM1.geojson`,import.meta.url));
  if(!response.ok)throw new Error(`${COUNTRIES[iso].name}边界读取失败（HTTP ${response.status}），请检查 ${iso}-ADM1.geojson 是否已上传。`);
  const data=await response.json();
  if(data.features?.every(f=>f.properties?.iso3166_2&&f.properties?.name))return new CountryIndex(iso,data);
  codeMapPromise??=fetch(new URL('./data/boundary-code-map.json',import.meta.url)).then(r=>{if(!r.ok)throw new Error('行政区名称映射读取失败，请上传 data/boundary-code-map.json。');return r.json()}).catch(e=>{codeMapPromise=null;throw e});
  return new CountryIndex(iso,normalizeBoundaryData(iso,data,await codeMapPromise));
 })().catch(e=>{cache.delete(iso);throw e}));
 return cache.get(iso);
}
export async function loadTemplate() {
 const r=await fetch(new URL('./data/vali-templates.json',import.meta.url));
 if(!r.ok)throw new Error('Vali 配比文件读取失败，请检查 data/vali-templates.json。');return r.json();
}
