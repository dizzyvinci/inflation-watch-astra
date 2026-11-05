"""Archive an already captured, verified bulk client catalog. No network or ingestion."""
import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path

SOURCE = 'https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000'


def archive(candidate_path, assets):
    candidate = json.loads(Path(candidate_path).read_text(encoding='utf-8'))
    assert candidate['schemaVersion'] == 1 and candidate['region'] == 'MCW' and candidate['clientVersion'] == '1'
    assert candidate['sourceUrl'] == SOURCE and candidate['timestampKind'] == 'http_response_completed_at'
    captured = candidate['capturedAt']
    assert datetime.fromisoformat(captured.replace('Z', '+00:00')).tzinfo is not None
    raw_hash = candidate['rawSha256']
    assert len(raw_hash) == 64 and all(c in '0123456789abcdef' for c in raw_hash)
    rows = candidate['records']
    assert 0 < len(rows) <= 10000 and len(rows) == candidate['recordCount']
    records, seen = [], set()
    for row in rows:
        item_id, name = row['itemId'], row['name']
        assert type(item_id) is int and 0 < item_id < 100000000 and item_id not in seen
        assert row['isCash'] is True and isinstance(name, str) and 0 < len(name.strip()) <= 250
        seen.add(item_id)
        record = {'itemId': item_id, 'name': name, 'isCash': True}
        for key in ('overallCategory', 'category', 'subCategory', 'metadataKind'):
            value = row[key]
            assert isinstance(value, str) and 0 < len(value) <= 80
            record[key] = value
        assert record['metadataKind'] in ('equipment_item', 'appearance_style')
        assert (record['category'] == 'Character') == (record['metadataKind'] == 'appearance_style')
        records.append(record)
    records.sort(key=lambda row: row['itemId'])
    stats = {'appearanceStyles': sum(r['metadataKind'] == 'appearance_style' for r in records),
             'equipmentItems': sum(r['metadataKind'] == 'equipment_item' for r in records)}
    payload = {'schemaVersion': 1, 'kind': 'client_cash_metadata_catalog', 'provider': 'maplestory.io',
               'region': 'MCW', 'clientVersion': '1', 'sourceUrl': SOURCE, 'capturedAt': captured,
               'timestampKind': 'http_response_completed_at', 'sourceObservedAt': None,
               'sourcePublishedAt': None, 'releaseStatus': 'unknown', 'marketAvailability': None,
               'directNxCost': None, 'recordCount': len(records), 'stats': stats, 'records': records}
    body = (json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    assert len(body) <= 4 * 1024 * 1024, 'Public archive exceeds browser bound'
    digest = hashlib.sha256(body).hexdigest()
    assets = Path(assets); assets.mkdir(parents=True, exist_ok=True)
    filename = f'cash-client-catalog-{digest[:16]}.json'
    path = assets / filename
    if path.exists():
        assert path.read_bytes() == body, 'Existing immutable archive differs'
    else:
        path.write_bytes(body)
    manifest = {'schemaVersion': 1, 'kind': 'client_cash_metadata_manifest', 'data': 'assets/' + filename,
                'sha256': digest, 'bytes': len(body), 'recordCount': len(records), 'stats': stats,
                'capturedAt': captured, 'sourceObservedAt': None, 'sourcePublishedAt': None,
                'timestampKind': 'http_response_completed_at'}
    provenance = {'schemaVersion': 1, 'kind': 'client_cash_metadata_provenance', 'provider': 'MapleStory.io',
                  'serviceStatus': 'Unofficial community service exposing game-client metadata; game media/data belong to Nexon.',
                  'sourceUrl': SOURCE, 'region': 'MCW', 'clientVersion': '1', 'capturedAt': captured,
                  'timestampKind': 'http_response_completed_at', 'sourceObservedAt': None, 'sourcePublishedAt': None,
                  'rawSourceSha256': raw_hash, 'publicArchiveSha256': digest, 'recordCount': len(records), 'stats': stats,
                  'evidence': 'Every archived record explicitly has isCash:true in the source bulk response. A separate filtered count endpoint returned the same count.',
                  'scope': 'Client presence only, including hair/face styles. Not release, shop availability, market availability, direct NX cost, price, or index eligibility. Does not replace independently captured cash-consumable/market evidence.',
                  'refreshStatus': 'One dated manual research capture. Unattended refresh is not connected.',
                  'providerCacheSecondsAtCapture': 86400}
    for filename, value in [('cash-client-catalog.json', manifest), ('cash-client-catalog-provenance.json', provenance)]:
        target = assets / filename
        temp = target.with_suffix('.json.tmp')
        temp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        temp.replace(target)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', required=True, help='Local verified candidate JSON; never an URL')
    parser.add_argument('--assets', default=str(Path(__file__).resolve().parent.parent / 'assets'))
    args = parser.parse_args()
    print(json.dumps(archive(args.candidate, args.assets)))
