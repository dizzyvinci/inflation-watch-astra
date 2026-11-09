// Offline maintained bundle: exact public manual-math graph, no new dependency.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),req=createRequire(import.meta.url),esbuild=req('esbuild'),sha=v=>createHash('sha256').update(v).digest('hex');
if(esbuild.version!=='0.28.2')throw Error('expected_esbuild_0_28_2');
const approved=['site-entry.mjs','page.mjs','client-reference.mjs','scenario-model.mjs','manual-examples.json','solver/joint-rational.mjs','solver/joint-mechanics.mjs','solver/joint-manual-wire.mjs','solver/joint-economics.mjs'].map(n=>'ui-src/scrolling-joint/'+n).sort();
const built=await esbuild.build({absWorkingDir:root,entryPoints:['ui-src/scrolling-joint/site-entry.mjs'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',metafile:true,logLevel:'silent'});
const names=Object.keys(built.metafile.inputs).sort();if(JSON.stringify(names)!==JSON.stringify(approved))throw Error('unreviewed_or_missing_scrolling_input');
const body=Buffer.concat([Buffer.from("(() => {\n'use strict';\n"),built.outputFiles[0].contents,Buffer.from('\n})();\n')]),inputs=[];
for(const n of names)inputs.push({path:n,sha256:sha((await fs.readFile(path.join(root,n),'utf8')).replace(/\r\n?/g,'\n'))});
const output={path:'web/scrolling-preview.js',bytes:body.length,sha256:sha(body)},manifest=JSON.stringify({schemaVersion:1,kind:'generated_private_joint_scrolling_preview',buildVersion:esbuild.version,inputHashMode:'utf8_lf',entry:approved.find(n=>n.endsWith('/site-entry.mjs')),inputs,output,defaultEnabled:false,manualOnly:true,requiresExistingPrivateWorkspace:true,sourceRequests:0,newTimers:0},null,2)+'\n';
const out=path.join(root,output.path),mp=path.join(root,'ui-src/scrolling-joint/generated-manifest.json');
if(process.argv.includes('--check')){if(!body.equals(await fs.readFile(out))||manifest!==await fs.readFile(mp,'utf8'))throw Error('scrolling_generated_mismatch');}else{await fs.writeFile(out,body);await fs.writeFile(mp,manifest);}
console.log(JSON.stringify({check:process.argv.includes('--check'),...output,inputs:inputs.length}));
