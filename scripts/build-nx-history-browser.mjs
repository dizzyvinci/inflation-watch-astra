// Offline reproducible build. esbuild is the existing exact devDependency.
import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';import path from 'node:path';import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),esbuild=require('esbuild');
export async function buildNxHistoryBrowser({write=true}={}){
 if(esbuild.version!=='0.28.2')throw Error('pinned_esbuild');
 const result=await esbuild.build({absWorkingDir:root,entryPoints:['browser/nx-history-entry.mjs'],write:false,bundle:true,format:'iife',platform:'browser',target:'es2022',charset:'utf8',legalComments:'none',logLevel:'silent'});
 const text=result.outputFiles[0].text;if(!text.startsWith('(() => {\n'))throw Error('unexpected_iife');
 const output=text.replace('(() => {\n',"(() => {\n  'use strict';\n");if(write)fs.writeFileSync(path.join(root,'web/nx-history-browser.js'),output);return output;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildNxHistoryBrowser();
