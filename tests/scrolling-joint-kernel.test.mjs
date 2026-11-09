import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';
import*as R from'../ui-src/scrolling-joint/solver/joint-rational.mjs';import*as K from'../ui-src/scrolling-joint/solver/joint-mechanics.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/scrolling-joint-kernel-oracles.json',import.meta.url))),wire=()=>structuredClone(fixture.transitions.find(c=>c.wire.entries[0].slotsLeft===5&&c.wire.scrolls[0].success==='3/5'&&c.wire.scrolls[0].destroyGivenFailure==='0').wire);
const ctx=w=>K.createJointMechanics(w,{enabled:true});
const ordered=rows=>rows.map(row=>({probability:typeof row.probability==='string'?row.probability:R.text(row.probability),state:row.state})).sort((a,b)=>JSON.stringify(a.state).localeCompare(JSON.stringify(b.state)));

test('64 independent Fraction pairs: signed exact arithmetic and compare',()=>{
 for(const c of fixture.arithmetic){const a=R.rational(...c.a.map(BigInt)),b=R.rational(...c.b.map(BigInt));for(const name of['add','sub','mul'])assert.equal(R.text(R[name](a,b)),c[name]);assert.equal(R.compare(a,b),c.compare);if(c.div===null)assert.throws(()=>R.div(a,b),/zero/);else assert.equal(R.text(R.div(a,b)),c.div);}
 assert.equal(R.text(R.add(R.parse('0.1'),R.parse('0.2'))),'3/10');assert(R.equal(R.parse('0.30'),R.parse('3/10')));
 assert.throws(()=>Number(R.ONE));assert.throws(()=>JSON.stringify(R.ONE));assert.throws(()=>R.add({n:1n,d:1n},R.ONE),/owned/);
});
test('rational grammar, probability/money caps, bit bounds and immutability',()=>{
 for(const s of[0.1,'NaN','Infinity','1e3','-1','01','1/0','1.0000000001',true,'1'.repeat(33)])assert.throws(()=>R.parse(s));
 assert.equal(R.text(R.rational(2n,-4n)),'-1/2');assert.throws(()=>R.rational(1n,0n));assert.throws(()=>R.rational(1n<<4096n));assert.throws(()=>R.amount('1000000000001'));assert.throws(()=>R.probability('2'));assert.throws(()=>{R.ONE.n=2n});
 assert.throws(()=>R.sum(new Array(257).fill(R.ONE)));assert.equal(R.text(R.sum([R.parse('1/3'),R.parse('2/3')])),'1');
});
test('defaultOff performs no wire inspection, no economic/source authority implied',()=>{
 let reads=0;const input={get schemaVersion(){reads++;throw Error('must not read')}};assert.deepEqual(K.createJointMechanics(input),{status:'disabled',defaultEnabled:false});assert.equal(reads,0);
 const c=ctx(wire());assert.equal(c.economicInputsAdmitted,false);assert.equal(c.sourceOrGameRulesVerified,false);assert.equal(K.capability.admittedEconomicRecurrence,false);assert.equal(K.capability.quoteOrSourceAuthority,false);
 const w=wire();w.quotes='intentionally not economically validated here';assert.equal(ctx(w).economicInputsAdmitted,false);
});
test('72 exact Python transition cases with Crit/MATT/ATT and all extra stats',()=>{
 assert.equal(fixture.transitions.length,72);
 for(const c of fixture.transitions){const before=JSON.stringify(c.wire),owned=ctx(c.wire),start=owned.entries[0].state,rows=K.transitions(owned,start,'explicit_rule').map(row=>({probability:R.text(row.probability),state:K.toWireState(owned,row.state)}));assert.deepEqual(rows,c.expected);assert.equal(JSON.stringify(c.wire),before);assert(Object.isFrozen(start.stats));}
});
test('12 exact fixed distributions, failure-stop/destruction/nonconsume through24',()=>{
 for(const c of fixture.distributions){const owned=ctx(c.wire),rows=K.distribution(owned,'start','explicit_rule',c.attempts,c.stopAfterFailures).map(row=>({probability:R.text(row.probability),state:K.toWireState(owned,row.state)}));assert.deepEqual(ordered(rows),ordered(c.expected));assert.equal(R.text(R.sum(rows.map(row=>{const p=row.probability;const[n,d='1']=p.split('/');return R.rational(BigInt(n),BigInt(d))}))), '1');}
 const c=fixture.distributions.find(c=>c.attempts===24&&c.wire.scrolls[0].success==='0'&&c.wire.scrolls[0].failureUsesSlot===false),owned=ctx(c.wire),last=K.distribution(owned,'start','explicit_rule',24)[0].state;assert.equal(last.used,24);assert.throws(()=>K.transitions(owned,last,'explicit_rule'),/horizon/);
});
test('full identity keys: ATT/Crit/MATT/extras/slots/upgrades/quality and item stay distinct',()=>{
 const w=wire(),c=ctx(w),s=c.entries[0].state,key=K.priceKey(c,s);
 for(const change of[e=>e.stats['9']++,e=>e.stats['14']++,e=>e.stats['16']++,e=>e.stats['10']++,e=>e.slotsLeft--,e=>e.upgrades++,e=>e.quality='different',e=>e.itemId='other']){const x=wire();change(x.entries[0]);if(x.entries[0].itemId==='other')x.scrolls[0].itemIds=['other'];const y=ctx(x);assert.notEqual(K.priceKey(y,y.entries[0].state),key);}
 const fake=Object.freeze({...s});assert.throws(()=>K.transitions(c,fake,'explicit_rule'),/same_mechanics/);const other=ctx(wire());assert.throws(()=>K.transitions(other,s,'explicit_rule'),/same_mechanics/);
 const boom=wire();boom.scrolls[0].success='0';boom.scrolls[0].destroyGivenFailure='1';const b=ctx(boom),dead=K.transitions(b,b.entries[0].state,'explicit_rule')[0].state;assert.throws(()=>K.priceKey(b,dead),/destroyed/);
});
test('closed own-data fields reject missing stats, eligibility, getters/symbols/prototype/arrays without reading accessor',()=>{
 for(const mutation of[w=>delete w.entries[0].stats['9'],w=>w.entries[0].stats['14']=null,w=>w.scrolls[0].gains['8']=1,w=>w.scrolls[0].itemIds=['unknown'],w=>w.scrolls[0].success=0.6,w=>w.scrolls[0].failureUsesSlot=1,w=>w.limits.decisions=25,w=>w.entries.push(w.entries[0])]){const w=wire();mutation(w);assert.throws(()=>ctx(w));}
 let touched=0;const w=wire();Object.defineProperty(w.entries[0],'stats',{enumerable:true,get(){touched++;throw Error('accessor read')}});assert.throws(()=>ctx(w),/own_data/);assert.equal(touched,0);
 for(const mutate of[w=>w[Symbol('unknown')]=1,w=>Object.setPrototypeOf(w,{bad:true}),w=>Object.defineProperty(w.entries,'0',{get(){touched++;throw Error('array accessor')}})]){const v=wire();mutate(v);assert.throws(()=>ctx(v));}assert.equal(touched,0);
});
test('new branch builder agrees with unchanged legacy ATT outputs, exports and original sample probabilities',()=>{
 const original=fs.readFileSync(new URL('./fixtures/scrolling-joint-legacy-att.js',import.meta.url),'utf8'),sandbox={window:{}};vm.runInNewContext(original,sandbox);const legacy=sandbox.window.AstraPrivateScrolling;
 assert.deepEqual(Object.keys(legacy),['priceKey','distribution','reachable','value','optimize']);
 for(const c of fixture.distributions.filter(c=>c.attempts<=10&&Object.keys(c.wire.scrolls[0].gains).every(k=>k==='16')&&c.wire.scrolls[0].upgradeDeltaSuccess===1&&c.wire.scrolls[0].upgradeDeltaFailure===0)){
  const e=c.wire.entries[0],r=c.wire.scrolls[0],start={stats:{...e.stats},slots:e.slotsLeft,upgrades:e.upgrades},rule={key:'compat',name:'compat',p:Number(R.parse(r.success).n)/Number(R.parse(r.success).d),boom:Number(R.parse(r.destroyGivenFailure).n)/Number(R.parse(r.destroyGivenFailure).d),gain:r.gains['16']??0,cost:0,failureUsesSlot:r.failureUsesSlot};
  const old=legacy.distribution(start,rule,c.attempts,c.stopAfterFailures),context=ctx(c.wire),joint=K.distribution(context,'start','explicit_rule',c.attempts,c.stopAfterFailures);
  const key=s=>JSON.stringify([Object.entries(s.stats).sort(),s.slots??s.slotsLeft,s.upgrades,s.used,s.failures,s.destroyed]);const lookup=new Map(old.map(row=>[key(row.state),row.probability]));
  assert.equal(joint.length,old.length);for(const row of joint){const expected=lookup.get(key(row.state));assert.notEqual(expected,undefined);assert(Math.abs(Number(row.probability.n)/Number(row.probability.d)-expected)<1e-12);}
 }
});
test('distribution follows declared horizon and input state/rules remain frozen',()=>{
 const w=wire();w.limits.decisions=2;const c=ctx(w);assert.throws(()=>K.distribution(c,'start','explicit_rule',3),/attempt_bound/);assert.throws(()=>K.distribution(c,'start','explicit_rule',2,0));assert.throws(()=>K.distribution(c,'absent','explicit_rule',1));assert.throws(()=>{c.rules[0].gains['16']=100});assert.equal(w.entries[0].stats['16'],3);
 const limited=wire();limited.limits.nodeCap=1;const l=ctx(limited);assert.throws(()=>K.distribution(l,'start','explicit_rule',2),/evaluated_state_budget/);
});
