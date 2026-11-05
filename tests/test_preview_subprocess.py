"""Fresh local builders in temporary directories only; no canonical build/network."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import preview

CHILD = r'''
import hashlib,json,os,pathlib,sys
root=pathlib.Path(__file__).parent
tag='A'
(root/'.collector.lock').write_text(str(os.getpid()))
report={'sourceUpdatedAt':'2026-11-04T08:30:56Z','builtAt':'2026-11-05T18:00:00Z','sourceStatus':{'status':'offline' if '--offline' in sys.argv else 'ok'},'engineTag':tag,'offline':'--offline' in sys.argv}
raw=json.dumps(report,separators=(',',':')).encode()
version=hashlib.sha256(raw).hexdigest()[:16]
dist=root/'dist';dist.mkdir(exist_ok=True)
(dist/('data-'+version+'.json')).write_bytes(raw)
(dist/'data.json').write_bytes(raw)
(dist/'version.json').write_text(json.dumps({'version':version,'data':'data-'+version+'.json','sourceUpdatedAt':report['sourceUpdatedAt'],'builtAt':report['builtAt']}))
(dist/'ui-version.json').write_text(json.dumps({'schemaVersion':1,'kind':'local_preview_ui','version':'a'*64}))
(root/'.collector.lock').unlink()
print(json.dumps({'version':version,'sourceUpdatedAt':report['sourceUpdatedAt']}))
'''


class PreviewSubprocessTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        (self.root/'engine.py').write_text(CHILD,encoding='utf-8')

    def tearDown(self):self.temp.cleanup()

    def test_real_fresh_child_executes_changed_same_size_source_and_offline_only_initial(self):
        first,first_version=preview.build_fresh(True,root=self.root)
        self.assertEqual(first['engineTag'],'A');self.assertTrue(first['offline'])
        # Same-size edit without sleeping must execute new main-file source,
        # independent of a parent process's previous imports/pycache.
        (self.root/'engine.py').write_text(CHILD.replace("tag='A'","tag='B'"),encoding='utf-8')
        second,second_version=preview.build_fresh(root=self.root)
        self.assertEqual(second['engineTag'],'B');self.assertFalse(second['offline'])
        self.assertNotEqual(first_version,second_version)
        self.assertEqual(json.loads((self.root/'dist'/('data-'+first_version+'.json')).read_bytes()),first)
        self.assertEqual(preview.verified_output(self.root),(second,second_version))

    def test_child_failure_keeps_named_lastgood_and_returns_fixed_error_not_stderr(self):
        report,version=preview.build_fresh(True,root=self.root)
        before={name:(self.root/'dist'/name).read_bytes() for name in ('version.json','data.json','data-'+version+'.json')}
        (self.root/'engine.py').write_text("import os,pathlib,sys\npathlib.Path(__file__).with_name('.collector.lock').write_text(str(os.getpid()))\nprint('SYNTHETIC PRIVATE ERROR',file=sys.stderr)\nraise SystemExit(7)\n")
        with self.assertRaises(preview.PreviewBuildError) as caught:preview.build_fresh(root=self.root)
        self.assertEqual(str(caught.exception),'child_build_failed')
        self.assertNotIn('PRIVATE',str(caught.exception));self.assertFalse((self.root/'.collector.lock').exists())
        for name,value in before.items():self.assertEqual((self.root/'dist'/name).read_bytes(),value)
        self.assertEqual(preview.verified_output(self.root),(report,version))

    def test_timeout_kills_own_child_cleans_only_its_lock_and_no_retry(self):
        (self.root/'engine.py').write_text("import os,pathlib,time\npathlib.Path(__file__).with_name('.collector.lock').write_text(str(os.getpid()))\ntime.sleep(30)\n")
        with self.assertRaises(preview.PreviewBuildError) as caught:preview.build_fresh(root=self.root,timeout=.5)
        self.assertEqual(str(caught.exception),'child_build_timeout');self.assertFalse((self.root/'.collector.lock').exists())
        (self.root/'engine.py').write_text(CHILD)
        self.assertEqual(preview.build_fresh(root=self.root)[0]['engineTag'],'A','A later explicit tick succeeds; no restart loop')

    def test_busy_checkout_and_inprocess_guard_cannot_spawn_or_delete_foreign_lock(self):
        with patch.object(preview.subprocess,'Popen') as spawn:
            (self.root/'.collector.lock').write_text('99999999')
            with self.assertRaisesRegex(preview.PreviewBuildError,'checkout_collector_busy'):preview.build_fresh(root=self.root)
            self.assertEqual((self.root/'.collector.lock').read_text(),'99999999');spawn.assert_not_called()
            (self.root/'.collector.lock').unlink();preview._build_guard.acquire()
            try:
                with self.assertRaisesRegex(preview.PreviewBuildError,'build_already_running'):preview.build_fresh(root=self.root)
            finally:preview._build_guard.release()
            spawn.assert_not_called()

    def test_summary_tamper_alias_mismatch_and_no_commit_marker_fail_verification(self):
        report,version=preview.build_fresh(True,root=self.root)
        with self.assertRaises(ValueError):preview.verified_output(self.root,expected={'version':'0'*16,'sourceUpdatedAt':report['sourceUpdatedAt']})
        (self.root/'dist/data.json').write_text('{}')
        with self.assertRaises(ValueError):preview.verified_output(self.root)
        (self.root/'engine.py').write_text("print('{}')\n")
        with self.assertRaisesRegex(preview.PreviewBuildError,'child_output_unverified'):preview.build_fresh(root=self.root)
        self.assertTrue((self.root/'dist'/('data-'+version+'.json')).exists())
        (self.root/'dist/version.json').write_text('[]')
        with self.assertRaises(ValueError):preview.verified_output(self.root)

    def test_spawn_is_list_direct_python_bounded_and_hidden_on_windows(self):
        with patch.object(preview.subprocess,'Popen',side_effect=OSError('SYNTHETIC PRIVATE PATH')) as spawn:
            with self.assertRaisesRegex(preview.PreviewBuildError,'child_output_unverified'):preview.build_fresh(True,root=self.root)
        args,kwargs=spawn.call_args
        self.assertEqual(args[0],[sys.executable,'-B',str(self.root/'engine.py'),'--offline'])
        self.assertEqual(kwargs['cwd'],str(self.root));self.assertEqual(kwargs['stdin'],subprocess.DEVNULL)
        self.assertEqual(kwargs['stdout'],subprocess.PIPE);self.assertEqual(kwargs['stderr'],subprocess.PIPE)
        self.assertNotIn('shell',kwargs)
        self.assertEqual(kwargs['creationflags'],getattr(subprocess,'CREATE_NO_WINDOW',0) if preview.os.name=='nt' else 0)

    def test_collector_preserves_one_normal_interval_per_tick_even_after_failure(self):
        (self.root/'config.json').write_text(json.dumps({'poll_seconds':600}))
        output=io.StringIO()
        class Finished(Exception):pass
        with patch.object(preview,'ROOT',self.root),patch.object(preview.time,'sleep',side_effect=[None,Finished()]) as sleep,patch.object(preview,'build_fresh',side_effect=preview.PreviewBuildError('child_build_failed')) as build,contextlib.redirect_stdout(output):
            with self.assertRaises(Finished):preview.collector()
        self.assertEqual(sleep.call_count,2);self.assertEqual(sleep.call_args_list[0].args,(600,));build.assert_called_once_with(False)
        self.assertEqual(json.loads(output.getvalue()),{'refresh':'failed','reason':'child_build_failed','retainedNamedSnapshots':True})
        for invalid in (None,False,0,-1,'600'):
            (self.root/'config.json').write_text(json.dumps({'poll_seconds':invalid}))
            self.assertEqual(preview.poll_seconds(self.root),600)


if __name__=='__main__':unittest.main()
