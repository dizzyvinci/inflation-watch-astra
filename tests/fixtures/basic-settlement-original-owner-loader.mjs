// Test-only migration oracle. Original bytes are data outside the ops closure.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const raw=readFileSync(new URL('./basic-settlement-original-owner.source.txt',import.meta.url));
assert.equal(createHash('sha256').update(raw).digest('hex'),'998863f147f15f19ca2255c1cc8e15e7a8ef9a3262dd2ca91f6c78c38ed112c7');
let text=raw.toString('utf8');
for(const name of ['api-collector-core.mjs','item-recurring-registry.mjs','api-price-item-dto.mjs','api-basic-current-contract.mjs','api-basic-current-storage.mjs']){
 const before="from './"+name+"'",after="from '"+new URL('../../ops/'+name,import.meta.url).href+"'";
 assert.equal(text.split(before).length-1,1);text=text.replace(before,after);
}
const loaded=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
export const BasicCurrentOwner=loaded.BasicCurrentOwner;
