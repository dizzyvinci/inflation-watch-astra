"""Disabled-by-default durable request queue; no provider client or credentials.

The transport callback must implement a separately reviewed provider contract.
Each callback may make at most one upstream attempt, with no hidden retries or
redirects. A queue reservation cannot meter arbitrary network calls made outside
that reviewed transport. Include a collection-round identity in recurring job
namespaces; replaying a completed job key intentionally does not run it again.
Existing browser capture plans may supply identities, never server API permission.
All attempted requests count against sliding 60-second AND 24-hour budgets.
"""
import contextlib
import datetime as dt
import email.utils
import hashlib
import json
import math
import os
import random
import re
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

_REF=re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$')
_KINDS={'success','retry','auth_denied','permanent_error'}


def _ref(value):
    if not isinstance(value,str) or not _REF.fullmatch(value):raise ValueError('Use a nonsecret reference label, not a URL, query, header or credential')
    return value


def _integer(value,minimum=0):
    if isinstance(value,bool) or not isinstance(value,int) or not minimum<=value<2**53:raise ValueError('Expected a bounded whole number')
    return value


def _time(value):
    if isinstance(value,bool) or not isinstance(value,(float,int)) or not math.isfinite(value) or value<0:raise ValueError('Expected a finite nonnegative clock')
    return float(value)


@dataclass(frozen=True)
class Outcome:
    """Transport-neutral result. Never pass raw payloads, headers or exceptions."""
    kind:str
    retry_after:object=None  # Seconds or HTTP date from the reviewed transport.
    completed_units:int=0  # Monotonic local work checkpoint, not invented API cursor.


@contextlib.contextmanager
def _runner_lock(path):
    path.parent.mkdir(parents=True,exist_ok=True)
    handle=path.open('a+b');locked=False
    try:
        if os.name=='nt':
            import msvcrt
            if path.stat().st_size==0:handle.write(b'0');handle.flush()
            handle.seek(0)
            try:msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1);locked=True
            except OSError:pass
        else:
            import fcntl
            try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB);locked=True
            except BlockingIOError:pass
        yield locked
    finally:
        if locked:
            if os.name=='nt':handle.seek(0);msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1)
            else:fcntl.flock(handle,fcntl.LOCK_UN)
        handle.close()


class RequestQueue:
    def __init__(self,path,clock=time.time,jitter=None):
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
        self.clock=clock;self.jitter=jitter or (lambda maximum:random.SystemRandom().uniform(0,maximum))
        with self._db() as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS control(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 0,
                approved INTEGER NOT NULL DEFAULT 0,minute_cap INTEGER,day_cap INTEGER,grant_ref TEXT,
                blocked_until REAL NOT NULL DEFAULT 0,auth_stopped INTEGER NOT NULL DEFAULT 0);
              INSERT OR IGNORE INTO control(id) VALUES(1);
              CREATE TABLE IF NOT EXISTS jobs(job_key TEXT PRIMARY KEY,scope TEXT NOT NULL,operation_ref TEXT NOT NULL,
                item_id INTEGER,item_name TEXT,plan_hash TEXT,priority INTEGER NOT NULL,identity_hash TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'pending',attempt_count INTEGER NOT NULL DEFAULT 0,
                completed_units INTEGER NOT NULL DEFAULT 0,available_at REAL NOT NULL,created_at REAL NOT NULL,
                lease_until REAL,attempt_id INTEGER,last_result TEXT);
              CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(state,available_at,priority,created_at,job_key);
              CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY,job_key TEXT NOT NULL,at REAL NOT NULL,result TEXT);
              CREATE INDEX IF NOT EXISTS attempts_clock ON attempts(at);
            ''')

    def _db(self):
        db=sqlite3.connect(self.path,timeout=10,isolation_level=None)
        db.row_factory=sqlite3.Row;db.execute('PRAGMA busy_timeout=10000');db.execute('PRAGMA synchronous=FULL')
        return contextlib.closing(db)

    def configure(self,*,approved=False,enabled=False,per_minute=None,per_day=None,grant_ref=None):
        if not isinstance(approved,bool) or not isinstance(enabled,bool):raise ValueError('Approval and activation must be explicit booleans')
        if approved:
            _integer(per_minute,1);_integer(per_day,1);_ref(grant_ref)
        elif enabled:raise ValueError('Unapproved budgets cannot be activated')
        with self._db() as db:
            db.execute('UPDATE control SET approved=?,enabled=?,minute_cap=?,day_cap=?,grant_ref=? WHERE id=1',
                       (approved,enabled,per_minute if approved else None,per_day if approved else None,grant_ref if approved else None))
        # Reconfiguration deliberately cannot erase attempts, Retry-After or auth stop.

    def resume_after_credentials_review(self):
        """Explicit operator action after a valid approved credential is supplied elsewhere."""
        with self._db() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('UPDATE control SET auth_stopped=0 WHERE id=1')
            db.execute("UPDATE jobs SET state='pending' WHERE state='auth_stopped'")
            db.commit()

    def enqueue(self,*,job_key,scope,operation_ref,priority=100,item_id=None,item_name=None,plan_hash=None):
        _ref(job_key);_ref(scope);_ref(operation_ref);_integer(priority)
        if item_id is not None:_integer(item_id,1)
        if item_name is not None and (not isinstance(item_name,str) or not item_name.strip() or len(item_name)>200 or any(ord(c)<32 for c in item_name)):raise ValueError('Invalid public item name')
        if plan_hash is not None and (not isinstance(plan_hash,str) or not re.fullmatch('[a-f0-9]{64}',plan_hash)):raise ValueError('Invalid plan hash')
        identity=json.dumps([scope,operation_ref,item_id,item_name,plan_hash],ensure_ascii=False,separators=(',',':'))
        digest=hashlib.sha256(identity.encode()).hexdigest();now=_time(self.clock())
        with self._db() as db:
            db.execute('BEGIN IMMEDIATE');prior=db.execute('SELECT identity_hash FROM jobs WHERE job_key=?',(job_key,)).fetchone()
            if prior:
                if prior['identity_hash']!=digest:raise ValueError('An idempotent job key cannot change identity')
                db.commit();return False
            db.execute('INSERT INTO jobs(job_key,scope,operation_ref,item_id,item_name,plan_hash,priority,identity_hash,available_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
                       (job_key,scope,operation_ref,item_id,item_name,plan_hash,priority,digest,now,now))
            db.commit();return True

    def job(self,key):
        with self._db() as db:
            row=db.execute('SELECT * FROM jobs WHERE job_key=?',(_ref(key),)).fetchone()
            return dict(row) if row else None

    def _claim(self,lease_seconds):
        now=_time(self.clock());_integer(lease_seconds,1)
        with self._db() as db:
            db.execute('BEGIN IMMEDIATE');config=db.execute('SELECT * FROM control').fetchone()
            if not config['approved'] or not config['enabled']:return {'status':'disabled'}
            if config['auth_stopped']:return {'status':'authentication_stopped'}
            if now<config['blocked_until']:return {'status':'backoff','retryAt':config['blocked_until']}
            # OS runner lock proves an expired owner's callback is no longer running.
            expired=db.execute("SELECT job_key,attempt_id FROM jobs WHERE state='running' AND lease_until<=?",(now,)).fetchall()
            for row in expired:
                db.execute("UPDATE attempts SET result='interrupted' WHERE id=? AND result IS NULL",(row['attempt_id'],))
                db.execute("UPDATE jobs SET state='pending',last_result='interrupted',lease_until=NULL,attempt_id=NULL WHERE job_key=?",(row['job_key'],))
            running=db.execute("SELECT lease_until FROM jobs WHERE state='running' LIMIT 1").fetchone()
            if running:return {'status':'leased','retryAt':running['lease_until']}
            waits=[]
            for seconds,cap in [(60,config['minute_cap']),(86400,config['day_cap'])]:
                count=db.execute('SELECT COUNT(*) FROM attempts WHERE at>?',(now-seconds,)).fetchone()[0]
                if count>=cap:
                    # Include retained future timestamps after a backward clock jump.
                    at=db.execute('SELECT at FROM attempts WHERE at>? ORDER BY at DESC LIMIT 1 OFFSET ?',(now-seconds,cap-1)).fetchone()[0]
                    waits.append(at+seconds)
            if waits:return {'status':'budget_wait','retryAt':max(waits)}
            row=db.execute("SELECT * FROM jobs WHERE state='pending' AND available_at<=? ORDER BY priority,created_at,job_key LIMIT 1",(now,)).fetchone()
            if not row:return {'status':'idle'}
            attempt=db.execute('INSERT INTO attempts(job_key,at) VALUES(?,?)',(row['job_key'],now)).lastrowid
            db.execute("UPDATE jobs SET state='running',attempt_count=attempt_count+1,lease_until=?,attempt_id=? WHERE job_key=?",(now+lease_seconds,attempt,row['job_key']))
            job=dict(db.execute('SELECT * FROM jobs WHERE job_key=?',(row['job_key'],)).fetchone());db.commit()
            return {'status':'claimed','job':job}

    def _finish(self,job,result):
        now=_time(self.clock())
        if not isinstance(result,Outcome) or result.kind not in _KINDS:raise ValueError('Transport must return a validated Outcome')
        _integer(result.completed_units)
        wait=0
        if result.kind=='retry':
            base=min(3600,2**min(job['attempt_count'],11))
            try:jitter=self.jitter(min(base/4,60))
            except Exception:jitter=0  # Entropy/injected jitter failures must not strand the attempt.
            if isinstance(jitter,bool) or not isinstance(jitter,(int,float)) or not math.isfinite(jitter) or not 0<=jitter<=min(base/4,60):jitter=0
            wait=now+base+jitter
            retry=result.retry_after
            try:
                seconds=float(retry)
                if math.isfinite(seconds) and seconds>=0:wait=max(wait,now+seconds+jitter)
            except (ValueError,TypeError):
                try:wait=max(wait,email.utils.parsedate_to_datetime(retry).timestamp()+jitter)
                except (ValueError,TypeError,OverflowError,AttributeError):pass
        state={'success':'complete','retry':'pending','auth_denied':'auth_stopped','permanent_error':'failed'}[result.kind]
        with self._db() as db:
            db.execute('BEGIN IMMEDIATE')
            current=db.execute('SELECT attempt_id,state FROM jobs WHERE job_key=?',(job['job_key'],)).fetchone()
            if current['attempt_id']!=job['attempt_id'] or current['state']!='running':raise RuntimeError('Stale attempt cannot overwrite a checkpoint')
            db.execute('UPDATE attempts SET result=? WHERE id=?',(result.kind,job['attempt_id']))
            db.execute('UPDATE jobs SET state=?,last_result=?,available_at=?,lease_until=NULL,attempt_id=NULL,completed_units=MAX(completed_units,?) WHERE job_key=?',
                       (state,result.kind,wait or now,result.completed_units,job['job_key']))
            if wait:db.execute('UPDATE control SET blocked_until=MAX(blocked_until,?) WHERE id=1',(wait,))
            if result.kind=='auth_denied':db.execute('UPDATE control SET auth_stopped=1 WHERE id=1')
            db.commit()
        return {'status':result.kind,'jobKey':job['job_key'],'retryAt':wait or None}

    def run_one(self,execute,*,lease_seconds=120):
        """One bounded callback. Credentials/response bodies remain outside this queue."""
        with _runner_lock(self.path.with_suffix('.runner.lock')) as acquired:
            if not acquired:return {'status':'busy'}
            claimed=self._claim(lease_seconds)
            if claimed['status']!='claimed':return claimed
            job=claimed['job']
            try:
                result=execute(dict(job))
                if not isinstance(result,Outcome) or result.kind not in _KINDS:raise ValueError('Invalid transport result')
                _integer(result.completed_units)
            except Exception:
                # No raw exception text: transport errors can contain a URL/key.
                result=Outcome('retry',completed_units=job['completed_units'])
            try:return self._finish(job,result)
            except ValueError:
                return self._finish(job,Outcome('retry',completed_units=job['completed_units']))


def identity_jobs_from_plan(plan,*,namespace,operation_ref,default_scope=None):
    """Explicit identity plan only. Does NOT convert browser tools into API routes."""
    _ref(namespace);_ref(operation_ref)
    if not isinstance(plan,dict) or not isinstance(plan.get('requests'),list) or not re.fullmatch('[a-f0-9]{64}',str(plan.get('planHash',''))):raise ValueError('An explicit frozen identity plan is required')
    expected=plan.get('requestCount',plan.get('expectedItemCount'))
    _integer(expected,1)
    if expected!=len(plan['requests']):raise ValueError('Incomplete identity plan')
    output=[];seen=set()
    for entry in plan['requests']:
        if not isinstance(entry,dict):raise ValueError('Invalid explicit target record')
        item=entry.get('expectedItemId');_integer(item,1)
        name=entry.get('expectedItemName')
        if not isinstance(name,str) or not name.strip() or len(name)>200 or any(ord(c)<32 for c in name):raise ValueError('Explicit expected name required')
        if item in seen:raise ValueError('Duplicate planned item ID')
        seen.add(item);cohort=entry.get('cohort')
        if cohort is not None and not isinstance(cohort,str):raise ValueError('Invalid explicit cohort')
        scope={'goods':'priority_goods','cash':'priority_fixed_cash'}.get(cohort)
        if scope is None:
            if cohort is not None or default_scope!='priority_supplemental_cash':raise ValueError('Declare the target cohort explicitly; unknown identities are not classified')
            scope=default_scope
        output.append({'job_key':_ref(namespace+':'+str(item)),'scope':scope,'operation_ref':operation_ref,
                       'item_id':item,'item_name':name,'plan_hash':plan['planHash'],'priority':{'priority_goods':0,'priority_fixed_cash':1,'priority_supplemental_cash':2}[scope]})
    return output
