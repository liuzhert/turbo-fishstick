import {COUNTRIES,loadCountry,loadTemplate} from './geo-core.mjs';
import {analyzeFiles} from './ratio-core.mjs';
self.onmessage=async({data})=>{
 try{
  const indexes={};const isos=data.country==='ALL'?Object.keys(COUNTRIES):[data.country];
  for(const iso of isos){self.postMessage({type:'status',text:`正在准备${COUNTRIES[iso].name}的行政区…`});indexes[iso]=await loadCountry(iso);}
  const template=await loadTemplate();
  const result=await analyzeFiles(data.files,indexes,template,{deduplicate:data.deduplicate,
    progress:({processed})=>self.postMessage({type:'status',text:`已核算 ${processed.toLocaleString()} 个地点…`})});
  self.postMessage({type:'result',result});
 }catch(e){self.postMessage({type:'error',text:e.message});}
};
