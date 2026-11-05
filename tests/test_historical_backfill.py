import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import historical_backfill as history


class ReportHistoryTests(unittest.TestCase):
    def html(self, source=history.FIRST, mismatch=False):
        start,end = history.REPORTS[source]
        entries=[]
        details=[]
        for day in range(start,end+1):
            trailing = ', last 24 hours' if day == 14 else ''
            entries.append(f'October {day}{trailing} {day/2:.2f}')
            if source == history.FIRST:
                rate = 999 if mismatch and day == 7 else day/2
                details.append(f'<button aria-label="October {day}{trailing}: {rate:.2f} mesos per NX, from 5 prices"></button>')
        # Decoy data outside the reviewed section must never enter extraction.
        return '<div aria-label="October 6: 500 mesos per NX, from 1 prices"></div><section id="nx-meso"><div aria-label="'+history.LABEL_PREFIX+'; '.join(entries)+'"></div>'+''.join(details)+'</section>'

    def extract(self, **kwargs):
        return history.extract_report(self.html(**kwargs), kwargs.get('source',history.FIRST), '2026-11-04T08:00:00Z')

    def test_exact_labels_preserve_date_precision_counts_and_trailing_window(self):
        report=self.extract()
        self.assertEqual(len(report['points']),8)
        self.assertEqual(report['points'][0]['date'],'2026-10-07')
        self.assertIsNone(report['points'][0]['observedAt'])
        self.assertEqual(report['points'][0]['sampleCount'],5)
        self.assertEqual(report['points'][-1]['measurementWindow'],'trailing_24_hours_at_unspecified_report_time')

    def test_no_svg_inference_or_source_mixing(self):
        for html,source in [('<svg><path d="M1 99 L2 50"/></svg>',history.FIRST),
                            (self.html(),'https://other.example.test')]:
            with self.assertRaises(ValueError):
                history.extract_report(html,source,'2026-11-04T08:00:00Z')

    def test_conflicting_visible_evidence_rejected(self):
        with self.assertRaises(ValueError):self.extract(mismatch=True)

    def test_idempotence_preserves_capture_and_gaps(self):
        first=self.extract()
        result=history.merge_reports({},first)
        repeated=copy.deepcopy(first)
        repeated['capturedAt']='2026-11-04T09:00:00Z'
        self.assertEqual(history.merge_reports(result,repeated),result)
        merged=history.merge_reports(result,self.extract(source=history.GRAND))
        self.assertEqual(len(merged['points']),16)
        self.assertNotIn('2026-10-15',{p['date'] for p in merged['points']})
        self.assertFalse(merged['eligibleForDailyCpi'])
        self.assertFalse(merged['eligibleForDailyNxEstimate'])
        self.assertIsNone(merged['points'][-1]['sampleCount'])

    def test_conflicting_historical_revision_requires_review(self):
        report=self.extract()
        existing=history.merge_reports({},report)
        changed=copy.deepcopy(report)
        changed['points'][0]['rate']=50
        with self.assertRaises(ValueError):history.merge_reports(existing,changed)

    def test_incomplete_and_future_evidence_rejected(self):
        html=self.html().replace('October 7 3.50; ','')
        with self.assertRaises(ValueError):
            history.extract_report(html,history.FIRST,'2026-11-04T08:00:00Z')
        with self.assertRaises(ValueError):
            history.extract_report(self.html(),history.FIRST,'2099-01-01T00:00:00Z')

    def test_sample_counts_cannot_silently_disappear(self):
        import re
        html=re.sub(r'<button.*?</button>','',self.html())
        with self.assertRaises(ValueError):
            history.extract_report(html,history.FIRST,'2026-11-04T08:00:00Z')

    def test_saved_evidence_contains_16_source_dated_points(self):
        import json
        path=Path(history.__file__).parent/'history'/'niadb-reported-nx-history.json'
        payload=json.loads(path.read_text(encoding='utf-8'))
        self.assertEqual(len(payload['points']),16)
        self.assertEqual(payload['points'][0]['rate'],1.88)
        self.assertEqual(payload['points'][-1]['rate'],13.81)
        self.assertTrue(all(p['observedAt'] is None for p in payload['points']))
        self.assertTrue(all(s['indicatorSectionSha256'] for s in payload['sources']))


if __name__ == '__main__':unittest.main()
