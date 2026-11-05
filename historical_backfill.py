"""Extract separately labelled NX report history from two reviewed public reports.

No network calls. No insertion into the daily feed, CPI, intraday ledger or smega
series. Parse saved publisher HTML, not graph geometry; preserve day precision
and the source's trailing-24-hour exception. Missing dates remain missing.

python historical_backfill.py saved-report.html --source SOURCE_URL \
  --captured-at 2026-11-05T04:00:00Z --output history/niadb-reported-nx-history.json
Running once for each report merges by source URL and date. Changes to existing
source points are rejected for review instead of silently rewriting history.
"""
import argparse
import datetime as dt
import hashlib
from html.parser import HTMLParser
import json
import math
import os
from pathlib import Path
import re
import tempfile

FIRST = 'https://meowdb.com/msclassic/news/mscw-launch-week-exploration-report'
GRAND = 'https://meowdb.com/msclassic/news/niadb-grand-launch-week-exploration-report'
REPORTS = {FIRST: (7, 14), GRAND: (20, 27)}
UTC = dt.timezone.utc
LABEL_PREFIX = 'NiaDB NX:Meso Indicator by day: '
DAY = r'October (\d{1,2})(, last 24 hours)?'
POINT = re.compile('^' + DAY + r': ([\d.]+) mesos per NX, from (\d+) prices$')
SERIES_POINT = re.compile('^' + DAY + r' ([\d.]+)$')


class IndicatorParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.section = []
        self.labels = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'section':
            if self.depth:
                self.depth += 1
            elif attrs.get('id') == 'nx-meso':
                self.depth = 1
        if self.depth:
            self.section.append(self.get_starttag_text())
            if attrs.get('aria-label'):
                self.labels.append(attrs['aria-label'])

    def handle_endtag(self, tag):
        if self.depth:
            self.section.append('</' + tag + '>')
            if tag == 'section':
                self.depth -= 1

    def handle_data(self, data):
        if self.depth:
            self.section.append(data)


def capture_stamp(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.utcoffset() != dt.timedelta(0) or parsed > dt.datetime.now(UTC):
        raise ValueError('Capture time must be actual nonfuture UTC time')
    return value


def extract_report(html, source, captured_at):
    if source not in REPORTS:
        raise ValueError('Only the two reviewed report URLs are supported')
    capture_stamp(captured_at)
    parser = IndicatorParser()
    parser.feed(html)
    if parser.depth:
        raise ValueError('Incomplete publisher indicator section')
    details = {}
    series = {}
    for label in parser.labels:
        point = POINT.fullmatch(label)
        if point:
            day, trailing, rate, count = point.groups()
            normalized = (float(rate), bool(trailing), int(count))
            if int(day) in details and details[int(day)] != normalized:
                raise ValueError('Conflicting publisher point labels')
            details[int(day)] = normalized
        elif label.startswith(LABEL_PREFIX):
            for entry in label[len(LABEL_PREFIX):].split('; '):
                match = SERIES_POINT.fullmatch(entry)
                if not match:
                    raise ValueError('Unrecognized published series label')
                day, trailing, rate = match.groups()
                normalized = (float(rate), bool(trailing))
                if int(day) in series and series[int(day)] != normalized:
                    raise ValueError('Conflicting publisher series labels')
                series[int(day)] = normalized
    if not series:
        raise ValueError('No exact published indicator series; never infer SVG prices')
    start, end = REPORTS[source]
    if set(series) != set(range(start, end+1)):
        raise ValueError('Unexpected report dates; review publisher changes')
    if source == FIRST and not details:
        raise ValueError('The first report requires its published price sample counts')
    if details and set(details) != set(series):
        raise ValueError('Incomplete detailed point evidence')
    points = []
    for day, (rate, trailing) in sorted(series.items()):
        if not math.isfinite(rate) or rate <= 0:
            raise ValueError('Invalid published rate')
        if trailing != (source == FIRST and day == 14):
            raise ValueError('Changed historical aggregation window requires review')
        detail = details.get(day)
        if detail and (detail[:2] != (rate, trailing) or detail[2] <= 0):
            raise ValueError('Conflicting detailed evidence')
        points.append({'date': dt.date(2026, 10, day).isoformat(),
                       'datePrecision': 'day', 'observedAt': None,
                       'rate': rate, 'unit': 'mesos_per_nx',
                       'kind': 'reported_nx_indicator', 'sourceUrl': source,
                       'sampleCount': detail[2] if detail else None,
                       'sampleCountUnit': 'source_reported_prices' if detail else None,
                       'measurementWindow': 'trailing_24_hours_at_unspecified_report_time'
                           if trailing else 'source_labelled_day',
                       'sourceTimestampKnown': False,
                       'evidenceLocation': '#nx-meso aria-label',
                       'evidenceType': 'exact_publisher_accessible_chart_labels'})
    return {'sourceUrl': source, 'capturedAt': captured_at,
            'indicatorSectionSha256': hashlib.sha256(''.join(parser.section).encode()).hexdigest(),
            'points': points}


def merge_reports(existing, report):
    if existing and existing.get('seriesId') != 'niadb-reported-nx-history-v1':
        raise ValueError('Refuse to merge another series')
    points = {(p['sourceUrl'], p['date']): p for p in existing.get('points', [])}
    for point in report['points']:
        key = (point['sourceUrl'], point['date'])
        if key in points and points[key] != point:
            raise ValueError('Changed historical value requires explicit review')
        points[key] = point
    sources = {s['sourceUrl']: s for s in existing.get('sources', [])}
    # Preserve the original evidence capture clock on unchanged report reimports.
    sources.setdefault(report['sourceUrl'], {k:v for k,v in report.items() if k != 'points'})
    return {'schemaVersion': 1, 'seriesId': 'niadb-reported-nx-history-v1',
            'label': 'NiaDB published player-reported NX indicator',
            'eligibleForDailyCpi': False, 'eligibleForDailyNxEstimate': False,
            'eligibleForLiveHeadline': False,
            'methodology': 'Publisher indicator from player-posted market records and fixed-NX Cash Shop items; separate from our scanner-sale estimate.',
            'limitations': 'No intraday source clock or cross-provider deduplication; missing dates are gaps; October 14 is explicitly trailing 24 hours.',
            'sources': sorted(sources.values(), key=lambda s:s['sourceUrl']),
            'points': sorted(points.values(), key=lambda p:(p['date'],p['sourceUrl']))}


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as stream:
        tmp = Path(stream.name)
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
    try:
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('html', type=Path)
    parser.add_argument('--source', choices=list(REPORTS), required=True)
    parser.add_argument('--captured-at', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = extract_report(args.html.read_text(encoding='utf-8'), args.source, args.captured_at)
    existing = json.loads(args.output.read_text(encoding='utf-8')) if args.output.exists() else {}
    result = merge_reports(existing, report)
    atomic_json(args.output, result)
    print(json.dumps({'historicalReportPoints': len(result['points']), 'headlineSeriesChanged': False}))


if __name__ == '__main__':
    main()
