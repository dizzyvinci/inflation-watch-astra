// Node24/native SQLite; no cloud credentials, dependencies or outbound network.
// Complemented by separately recorded real local workerd DO/R2 smoke tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ApiCollectorCore,PRIVATE_PREFIX} from '../ops/api-collector-core.mjs';
import {maybeRunApprovedApiSchemaProbe} from '../ops/api-cron-hook.mjs';

const KEY='SYNTHETIC-UNISSUED-KEY-FOR-OFFLINE-TESTS';
const NOW=Date.parse('2026-11-05T00:00:00Z');
const approved={enabled:true,approvalRecorded:true,exclusiveAccountOwnerConfirmed:true,
  grantReference:'synthetic-grant',grantedPerMinute:10,grantedPerDay:100,
  minimumRequestIntervalSeconds:0,higherFrequencyExplicitlyGranted:true,
  allowedOperations:['status','prices','catalogue','overview'],probeRound:'synthetic-round',publicationEnabled:false};

function fixture(t,{config=approved,key=KEY}={}){
  const directory=mkdtempSync(path.join(tmpdir(),'astra-api-native-'));
  const file=path.join(directory,'fixture.sqlite3');let db;
  const objects=new Map();const clock=[NOW];const calls=[];let sequence=0;
  let responder=async()=>new Response('{}',{headers:{'content-type':'application/json'}});
  const bucket={async get(name){const row=objects.get(name);return row?{etag:row.etag,json:async()=>JSON.parse(row.body)}:null;},
    async put(name,body,options){
      const old=objects.get(name);const condition=options?.onlyIf;
      if(condition?.etagDoesNotMatch==='*'&&old)return null;
      if(condition?.etagMatches&&old?.etag!==condition.etagMatches)return null;
      const row={body,etag:String(++sequence)};objects.set(name,row);return row;
    }};
  const env={API_GRANT_JSON:JSON.stringify(config),API_RAW_RECEIPTS:bucket};
  if(key!==null)env.MAPLESTORY_MARKET_APPROVED_API_KEY=key;
  const make=()=>{
    db=new DatabaseSync(file);
    const storage={sql:{exec(sql,...args){const statement=db.prepare(sql);
      const rows=statement.columns().length?statement.all(...args):(statement.run(...args),[]);
      return{toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN IMMEDIATE');
      try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}};
    return new ApiCollectorCore({storage},env,{now:()=>clock[0],jitter:()=>0,fetcher:async(url,options)=>{
      calls.push({url,options});return responder(url,options);}});
  };
  let core=make();
  t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
  return{get core(){return core;},env,objects,clock,calls,
    respond(fn){responder=fn;},restart(){db.close();core=make();},
    receipt(){const object=[...objects].filter(([name])=>name.includes('/receipts/')).at(-1);return object?JSON.parse(object[1].body):null;},
    dbRow(sql,...args){return db.prepare(sql).get(...args);}};
}

test('default-off cron never accesses a namespace or credential and cannot activate requested quota',async()=>{
  const env={};for(const field of ['API_BUDGET_OWNER','MAPLESTORY_MARKET_APPROVED_API_KEY']){
    Object.defineProperty(env,field,{get(){throw new Error('Off must not access binding');}});
  }
  assert.deepEqual(await maybeRunApprovedApiSchemaProbe(env),{status:'disabled'});
  assert.equal((await maybeRunApprovedApiSchemaProbe({API_GRANT_JSON:JSON.stringify({...approved,approvalRecorded:false})})).status,
    'invalid_grant_configuration');
});

test('disabled/missing-key jobs cannot perform an upstream attempt',async t=>{
  const off=fixture(t,{config:{enabled:false,publicationEnabled:false}});
  assert.equal(off.core.enqueueProbeRound('ignored').status,'disabled');
  assert.equal((await off.core.runOne()).status,'disabled');assert.equal(off.core.health().attempts,0);
  const absent=fixture(t,{key:null});assert.equal(absent.core.enqueueProbeRound(approved.probeRound).status,'requires_approved_key');
  assert.equal((await absent.core.runOne()).status,'requires_approved_key');assert.equal(absent.calls.length,0);
});

test('four approved schema probes are idempotent, fixed GET/manual redirect and raw-only',async t=>{
  const f=fixture(t);f.core.enqueueProbeRound(approved.probeRound);f.core.enqueueProbeRound(approved.probeRound);
  for(let i=0;i<4;i++)assert.equal((await f.core.runOne()).status,'success');
  f.core.enqueueProbeRound(approved.probeRound);assert.equal((await f.core.runOne()).status,'idle');
  assert.deepEqual(f.calls.map(row=>new URL(row.url).pathname),['/api/status','/api/prices','/api/items','/api/market/overview']);
  for(const call of f.calls){assert.equal(call.options.method,'GET');assert.equal(call.options.redirect,'manual');
    assert.equal(call.options.headers.Authorization,'Bearer '+KEY);assert.equal(call.options.headers.Cookie,undefined);}
  assert.equal(f.receipt().sourceObservedAt,null);assert.equal(f.receipt().publicationEligible,false);
});

test('rolling minute/day reservations survive SQLite restart',async t=>{
  const f=fixture(t,{config:{...approved,grantedPerMinute:1,grantedPerDay:2}});f.core.enqueueProbeRound(approved.probeRound);
  assert.equal((await f.core.runOne()).status,'success');assert.equal((await f.core.runOne()).status,'budget_wait');
  f.clock[0]+=60_001;assert.equal((await f.core.runOne()).status,'success');f.restart();f.clock[0]+=60_001;
  assert.equal((await f.core.runOne()).status,'budget_wait');assert.equal(f.calls.length,2);
});

test('600-second spacing, Retry-After and credential stop retain last-good through restart',async t=>{
  const f=fixture(t,{config:{...approved,minimumRequestIntervalSeconds:600,higherFrequencyExplicitlyGranted:false}});
  f.core.enqueueProbeRound(approved.probeRound);assert.equal((await f.core.runOne()).status,'success');
  const lastGood=f.objects.get(PRIVATE_PREFIX+'last-good.json').body;f.restart();
  assert.equal((await f.core.runOne()).status,'spacing_wait');f.clock[0]+=600_000;
  f.respond(async()=>new Response(null,{status:429,headers:{'retry-after':'1800'}}));
  assert.equal((await f.core.runOne()).status,'retry');f.restart();
  assert.equal((await f.core.runOne()).status,'backoff');f.clock[0]+=1_800_000;
  f.respond(async()=>new Response(null,{status:403}));assert.equal((await f.core.runOne()).status,'auth_denied');
  f.restart();f.clock[0]+=86_400_000;assert.equal((await f.core.runOne()).status,'authentication_stopped');
  assert.equal(f.objects.get(PRIVATE_PREFIX+'last-good.json').body,lastGood);
});

test('current configured round cannot execute retained previous-round jobs',async t=>{
  const f=fixture(t);f.env.API_GRANT_JSON=JSON.stringify({...approved,probeRound:'a-old'});f.core.enqueueProbeRound('a-old');
  f.env.API_GRANT_JSON=JSON.stringify({...approved,probeRound:'z-new'});f.core.enqueueProbeRound('z-new');
  for(let i=0;i<4;i++)assert.equal((await f.core.runOne()).status,'success');
  assert.equal((await f.core.runOne()).status,'idle');assert.equal(f.receipt().roundReference,'z-new');
  assert.equal(f.dbRow("SELECT COUNT(*) AS n FROM api_jobs WHERE round_ref='a-old' AND state='pending'").n,4);
});

test('original byte envelope reconstructs duplicate keys/unsafe integer tokens exactly',async t=>{
  const raw=' {"id":9007199254740993,"same":1,"same":2}\r\n';const f=fixture(t);
  f.respond(async()=>new Response(raw,{headers:{'content-type':'application/json'}}));f.core.enqueueProbeRound(approved.probeRound);
  assert.equal((await f.core.runOne()).status,'success');const receipt=f.receipt();
  const bytes=Buffer.from(receipt.rawBodyBase64,'base64');assert.deepEqual(bytes,Buffer.from(raw));
  assert.equal(receipt.responseSha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(receipt.responseBytes,bytes.length);assert.equal(receipt.parsedPayloadViewMayBeLossy,true);
});

test('secret references and overwritten escaped echoes cannot enter SQL/R2',async t=>{
  for(const field of ['grantReference','probeRound']){
    const f=fixture(t,{config:{...approved,[field]:KEY}});
    assert.throws(()=>f.core.enqueueProbeRound(field==='probeRound'?KEY:approved.probeRound));
    assert.equal((await f.core.runOne()).status,'invalid_grant_configuration');
    assert.equal(f.dbRow('SELECT COUNT(*) AS n FROM api_jobs').n,0);assert.equal(f.objects.size,0);assert.equal(f.calls.length,0);
  }
  const f=fixture(t);const encoded=[...KEY].map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
  f.respond(async()=>new Response('{"same":"'+encoded+'","same":"overwritten"}',{headers:{'content-type':'application/json'}}));
  f.core.enqueueProbeRound(approved.probeRound);assert.equal((await f.core.runOne()).status,'retry');assert.equal(f.objects.size,0);
});

test('concurrent callers cannot overlap an in-flight transport',async t=>{
  const f=fixture(t);let release;const gate=new Promise(resolve=>{release=resolve;});
  f.respond(async()=>{await gate;return new Response('{}',{headers:{'content-type':'application/json'}});});
  f.core.enqueueProbeRound(approved.probeRound);const first=f.core.runOne();
  assert.equal((await f.core.runOne()).status,'busy');release();assert.equal((await first).status,'success');
  assert.equal(f.calls.length,1);
});
