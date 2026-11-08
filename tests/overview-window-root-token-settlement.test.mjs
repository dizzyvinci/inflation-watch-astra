import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,noIO,tick} from './overview-window-fixture.mjs';

test('a single SQL failure clearing settled action token must not permanently hold a cold owner', async t => {
  const g=await setup(t);
  await g.accept(g.seed());
  const original=g.d.exec.bind(g.d);
  let injected=0;
  g.d.exec=(sql,...args)=>{
    if(!injected&&sql.startsWith('UPDATE overview_activity_delivery SET action_token=NULL')){
      injected++;
      throw Error('root_one_transient_clear_failure');
    }
    return original(sql,...args);
  };
  await assert.rejects(g.d.drainOne(noIO),/root_one_transient_clear_failure/);
  await tick();
  assert.equal(injected,1);
  assert.equal(g.d.pool.task,null);
  assert.equal(g.d.pending().phase,'body_write');
  assert.equal(typeof g.d.control().action_token,'string');
  await g.f.restart();
  const result=await g.d.drainOne(noIO);
  console.log(JSON.stringify({injected,settledPhysicalTask:g.d.pool.task===null,
    survivingToken:g.d.control().action_token!==null,status:result.status,
    pendingPhase:g.d.pending().phase,providerCalls:g.f.provider.length}));
  assert.notEqual(result.status,'activity_physical_or_unknown_hold');
});
