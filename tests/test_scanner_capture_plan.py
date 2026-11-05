import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import scanner_capture_plan as planner


def fixture():
    items = [{'s': 'goods-' + str(i), 'n': 'Good ' + str(i), 'k': 'Materials'} for i in range(50)]
    items += [{'s': 'cash-' + str(i), 'n': 'Cash ' + str(i), 'k': 'Cash Shop'} for i in range(29)]
    feed = {'updatedAt': '2026-11-04T08:30:56Z', 'items': items}
    source = copy.deepcopy(feed)
    spec = {'baseStart': '2026-10-21', 'baseEnd': '2026-10-27'}
    basket = {'version': 2, 'indexSpecification': spec, 'sourceSnapshotHash': planner.digest(source),
              'specificationHash': planner.digest(spec), 'rows': [{'slug': item['s'], 'weight': .02} for item in items[:50]]}
    basket['basketHash'] = planner.digest({key: basket[key] for key in ('version', 'indexSpecification', 'sourceSnapshotHash', 'rows')})
    config = {'nx_prices': {item['n']: 1000 for item in items[50:]}}
    art = {item['s']: {'itemId': 2000000 + i, 'name': item['n'], 'region': 'MCW', 'version': '1',
                      'url': 'https://maplestory.io/api/MCW/1/item/' + str(2000000+i) + '/icon'} for i, item in enumerate(items)}
    prior = {'sourceUrl': 'https://mesos.watch/', 'capturedAt': '2026-11-05T02:10:54.740Z',
             'items': [{'id': 2000000, 'item': 'Good 0'}]}
    return basket, source, feed, config, art, prior


class ScannerCapturePlanTests(unittest.TestCase):
    def test_current_scope_is79_unique_targets_with_provenance_not_observations(self):
        inputs = fixture(); original = copy.deepcopy(inputs)
        plan = planner.build_plan(*inputs)
        self.assertEqual((plan['requestCount'], plan['goodsCount'], plan['cashCount']), (79, 50, 29))
        self.assertEqual(len({r['expectedItemId'] for r in plan['requests']}), 79)
        self.assertTrue(plan['requests'][0]['scannerIdPreviouslyObserved'])
        self.assertEqual(plan['requests'][0]['idProvenance'][0]['kind'], 'prior_actual_scanner_response_id')
        self.assertFalse(plan['requests'][1]['scannerIdPreviouslyObserved'])
        self.assertEqual(plan['requests'][1]['idProvenance'][0]['kind'], 'mcw_name_verified_art_candidate')
        self.assertEqual(plan['requests'][0]['arguments'], {'item': str(plan['requests'][0]['expectedItemId'])})
        self.assertFalse(plan['isCapture']); self.assertNotIn('capturedAt', plan)
        self.assertEqual(inputs, original)

    def test_conflicting_missing_and_wrong_name_evidence_fail_closed(self):
        for mode in ['conflict', 'missing', 'wrong_name']:
            inputs = list(fixture())
            if mode == 'conflict': inputs[4]['goods-0']['itemId'] += 1000
            elif mode == 'missing': del inputs[4]['goods-1']
            else: inputs[4]['goods-1']['name'] = 'Another item'
            with self.subTest(mode=mode), self.assertRaises(ValueError): planner.build_plan(*inputs)

    def test_tampered_frozen_definition_is_rejected(self):
        for index in [0, 1]:
            inputs = list(fixture())
            if index == 0: inputs[0]['rows'][0]['weight'] = .03
            else: inputs[1]['updatedAt'] = '2026-11-05T00:00:00Z'
            with self.assertRaisesRegex(ValueError, 'hash mismatch'): planner.build_plan(*inputs)

    def test_offline_write_replay_and_new_schedule_freeze_prior_plan(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, value in zip(planner.INPUTS, fixture()):
                p = root/name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(json.dumps(value), encoding='utf-8')
            inputs_before = {name: (root/name).read_bytes() for name in planner.INPUTS}
            first = planner.prepare(root); target = root/'incoming/scanner-capture-plan.json'
            original = target.read_bytes(); modified = target.stat().st_mtime_ns
            self.assertEqual(planner.prepare(root), first); self.assertEqual(target.stat().st_mtime_ns, modified)
            self.assertEqual({name: (root/name).read_bytes() for name in planner.INPUTS}, inputs_before)
            config_path = root/'config.json'; config = json.loads(config_path.read_text()); config['nx_prices']['Cash 0'] = 1100
            config_path.write_text(json.dumps(config), encoding='utf-8')
            second = planner.prepare(root); self.assertNotEqual(second['planHash'], first['planHash'])
            self.assertEqual((root/'incoming/scanner-capture-plan-history'/(first['planHash']+'.json')).read_bytes(), original)
            tampered = json.loads(target.read_text()); tampered['requests'][0]['expectedItemId'] += 1
            target.write_text(json.dumps(tampered), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'integrity'): planner.prepare(root)


if __name__ == '__main__': unittest.main()
