import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),esbuild=require('esbuild'),sha=b=>createHash('sha256').update(b).digest('hex');
if(esbuild.version!=='0.28.2')throw Error('Exact existing esbuild0.28.2 required; do not install a different build');
const result=await esbuild.build({absWorkingDir:root,entryPoints:['ui-src/upcoming-announcements/entry.mjs'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent',sourcemap:false,metafile:true});
const body="(() => {\n'use strict';\n"+result.outputFiles[0].text+"\n})();\n",inputs=[];
for(const name of Object.keys(result.metafile.inputs).sort()){
 if(!/^ui-src\/upcoming-announcements\/(?:entry\.mjs|contract\.mjs|feed\.json)$/.test(name))throw Error('Unexpected build dependency');
 inputs.push({path:name,sha256:sha((await fs.readFile(path.join(root,name),'utf8')).replace(/\r\n?/g,'\n'))});
}
const manifest=JSON.stringify({schemaVersion:1,kind:'generated_upcoming_announcements_browser_bundle',buildTool:'esbuild',buildVersion:esbuild.version,inputHashMode:'utf8_lf',inputs,output:{path:'web/upcoming-announcements.js',sha256:sha(body),bytes:Buffer.byteLength(body)}},null,2)+'\n';
const target=path.join(root,'web/upcoming-announcements.js'),proof=path.join(root,'ui-src/upcoming-announcements/generated-manifest.json');
if(process.argv.includes('--check')){if(await fs.readFile(target,'utf8')!==body||await fs.readFile(proof,'utf8')!==manifest)throw Error('Generated announcement bundle is stale');console.log('Generated announcement bytes and3inputs match');}
else{await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,body);await fs.writeFile(proof,manifest);console.log('Built '+Buffer.byteLength(body)+' bytes from '+inputs.length+' inputs');}
