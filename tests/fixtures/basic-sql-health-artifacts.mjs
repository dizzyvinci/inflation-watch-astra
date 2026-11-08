import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
let dir=null;
export function basicSqlHealthArtifact(name){if(name!=='ROOT_CAPACITY_CLASSIFICATION_EVIDENCE.json')throw Error('basic_sql_health_artifact_name');if(dir===null){dir=mkdtempSync(path.join(tmpdir(),'astra-basic-sql-health-'));process.once('exit',()=>{const absolute=path.resolve(dir),base=path.resolve(tmpdir());if(path.dirname(absolute)!==base||!path.basename(absolute).startsWith('astra-basic-sql-health-'))throw Error('basic_sql_health_artifact_cleanup_path');rmSync(absolute,{recursive:true,force:true});});}return path.join(dir,name);}
