import {COUNTRIES} from './geo-core.mjs';
const $=id=>document.getElementById(id);
for(const id of ['ratioCountry','reportView'])for(const [iso,c] of Object.entries(COUNTRIES)){const option=document.createElement('option');option.value=iso;option.textContent=c.name;$(id).appendChild(option);}
let worker=null,lastResult=null,run=0;
function el(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function busy(value){$('analyzeBtn').disabled=value;$('cancelAnalysis').disabled=!value;}
function stop(){run++;worker?.terminate();worker=null;busy(false);}
$('cancelAnalysis').onclick=()=>{stop();$('ratioStatus').textContent='计算已取消，未修改任何生成记录。';};
$('analyzeBtn').onclick=async()=>{
 const files=[...$('ratioFiles').files];if(!files.length){$('ratioStatus').textContent='请先选择 JSON 文件。';return;}
 stop();const job=run;busy(true);lastResult=null;$('reportView').value='ALL';$('ratioCSV').disabled=true;$('ratioResults').replaceChildren();$('ratioSummary').replaceChildren();
 $('ratioStatus').textContent='正在读取地图文件…';
 try{
  const input=[];for(const file of files){const text=await file.text();if(job!==run)return;input.push({name:file.name,text});}
  worker=new Worker(new URL('./ratio-worker.mjs',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
   if(job!==run)return;
   if(data.type==='status')$('ratioStatus').textContent=data.text;
   else if(data.type==='error'){busy(false);$('ratioStatus').textContent='计算失败：'+data.text;worker?.terminate();worker=null;}
   else if(data.type==='result'){
    lastResult=data.result;busy(false);worker?.terminate();worker=null;$('ratioCSV').disabled=false;
    $('ratioStatus').textContent=`已完成 ${data.result.files.length} 个文件，共 ${data.result.totals.input.toLocaleString()} 条地点记录。`;
    renderResult();
    const source=$('templateSource');source.replaceChildren(el('span','Vali 默认一级行政区权重（固定版本 '));
    const a=el('a',data.result.templateCommit.slice(0,10));a.href=`https://github.com/slashP/Vali/blob/${data.result.templateCommit}/src/Vali.Core/SubdivisionWeights.cs`;a.target='_blank';a.rel='noopener';source.append(a,el('span','），按各国权重总和归一化。模板不是全国街景覆盖量。美国统计 50 州及哥伦比亚特区。'));
   }
  };
  worker.onerror=()=>{if(job!==run)return;busy(false);$('ratioStatus').textContent='计算模块加载失败。请检查配套文件是否已上传，并通过 GitHub Pages 或本地 HTTP 服务打开网页。';worker?.terminate();worker=null;};
  worker.postMessage({files:input,country:$('ratioCountry').value,deduplicate:$('deduplicate').checked});
 }catch(error){if(job===run){busy(false);$('ratioStatus').textContent='读取失败：'+error.message;}}
};
const pct=v=>v===null?'—':(v*100).toFixed(2)+'%';
const signed=(n,d=2)=>n===null?'—':(n>0?'+':'')+n.toFixed(d);
function renderResult(){
 if(!lastResult)return;const {totals,countries}=lastResult;
 const summary=$('ratioSummary');summary.replaceChildren();const grid=el('div',undefined,'summary-grid');
 for(const [label,value] of [['输入记录',totals.input],['识别到统计国家',totals.matched],['未匹配 / 范围外',totals.unmatched],['无有效坐标',totals.invalid]]){const card=el('div',undefined,'metric');card.append(el('b',value.toLocaleString()),el('span',label));grid.append(card);}summary.append(grid);
 summary.append(el('p',`发现重复 ${totals.duplicates} 条；${lastResult.deduplicate?`已排除 ${totals.excludedDuplicates} 条`:'当前保留并按题目数统计'}。实际占比的分母是识别到该国的地点总数。`,'muted'));
 const results=$('ratioResults');results.className='';results.replaceChildren();
 const chosen=$('reportView').value,order=$('reportSort').value;let shown=0;
 for(const [iso,country] of Object.entries(countries)){
  if(chosen!=='ALL'&&iso!==chosen)continue;
  if(chosen==='ALL'&&!country.total)continue;
  shown++;const section=el('div',undefined,'country-result');const heading=el('h3',COUNTRIES[iso].name);heading.append(el('small',`有效地点 ${country.total.toLocaleString()} 个 · 占比在本国内计算`));section.append(heading);
  if(country.rows.some(r=>r.expected===null&&r.count))section.append(el('p','部分行政区未被 Vali 模板收录，仍计入该国实际总数，对应倍数显示“模板未收录”。','notice'));
  const rows=[...country.rows].sort(order==='name'?(a,b)=>a.name.localeCompare(b.name):order==='relative'?(a,b)=>(b.relative??-Infinity)-(a.relative??-Infinity)||a.name.localeCompare(b.name):(a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  const wrap=el('div',undefined,'table-wrap'),table=el('table'),thead=el('thead'),tr=el('tr');
  for(const label of ['行政区','数量','实际占比','Vali 模板','相当于模板','相对偏差','差值（百分点）'])tr.append(el('th',label));thead.append(tr);table.append(thead);
  const tbody=el('tbody');for(const row of rows){
   const tr=el('tr'),name=el('td',row.name);name.title=row.code;tr.append(name,el('td',row.count.toLocaleString()),el('td',pct(row.actual)),el('td',pct(row.expected)));
   const td=el('td');if(row.relative!==null){const badge=el('span',row.relative.toFixed(1)+'%','ratio-badge'+(row.relative>120?' high':row.relative<80?' low':''));td.append(badge);}else td.textContent=row.expected===null?'模板未收录':row.expected===0?'模板为 0':'—';
   tr.append(td,el('td',row.relativeDeviation===null?'—':signed(row.relativeDeviation,1)+'%'),el('td',row.percentagePoints===null?'—':signed(row.percentagePoints)));tbody.append(tr);
  }table.append(tbody);wrap.append(table);section.append(wrap);results.append(section);
 }
 if(!shown)results.append(el('p','当前结果中没有该国家的有效地点。','empty'));
}
$('reportView').onchange=renderResult;$('reportSort').onchange=renderResult;
$('ratioCSV').onclick=()=>{
 if(!lastResult)return;const lines=[['国家','行政区','ISO3166-2','数量','本国有效地点数','实际占比(%)','Vali模板占比(%)','相当于模板(%)','相对偏差(%)','差值(百分点)','Vali原始权重']];
 for(const [iso,c] of Object.entries(lastResult.countries))for(const r of c.rows)lines.push([COUNTRIES[iso].name,r.name,r.code,r.count,c.total,r.actual===null?'':r.actual*100,r.expected===null?'':r.expected*100,r.relative??'',r.relativeDeviation??'',r.percentagePoints??'',r.targetWeight??'']);
 const csv='\uFEFF'+lines.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Vali-distribution-comparison.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
};
