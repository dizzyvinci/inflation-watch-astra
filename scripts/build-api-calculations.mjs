// Deterministic offline browser generation/check; no provider, transport or publication.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),esbuild=require('esbuild'),sha=b=>createHash('sha256').update(b).digest('hex');
if(esbuild.version!=='0.28.2')throw Error('Exact esbuild0.28.2 is required');
const expected=new Set(['ui-src/api-calculations/entry.mjs','ui-src/api-calculations/client.mjs','ui-src/api-calculations/runtime.mjs','ui-src/api-calculations/view-model.mjs','ops/api-index-public-contract.mjs','ops/api-index-definition-data-v1.json','ops/portable-hash.mjs','ui-src/overview-activity/integration.mjs','ui-src/overview-activity/contract.mjs','ui-src/overview-activity/client.mjs','ui-src/overview-activity/view.mjs','ui-src/item-api/reference-status.mjs']);
const result=await esbuild.build({absWorkingDir:root,entryPoints:['ui-src/api-calculations/entry.mjs'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent',sourcemap:false,metafile:true});
const body="(() => {\n'use strict';\n"+result.outputFiles[0].text+"\n})();\n",inputs=[];
for(const name of Object.keys(result.metafile.inputs).sort()){
 if(!expected.has(name))throw Error('Unexpected calculation browser dependency: '+name);
 inputs.push({path:name,sha256:sha((await fs.readFile(path.join(root,name),'utf8')).replace(/\r\n?/g,'\n'))});
}
if(inputs.length!==expected.size)throw Error('Incomplete calculation browser dependency graph');
const stylePath='ui-src/overview-activity/view.css',styleOutput='web/overview-window-activity.css',styleBody=(await fs.readFile(path.join(root,stylePath),'utf8')).replace(/\r\n?/g,'\n');
const manifest=JSON.stringify({schemaVersion:1,kind:'generated_api_calculations_browser_bundle',buildTool:'esbuild',buildVersion:esbuild.version,inputHashMode:'utf8_lf',target:'es2022',inputs,style:{path:stylePath,sha256:sha(styleBody),output:styleOutput,bytes:Buffer.byteLength(styleBody)},output:{path:'web/api-calculations.js',sha256:sha(body),bytes:Buffer.byteLength(body)}},null,2)+'\n';
const output=path.join(root,'web/api-calculations.js'),proof=path.join(root,'ui-src/api-calculations/generated-manifest.json');
if(process.argv.includes('--check')){
 if(await fs.readFile(output,'utf8')!==body||await fs.readFile(proof,'utf8')!==manifest||await fs.readFile(path.join(root,styleOutput),'utf8')!==styleBody)throw Error('Calculation bundle/source manifest is stale; run npm run build:api-calculations');
 console.log('Generated API calculation bundle/source hashes match');
}else{
 await fs.writeFile(output,body);await fs.writeFile(proof,manifest);await fs.writeFile(path.join(root,styleOutput),styleBody);console.log('Built '+Buffer.byteLength(body)+' bytes from '+inputs.length+' reviewed modules');
}
