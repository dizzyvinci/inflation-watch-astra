// Offline closed-allowlist tests. Synthetic leaf content tests the path gate;
// the generated-manifest test separately binds every actual production input.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const dependencies=path.dirname(path.dirname(createRequire(import.meta.url).resolve('esbuild/package.json')));
const root=fileURLToPath(new URL('../',import.meta.url));
for(const [leaf,allowed] of [['api-search-identity-contract.mjs',true],['api-search-identity-protocol.mjs',true],['api-search-identity-definition.mjs',true],['api-search-identity-owner.mjs',false],['api-search-identity-protocol-v3.mjs',false],['nested/api-search-identity-contract.mjs',false]]){
 test('official builder '+(allowed?'admits exact leaf ':'rejects unreviewed path ')+leaf,async t=>{
  const d=await fs.mkdtemp(path.join(os.tmpdir(),'astra-search-browser-path-'));t.after(()=>{assert(path.resolve(d).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(d).startsWith('astra-search-browser-path-'));return fs.rm(d,{recursive:true,force:true});});
  await fs.mkdir(path.join(d,'scripts'),{recursive:true});await fs.mkdir(path.join(d,'web'));await fs.mkdir(path.join(d,'ui-src/item-api'),{recursive:true});await fs.mkdir(path.dirname(path.join(d,'ops',leaf)),{recursive:true});
  await fs.copyFile(path.join(root,'scripts/build-item-api.mjs'),path.join(d,'scripts/build-item-api.mjs'));
  await fs.writeFile(path.join(d,'ops',leaf),'export const marker="synthetic-build-gate-only";\n');
  await fs.writeFile(path.join(d,'ui-src/item-api/entry.mjs'),'import {marker} from "../../ops/'+leaf+'";globalThis.__buildGate=marker;\n');
  const result=spawnSync(process.execPath,[path.join(d,'scripts/build-item-api.mjs')],{encoding:'utf8',env:{...process.env,NODE_PATH:dependencies},timeout:15000});
  assert.equal(result.error,undefined);
  if(allowed){assert.equal(result.status,0,result.stderr);const m=JSON.parse(await fs.readFile(path.join(d,'ui-src/item-api/generated-manifest.json'),'utf8'));assert.deepEqual(m.inputs.map(x=>x.path).sort(),['ops/'+leaf,'ui-src/item-api/entry.mjs']);}
  else{assert.notEqual(result.status,0);assert.match(result.stderr,/Unexpected browser dependency: ops\//);await assert.rejects(fs.stat(path.join(d,'web/item-api-preview.js')),{code:'ENOENT'});}
 });
}
