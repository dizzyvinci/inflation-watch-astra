"""Cache verified MCW sprites locally. Run explicitly; never per visitor/build."""
import concurrent.futures
import datetime as dt
import json
import struct
import urllib.request
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = 'https://maplestory.io/api/MCW/1/item/'
USER_AGENT = 'InflationWatch/0.2 (+https://github.com/dizzyvinci/inflation-watch; local research preview)'
# Both MCW gender variants share this exact published name. This icon is an
# illustrative male variant; the source aggregate does not separate genders.
ICON_VARIANTS = {'Dark Shadow Pants': 1060059}


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=25) as response:
        data = response.read(1_000_001)
        if len(data) > 1_000_000:
            raise ValueError('Oversized sprite response')
        return data


def png_dimensions(data):
    if len(data) < 24 or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        raise ValueError('Expected PNG')
    width, height = struct.unpack('>II', data[16:24])
    if not (1 <= width <= 512 and 1 <= height <= 512):
        raise ValueError('Unexpected icon dimensions')
    return width, height


def main():
    read = lambda path: json.loads(path.read_text(encoding='utf-8'))
    report = read(ROOT / 'dist/data.json')
    ids = {row['item']: row['id'] for row in read(ROOT / 'cache/browser-capture-input.json')['items']}
    mapping = read(ROOT / 'assets/sprites.json')
    provenance_path = ROOT / 'assets/sprite-provenance.json'
    provenance = read(provenance_path) if provenance_path.exists() else {}
    rows = [row for row in report['rows'] + report['cash'] if row['slug'] not in mapping]

    def acquire(row):
        try:
            item_id = ids.get(row['name']) or ICON_VARIANTS.get(row['name'])
            if item_id is None:
                query=urllib.parse.urlencode({'searchFor':row['name'],'count':100})
                matches=json.loads(fetch('https://maplestory.io/api/MCW/1/item?'+query))
                exact=[item for item in matches if item.get('name','').casefold()==row['name'].casefold()]
                if len(exact)!=1:
                    raise ValueError('MCW search did not identify one exact item name')
                item_id=exact[0]['id']
            base = BASE + str(item_id)
            metadata = json.loads(fetch(base + '/name'))
            if metadata.get('id') != item_id or metadata.get('name', '').casefold() != row['name'].casefold():
                raise ValueError('MCW item name does not match')
            data = fetch(base + '/icon')
            width, height = png_dimensions(data)
            (ROOT / 'assets' / (row['slug'] + '.png')).write_bytes(data)
            return row['slug'], {'itemId': item_id, 'name': metadata['name'], 'url': base + '/icon',
                'variantNote': 'Illustrative male variant; source combines the name across genders.' if row['name'] in ICON_VARIANTS else None,
                'region': 'MCW', 'version': '1', 'width': width, 'height': height,
                'retrievedAt': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), 'copyright': 'Nexon'}, None
        except Exception as error:
            return row['slug'], None, str(error)

    errors = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        for slug, record, error in executor.map(acquire, rows):
            if error:
                errors[slug] = error
            else:
                mapping[slug] = 'assets/' + slug + '.png'
                provenance[slug] = record
    (ROOT / 'assets/sprites.json').write_text(json.dumps(mapping, indent=2) + '\n', encoding='utf-8')
    provenance_path.write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'gameSprites': len(mapping), 'newlyVerified': len(rows) - len(errors), 'fallbacks': errors}))


if __name__ == '__main__':
    main()
