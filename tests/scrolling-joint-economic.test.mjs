import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{evaluateManualBytes,evaluateManualScenario,capability}from'../ui-src/scrolling-joint/solver/joint-economics.mjs';
import{decodeManualBytes,admitManualWire}from'../ui-src/scrolling-joint/solver/joint-manual-wire.mjs';
const source=JSON.parse(fs.readFileSync(new URL('./fixtures/scrolling-joint-economic-oracles.json',import.meta.url))),enc=new TextEncoder(),dec=new TextDecoder();
const clone=v=>structuredClone(v),read=raw=>JSON.parse(dec.decode(raw)),evaluate=w=>read(evaluateManualBytes(enc.encode(JSON.stringify(w)),{enabled:true}));
test('complete byte-payload path exactly matches Python economic outputs and projections',()=>{
 for(const c of source.cases){const before=JSON.stringify(c.wire),actual=evaluate(c.wire);assert.deepEqual(actual,c.expected,c.name);assert.equal(JSON.stringify(c.wire),before,c.name+' input mutation');assert.deepEqual(read(evaluateManualScenario(c.wire,{enabled:true})),actual,c.name+' object parity');assert(evaluateManualBytes(enc.encode(before),{enabled:true}).byteLength<=16384);}
});
test('known94/190 policies survive unknown alternatives without optimum or zero fill',()=>{
 for(const[name,value]of[['known94-global-unknown','94'],['stochastic-known94-global-unknown','94'],['rebuy-known-policy190-global-unknown','190']]){const c=source.cases.find(c=>c.name===name),r=evaluate(c.wire);assert.equal(r.status,'unavailable');assert.equal(r.optimalExpectedNet,null);assert.equal(r.bestKnownNet,value);assert.equal(r.marketProfitClaim,false);assert.equal(r.selectedAction,'scroll:GFA_assumed');}
 const r=evaluate(source.cases.find(c=>c.name==='positive-probability-terminal-missing').wire);assert.equal(r.optimalExpectedNet,null);assert.equal(r.bestKnownNet,'0');assert.equal(r.selectedAction,'do_not_enter');
});
test('11/17/23 full five-slot cycles, gross stock caps and bounded-only optimum',()=>{
 for(const[count,horizon,net]of[[2,11,'170'],[3,17,'255'],[4,23,'340']]){const r=evaluate(source.cases.find(c=>c.name==='full-five-slot-cycles-'+count).wire);assert.equal(r.optimalExpectedNet,net);assert.equal(r.optimizationScope.decisions,horizon);assert.equal(r.optimizationScope.allTimeOptimum,false);assert.equal(r.assumptions.saleProceedsReinvested,false);assert.equal(r.fixedPolicyBreakEven.find(x=>x.kind==='buy').expectedPolicyQuantity,String(count));assert.equal(r.fixedPolicyBreakEven.find(x=>x.kind==='scroll').expectedPolicyQuantity,String(count*5));}
 const r=evaluate(source.cases.find(c=>c.name==='exact-node-cap-refusal').wire);assert.equal(r.status,'unavailable');assert.equal(r.reason,'state_budget_exceeded');assert(!Object.hasOwn(r,'optimalExpectedNet'));
});
test('deterministic sale/rule/entry and global-abstain tie order follows Python',()=>{
 assert.equal(evaluate(source.cases.find(c=>c.name==='tie-sell-before-scroll').wire).selectedAction,'sell_stop');
 for(const key of['first','second'])assert.equal(evaluate(source.cases.find(c=>c.name==='tie-rule-order-'+key).wire).selectedAction,'scroll:'+key);
 for(const reverse of[false,true])assert.equal(evaluate(source.cases.find(c=>c.name==='tie-entry-order-'+(reverse?'True':'False')).wire).selectedEntry,reverse?'second':'first');
 assert.equal(evaluate(source.cases.find(c=>c.name==='fee-sign-flip-abstain').wire).selectedAction,'do_not_enter');
});
test('defaultOff inspects neither bytes nor accessor input and contains no website/source grant',()=>{
 let reads=0;const value={get entries(){reads++;throw Error('MUST_NOT_READ')}};
 assert.equal(read(evaluateManualScenario(value)).status,'disabled');assert.equal(read(evaluateManualBytes(value)).status,'disabled');assert.equal(reads,0);assert.equal(capability.websiteIntegrationImplemented,false);assert.equal(capability.sourceOrGameRulesVerified,false);assert.equal(capability.globalOptimalPriceFrontier,false);
});
test('strict JSON rejects duplicate escaped keys, floats, trailing, body/depth/encoding hazards',()=>{
 const inputs=['{"schemaVersion":1,"schemaVersion":1}','{"schemaVersion":1,"schema\\u0056ersion":1}','{"a":0.5}','{"a":1e0}','{"a":01}','{"a":NaN}','{} {}','['.repeat(14)+'0'+']'.repeat(14),'[1,]','{"a":"\\u0000"}'];
 for(const value of inputs){const out=read(evaluateManualBytes(enc.encode(value),{enabled:true}));assert.equal(out.status,'unavailable',value);assert.equal(out.marketProfitClaim,false);}
 for(const bytes of[new Uint8Array(),new Uint8Array(65537),new Uint8Array([255]),new Uint8Array([239,187,191,123,125])])assert.equal(read(evaluateManualBytes(bytes,{enabled:true})).status,'unavailable');
 assert.throws(()=>decodeManualBytes(enc.encode('{"a":true,"a":false}')),/duplicate/);
 assert.throws(()=>decodeManualBytes(enc.encode('{"schemaVersion":1,"schema\\u0056ersion":1}')),/duplicate/);
});
test('full economic admission refuses mechanical-only malformed money, quotes, fees, stock and clocks',()=>{
 const baseline=source.cases.find(c=>c.name==='known94-global-unknown').wire;
 const edits=[w=>w.currency='NX',w=>w.acknowledged=false,w=>w.grossBudget=6,w=>w.fees.rate='1',w=>w.scrolls[0].cost='1/3',w=>w.entries[0].stock=true,w=>w.scrolls[0].stock=-1,w=>w.quotes.push(clone(w.quotes[0])),w=>w.quotes[0].stats['9']=null,w=>w.entries[0].stats['9']=undefined,w=>w.privateActor='SECRET_CANARY',w=>w.limits.decisions=25,w=>w.limits.nodeCap=0,w=>w.entries[0].cost='1000000000001'];
 for(const edit of edits){const w=clone(baseline);edit(w);const actual=read(evaluateManualScenario(w,{enabled:true}));assert.equal(actual.status,'unavailable');assert(!JSON.stringify(actual).includes('SECRET_CANARY'));}
 const c=clone(source.cases.find(c=>c.name==='original-microsecond-source-clocks').wire);c.quotes[0].evidence.sourceObservedAt='2026-11-05T21:13:49.000003Z';assert.equal(evaluate(c).status,'unavailable');c.quotes[0].evidence.sourceObservedAt=null;c.quotes[0].evidence.capturedAt='2026-02-30T00:00:00Z';assert.equal(evaluate(c).status,'unavailable');
});
test('own-data admission never invokes accessor or allows prototype/cycle/symbol injection',()=>{
 const w=clone(source.cases[0].wire);let touched=0;Object.defineProperty(w.entries[0],'cost',{enumerable:true,get(){touched++;throw Error('SECRET_CANARY')}});const r=read(evaluateManualScenario(w,{enabled:true}));assert.equal(r.status,'unavailable');assert.equal(touched,0);assert(!JSON.stringify(r).includes('SECRET_CANARY'));
 for(const edit of[v=>Object.setPrototypeOf(v,{bad:true}),v=>v[Symbol('x')]=1,v=>v.quotes.push(v)]){const v=clone(source.cases[0].wire);edit(v);assert.equal(read(evaluateManualScenario(v,{enabled:true})).status,'unavailable');}
 const admitted=admitManualWire(source.cases[0].wire);assert(Object.isFrozen(admitted.wire));assert(Object.isFrozen(admitted.wire.entries[0].stats));
 const proxy=new Proxy({}, {getPrototypeOf(){throw Error('private_canary_message')}}),out=read(evaluateManualScenario(proxy,{enabled:true}));assert.equal(out.reason,'invalid_manual_scenario');assert(!JSON.stringify(out).includes('private_canary_message'));
});
