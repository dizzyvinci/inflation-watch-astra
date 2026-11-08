// Fixed historical test evidence, never a production source/cache fallback.
import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{registerHooks}from'node:module';
const rows=Object.freeze({
 feed:['worker-historical-market-20261104.json','0aa5f6abdd337f7c7448d4ef0ca93859f8e12e5705fb6642fc9ef4efcb125ce6'],
 report:['worker-historical-report-20261104.json','50560c42051f5cc958d4b9c8cb8511c6de02a40bf06b439673aeb9e19870d8f0'],
 version:['worker-historical-version-20261104.json','70a34152a6ecb6202e8d747864682ceb75fd1c301f92776cba14bbd5b57c516f']
});
export function historical(name){const row=rows[name];if(!row)throw Error('unknown_historical_test_input');const raw=readFileSync(new URL(row[0],import.meta.url));if(createHash('sha256').update(raw).digest('hex')!==row[1])throw Error('historical_test_input_changed');return JSON.parse(raw)}
export async function historicalWorker(){
 // Only the real Worker's three compiled data inputs are redirected. Module
 // source, config, identity map, all guards and ordinary imports are unchanged.
 for(const key of Object.keys(rows))historical(key);
 const parent=new URL('../../ops/worker.mjs',import.meta.url).href;
 const paths={'../dist/data.json':rows.report[0],'../dist/version.json':rows.version[0],'../cache/market.json':rows.feed[0]};
 const hook=registerHooks({resolve(spec,context,next){if(context.parentURL===parent&&Object.hasOwn(paths,spec))return{url:new URL(paths[spec],import.meta.url).href,shortCircuit:true};return next(spec,context)}});
 try{return await import(parent)}finally{hook.deregister()}
}
