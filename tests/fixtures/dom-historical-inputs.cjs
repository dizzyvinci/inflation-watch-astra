'use strict';
// Test-only Nov4 source report; actual app/HTML/CSS/bundles/assets stay current.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const rows=Object.freeze({report:['worker-historical-report-20261104.json','50560c42051f5cc958d4b9c8cb8511c6de02a40bf06b439673aeb9e19870d8f0'],version:['worker-historical-version-20261104.json','70a34152a6ecb6202e8d747864682ceb75fd1c301f92776cba14bbd5b57c516f']});
exports.createHistoricalDomInputs=function(project){
 const captured={};
 for(const [key,[name,hash]]of Object.entries(rows)){
  const raw=fs.readFileSync(path.join(project,'tests/fixtures',name));
  if(createHash('sha256').update(raw).digest('hex')!==hash)throw Error('historical_dom_input_changed');
  captured[key]=raw.toString('utf8');
 }
 const version=JSON.parse(captured.version);
 if(version.version!==rows.report[1].slice(0,16)||version.data!=='data-'+version.version+'.json'||version.sourceUpdatedAt!==JSON.parse(captured.report).sourceUpdatedAt)throw Error('historical_dom_context_mismatch');
 function report(){return JSON.parse(captured.report)}
 function response(url){
  const route=String(url).replace(/^\//,'');
  const key=route==='version.json'?'version':route==='data.json'||route===version.data?'report':null;
  if(key===null)return null;
  return{ok:true,status:200,json:async()=>JSON.parse(captured[key])};
 }
 return Object.freeze({report,response});
};
