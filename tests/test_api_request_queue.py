import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from api_request_queue import RequestQueue,Outcome,identity_jobs_from_plan


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'incoming/provider-queue.sqlite3';self.now=100000.0
        self.queue=RequestQueue(self.path,clock=lambda:self.now,jitter=lambda maximum:maximum)

    def tearDown(self):self.temp.cleanup()

    def enable(self,minute=100,day=80000):
        self.queue.configure(approved=True,enabled=True,per_minute=minute,per_day=day,grant_ref='test-only-not-provider-approval')

    def add(self,key='a',priority=100):
        return self.queue.enqueue(job_key=key,scope='fixture',operation_ref='reviewed-fixture-operation',priority=priority)

    def test_disabled_until_explicit_approved_activation(self):
        self.add();calls=[]
        self.assertEqual(self.queue.run_one(lambda job:calls.append(job))['status'],'disabled')
        self.assertEqual(calls,[])
        with self.assertRaises(ValueError):self.queue.configure(enabled=True)
        with self.assertRaises(ValueError):self.queue.configure(approved=True,enabled=True,per_minute=0,per_day=80000,grant_ref='fixture')
        with self.assertRaises(ValueError):self.queue.configure(approved=True,enabled=True,per_minute=True,per_day=80000,grant_ref='fixture')
        self.queue.configure(approved=True,enabled=False,per_minute=100,per_day=80000,grant_ref='fixture')
        self.assertEqual(self.queue.run_one(lambda job:Outcome('success'))['status'],'disabled')
        self.enable();self.assertEqual(self.queue.run_one(lambda job:Outcome('success'))['status'],'success')

    def test_both_budgets_enforced_across_restart_at_boundaries(self):
        self.enable(minute=2,day=3)
        for key in ['a','b','c','d']:self.add(key)
        for _ in range(2):self.assertEqual(self.queue.run_one(lambda job:Outcome('success'))['status'],'success')
        self.now+=59.999;self.assertEqual(self.queue.run_one(lambda job:Outcome('success'))['status'],'budget_wait')
        self.queue=RequestQueue(self.path,clock=lambda:self.now,jitter=lambda maximum:0)
        self.now+=.001;self.assertEqual(self.queue.run_one(lambda job:Outcome('success'))['status'],'success')
        self.now+=60;blocked=self.queue.run_one(lambda job:Outcome('success'))
        self.assertEqual(blocked['status'],'budget_wait');self.assertEqual(blocked['retryAt'],186400)
        self.now=186400;self.assertEqual(self.queue.run_one(lambda job:Outcome('success'))['status'],'success')

    def test_retries_count_and_429_seconds_date_and_jitter_survive_restart(self):
        self.enable(minute=1,day=5);self.add('a');self.add('b')
        first=self.queue.run_one(lambda job:Outcome('retry',retry_after='120',completed_units=2))
        self.assertEqual(first['retryAt'],self.now+120.5)
        self.assertEqual(self.queue.job('a')['completed_units'],2)
        self.queue=RequestQueue(self.path,clock=lambda:self.now,jitter=lambda maximum:maximum)
        self.now+=100;self.assertEqual(self.queue.run_one(lambda job:Outcome('success'))['status'],'backoff')
        self.now=first['retryAt']
        # Same job resumes; its checkpoint is visible to the transport callback.
        seen=[]
        result=self.queue.run_one(lambda job:(seen.append(job['completed_units']) or Outcome('retry',retry_after='Fri, 02 Jan 1970 06:00:00 GMT',completed_units=1)))
        self.assertEqual(seen,[2]);self.assertEqual(self.queue.job('a')['completed_units'],2)
        self.assertEqual(result['retryAt'],108001)
        self.now=result['retryAt'];self.assertEqual(self.queue.run_one(lambda job:Outcome('success',completed_units=3))['status'],'success')
        with sqlite3.connect(self.path) as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0],3)

    def test_priority_idempotency_and_identity_conflict(self):
        self.enable();self.add('later',5);self.add('first',0);self.assertFalse(self.add('first',0))
        with self.assertRaises(ValueError):self.queue.enqueue(job_key='first',scope='changed',operation_ref='reviewed-fixture-operation')
        seen=[]
        for _ in range(2):self.queue.run_one(lambda job:(seen.append(job['job_key']) or Outcome('success',completed_units=1)))
        self.assertEqual(seen,['first','later']);self.assertFalse(self.add('first',0))
        self.assertEqual(self.queue.run_one(lambda job:Outcome('success'))['status'],'idle')
        self.assertEqual(self.queue.job('first')['attempt_count'],1)

    def test_auth_stop_requires_explicit_review_and_does_not_reset_budget(self):
        self.enable(minute=1);self.add('a');self.add('b')
        self.assertEqual(self.queue.run_one(lambda job:Outcome('auth_denied'))['status'],'auth_denied')
        self.queue=RequestQueue(self.path,clock=lambda:self.now)
        self.enable(minute=1)
        self.assertEqual(self.queue.run_one(lambda job:Outcome('success'))['status'],'authentication_stopped')
        self.queue.resume_after_credentials_review()
        self.assertEqual(self.queue.run_one(lambda job:Outcome('success'))['status'],'budget_wait')
        self.now+=60;self.assertEqual(self.queue.run_one(lambda job:Outcome('success'))['status'],'success')

    def test_interrupted_lease_restart_and_stale_result_cannot_publish(self):
        self.enable();self.add()
        with self.assertRaises(KeyboardInterrupt):self.queue.run_one(lambda job:(_ for _ in ()).throw(KeyboardInterrupt()),lease_seconds=10)
        original=self.queue.job('a');self.assertEqual(original['state'],'running')
        self.queue=RequestQueue(self.path,clock=lambda:self.now)
        self.assertEqual(self.queue.run_one(lambda job:Outcome('success'))['status'],'leased')
        self.now+=10
        self.assertEqual(self.queue.run_one(lambda job:Outcome('success',completed_units=1))['status'],'success')
        self.assertEqual(self.queue.job('a')['attempt_count'],2)
        with self.assertRaises(RuntimeError):self.queue._finish(original,Outcome('success',completed_units=999))
        self.assertEqual(self.queue.job('a')['completed_units'],1)
        with sqlite3.connect(self.path) as db:self.assertEqual(db.execute('SELECT result FROM attempts ORDER BY id').fetchall(),[('interrupted',),('success',)])

    def test_os_singleflight_even_after_active_lease_expiry(self):
        self.enable();self.add('a');self.add('b');started=threading.Event();release=threading.Event();results=[]
        def execute(job):started.set();release.wait(3);return Outcome('success')
        thread=threading.Thread(target=lambda:results.append(self.queue.run_one(execute,lease_seconds=1)));thread.start()
        try:
            self.assertTrue(started.wait(3));self.now+=10
            another=RequestQueue(self.path,clock=lambda:self.now)
            self.assertEqual(another.run_one(lambda job:self.fail('Concurrent request'))['status'],'busy')
        finally:release.set();thread.join(3)
        self.assertFalse(thread.is_alive());self.assertEqual(results[0]['status'],'success')

    def test_transport_secrets_raw_payload_invalid_result_not_persisted(self):
        self.enable();self.add()
        def fail(job):raise RuntimeError('Authorization: Bearer TOP_SECRET https://provider.example/?api_key=TOP_SECRET')
        result=self.queue.run_one(fail);self.assertEqual(result['status'],'retry')
        self.now=result['retryAt'];self.queue.run_one(lambda job:{'payload':'TOP_SECRET'})
        with sqlite3.connect(self.path) as db:
            dump='\n'.join(db.iterdump());self.assertNotIn('TOP_SECRET',dump);self.assertNotIn('Authorization',dump)
        with self.assertRaises(TypeError):self.queue.enqueue(job_key='extra',scope='fixture',operation_ref='fixture',api_key='TOP_SECRET')
        with self.assertRaises(ValueError):self.queue.enqueue(job_key='url',scope='fixture',operation_ref='https://provider.example/?key=TOP_SECRET')

    def test_bad_retry_header_and_invalid_jitter_fail_safe(self):
        self.enable();self.add()
        for header in ['invalid',float('inf'),'-100']:
            result=self.queue.run_one(lambda job:Outcome('retry',retry_after=header));self.assertGreater(result['retryAt'],self.now);self.now=result['retryAt']
        self.queue.jitter=lambda maximum:float('inf')
        # Invalid injected jitter falls back to the exponential wait, never zero.
        result=self.queue.run_one(lambda job:Outcome('retry'))
        self.assertEqual(result['retryAt'],self.now+16)
        self.assertEqual(self.queue.job('a')['state'],'pending')

    def test_jitter_failure_does_not_strand_reserved_retry(self):
        self.enable();self.add()
        def unavailable_entropy(maximum):raise RuntimeError('Private transport/entropy detail must not be retained')
        self.queue.jitter=unavailable_entropy
        result=self.queue.run_one(lambda job:Outcome('retry',completed_units=2))
        self.assertEqual(result['retryAt'],self.now+2)
        self.assertEqual(self.queue.job('a')['state'],'pending')
        self.assertEqual(self.queue.job('a')['completed_units'],2)
        self.now=result['retryAt']
        self.assertEqual(self.queue.run_one(lambda job:Outcome('success',completed_units=3))['status'],'success')
        with sqlite3.connect(self.path) as db:self.assertEqual(db.execute('SELECT result FROM attempts ORDER BY id').fetchall(),[('retry',),('success',)])

    def test_backward_clock_cannot_reset_recent_request_budgets(self):
        self.enable(minute=1);self.add('a');self.add('b');self.queue.run_one(lambda job:Outcome('success'))
        self.now-=100
        result=self.queue.run_one(lambda job:Outcome('success'))
        self.assertEqual(result['status'],'budget_wait');self.assertEqual(result['retryAt'],100060)

    def test_explicit_identity_plans_preserve_counts_and_do_not_invent_routes(self):
        root=Path(__file__).resolve().parents[1]
        # Source artifacts are optional in a clean public checkout. Core contract
        # assertions below always run using a self-contained explicit fixture.
        plan={'planHash':'a'*64,'requestCount':2,'requests':[{'expectedItemId':1,'expectedItemName':'Goods','cohort':'goods','tool':'browser_tool'}, {'expectedItemId':2,'expectedItemName':'Cash','cohort':'cash'}]}
        jobs=identity_jobs_from_plan(plan,namespace='reviewed-plan',operation_ref='operator-reviewed-operation')
        self.assertEqual([job['priority'] for job in jobs],[0,1]);self.assertEqual([job['scope'] for job in jobs],['priority_goods','priority_fixed_cash'])
        self.assertTrue(all('tool' not in job and 'arguments' not in job and 'url' not in job for job in jobs))
        for job in jobs:self.queue.enqueue(**job)
        self.assertEqual(self.queue.run_one(lambda job:self.fail('Unapproved plans cannot run'))['status'],'disabled')
        with self.assertRaises(ValueError):identity_jobs_from_plan({**plan,'requestCount':3},namespace='x',operation_ref='y')
        with self.assertRaises(ValueError):identity_jobs_from_plan({**plan,'requests':[plan['requests'][0]]*2},namespace='x',operation_ref='y')
        unknown={**plan,'requestCount':1,'requests':[{'expectedItemId':1,'expectedItemName':'Unclassified'}]}
        with self.assertRaises(ValueError):identity_jobs_from_plan(unknown,namespace='x',operation_ref='y')
        self.assertEqual(identity_jobs_from_plan(unknown,namespace='x',operation_ref='y',default_scope='priority_supplemental_cash')[0]['priority'],2)
        path=root/'incoming/scanner-capture-plan.json'
        if path.exists():
            observed=identity_jobs_from_plan(json.loads(path.read_text()),namespace='fixed79',operation_ref='unconnected-reviewed-adapter')
            self.assertEqual(len(observed),79);self.assertEqual(sum(job['priority']==0 for job in observed),50);self.assertEqual(sum(job['priority']==1 for job in observed),29)
        supplemental=root.parent.parent/'work/nov4-cash-supplemental-capture-plan.json'
        if supplemental.exists():
            observed=identity_jobs_from_plan(json.loads(supplemental.read_text()),namespace='nov4-50',operation_ref='unconnected-reviewed-adapter',default_scope='priority_supplemental_cash')
            self.assertEqual(len(observed),50);self.assertTrue(all(job['priority']==2 for job in observed))


if __name__=='__main__':unittest.main()
