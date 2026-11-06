// Fixed stdin-only production protocol bridge. No network/provider/file data reads.
import {parseApiIndexSnapshot} from './ops/api-index-public-contract.mjs';
import {assertApiIndexSnapshot} from './ops/api-index-calculations.mjs';
import {loadApiIndexDefinition,EXPECTED_DEFINITION_HASH} from './ops/api-index-definition.mjs';
import {sha256} from './ops/api-price-item-dto.mjs';
const need=v=>{if(!v)throw Error('invalid');};
try{
 let packet='';for await(const part of process.stdin){packet+=part;need(Buffer.byteLength(packet)<=900000);}
 const p=JSON.parse(packet);need(p&&Object.keys(p).sort().join(',')==='definitionHash,etag,overviewCapturedAt,pricesCapturedAt,raw,wallNow');
 need(typeof p.raw==='string');const raw=Buffer.from(p.raw,'base64');need(raw.length>0&&raw.length<=600000&&raw.toString('base64')===p.raw);
 need(p.definitionHash===EXPECTED_DEFINITION_HASH&&p.etag==='"api-calculations-'+await sha256(raw)+'"'&&Number.isFinite(p.wallNow));
 const definition=await loadApiIndexDefinition(),dto=await parseApiIndexSnapshot(raw,{expectedDefinitionHash:EXPECTED_DEFINITION_HASH});await assertApiIndexSnapshot(dto,{definition});
 const prices=dto.sources.prices?.capturedAt??'none',overview=dto.sources.overview?.capturedAt??'none';need(prices===p.pricesCapturedAt&&overview===p.overviewCapturedAt);
 for(const capture of [prices,overview])if(capture!=='none')need(Date.parse(capture)<=p.wallNow+300000);
 process.stdout.write(JSON.stringify({snapshotHash:dto.snapshotHash,definitionHash:dto.definitionHash,pricesCapturedAt:prices,overviewCapturedAt:overview}));
}catch{process.stderr.write('local_calculations_contract_invalid');process.exitCode=2;}
