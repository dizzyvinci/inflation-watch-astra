import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
let dir=null;const allowed=new Set(['SQL_QUERY_OBSERVATION.json','OUTER_COMPARISON.json']);
export function tempArtifact(name){if(!allowed.has(name))throw Error('current_dataflow_artifact_name');if(dir===null){dir=mkdtempSync(path.join(tmpdir(),'astra-current-dataflow-artifacts-'));process.once('exit',()=>{const absolute=path.resolve(dir),base=path.resolve(tmpdir());if(path.dirname(absolute)!==base||!path.basename(absolute).startsWith('astra-current-dataflow-artifacts-'))throw Error('current_dataflow_artifact_cleanup_path');rmSync(absolute,{recursive:true,force:true});});}return path.join(dir,name);}
