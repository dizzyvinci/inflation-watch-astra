"""Pure projections of the accepted public daily developer feed, not a new API.

No network, filesystem, engine import, prices from other providers or index math.
Caller supplies the validated feed and, optionally, a separately reviewed exact
slug/name/ID identity map. Browser or art-name similarity is never an identity join.
"""
import datetime as dt
from portable_hash import HASH_METHOD, portable_hash
import math
import re
from collections import defaultdict

SOURCE_URL='https://maplestory-classic.com/market.json'
SOURCE_SCOPE='public_daily_developer_feed_collection'
MINIMUM_DAILY_COUNT=5
MAX_SAFE_INTEGER=9007199254740991
_SLUG=re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
_STAMP=re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$')


def _number(value):
    try:return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and abs(value)<=MAX_SAFE_INTEGER
    except OverflowError:return False


def _positive(value):return _number(value) and value>0


def _count(value):return _number(value) and value>=0 and int(value)==value


def _stamp(value):
    if not isinstance(value,str) or not _STAMP.fullmatch(value):return None
    if not value.endswith('Z') and (int(value[-5:-3])>23 or int(value[-2:])>59):return None
    # Validate calendar/time and offset independently of 1..9 fractional digits.
    # Fractions cannot change a UTC day with minute-precision offsets.
    try:return dt.datetime.fromisoformat(value[:19]+('+00:00' if value.endswith('Z') else value[-6:]))
    except ValueError:return None


def _day(value):
    if not isinstance(value,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',value):return None
    try:return dt.date.fromisoformat(value)
    except ValueError:return None


def _text(value,limit):return isinstance(value,str) and bool(value.strip()) and len(value)<=limit and not any(ord(c)<32 for c in value)


def source_summary(item,source_updated_at):
    """Strict allowlist compatible with engine.source_summary for valid feed values."""
    result={'sourceUpdatedAt':source_updated_at,'window':'unspecified_source_summary','kind':'source_published_summary'}
    for raw,key in [('p','medianSale'),('p25','p25'),('p75','p75'),('lo','lowSale'),('hi','highSale'),('ask','medianSellerAsk')]:
        value=item.get(raw);result[key]=value if _positive(value) else None
    for raw,key in [('asks','listings'),('sellers','sellers')]:
        value=item.get(raw);result[key]=int(value) if _count(value) else None
    value=item.get('st');result['sellThrough']=value if _number(value) and 0<=value<=1 else None
    value=item.get('last');result['reportedLastSaleAt']=value if _stamp(value) else None
    return result


def _identities(entries,items):
    if entries is None:entries=[]
    if not isinstance(entries,list):raise ValueError('Identity map must be an explicit reviewed list')
    candidates=defaultdict(set);provenance=defaultdict(set);id_slugs=defaultdict(set);invalid=0
    for entry in entries:
        if not isinstance(entry,dict):invalid+=1;continue
        slug=entry.get('slug');item=items.get(slug) if isinstance(slug,str) else None
        item_id=entry.get('id');digest=entry.get('planHash')
        if not item or entry.get('name')!=item['n'] or not _count(item_id) or item_id<=0 or not isinstance(digest,str) or not re.fullmatch('[a-f0-9]{64}',digest):
            invalid+=1;continue
        item_id=int(item_id);candidates[slug].add(item_id);provenance[(slug,item_id)].add(digest);id_slugs[item_id].add(slug)
    accepted={};ambiguous=set()
    for slug,ids in candidates.items():
        if len(ids)!=1 or any(len(id_slugs[item_id])!=1 for item_id in ids):ambiguous.add(slug);continue
        item_id=next(iter(ids));accepted[slug]={'id':item_id,'planHashes':sorted(provenance[(slug,item_id)])}
    return accepted,{'matchedItems':len(accepted),'ambiguousItems':len(ambiguous),'ignoredEntries':invalid}


class MarketCatalog:
    """Prepare once from one accepted snapshot; later lookups are exact and O(1)."""
    def __init__(self,feed,identity_map=None):
        if not isinstance(feed,dict) or not isinstance(feed.get('items'),list):raise ValueError('Daily feed item list required')
        stamp=_stamp(feed.get('updatedAt'))
        if not stamp:raise ValueError('Actual timezone-aware source publication required')
        self.source_updated_at=feed['updatedAt'];self.source_day=stamp.astimezone(dt.timezone.utc).date().isoformat()
        self._items={}
        for raw in feed['items']:
            if not isinstance(raw,dict) or not _text(raw.get('n'),200) or not _text(raw.get('k'),120):raise ValueError('Invalid source item name/category')
            slug=raw.get('s')
            if not isinstance(slug,str) or len(slug)>200 or not _SLUG.fullmatch(slug) or slug in self._items:raise ValueError('Invalid or duplicate exact provider slug')
            if not isinstance(raw.get('h'),list):raise ValueError('Retained daily history required, including an empty list')
            previous='';history=[]
            for point in raw['h']:
                if not isinstance(point,(list,tuple)) or len(point)!=3:raise ValueError('Daily point requires source day, median and recorded count')
                day,price,quantity=point
                if not _day(day) or day<=previous or day>self.source_day or not _positive(price) or not _count(quantity):raise ValueError('Invalid, duplicate, unordered or future daily point')
                previous=day;history.append([day,price,int(quantity)])
            summary=source_summary(raw,self.source_updated_at)
            sold=raw.get('sold')
            self._items[slug]={'n':raw['n'],'s':slug,'k':raw['k'],'h':history,'summary':summary,
                               'reportedSales':int(sold) if _count(sold) else None,'sourceLowData':_count(raw.get('ld')) and raw.get('ld')==1}
        self._identity,self.identity_coverage=_identities(identity_map,self._items)
        # Projection hash is over sanitized provider data, not an invented raw-file hash.
        self.source_projection_hash=portable_hash({'sourceUrl':SOURCE_URL,'updatedAt':self.source_updated_at,'items':[self._items[key] for key in sorted(self._items)]})
        self.catalog_hash=portable_hash({'schemaVersion':1,'hashMethod':HASH_METHOD,'sourceProjectionHash':self.source_projection_hash,'identities':self._identity,'identityCoverage':self.identity_coverage})

    def _context(self,kind):
        return {'schemaVersion':1,'hashMethod':HASH_METHOD,'kind':kind,'sourceScope':SOURCE_SCOPE,'sourceUrl':SOURCE_URL,
                'sourceUpdatedAt':self.source_updated_at,'sourceUtcDay':self.source_day,
                'sourceProjectionHash':self.source_projection_hash,'catalogHash':self.catalog_hash,'minimumDailyCount':MINIMUM_DAILY_COUNT}

    def _brief(self,item):
        qualified=[point for point in item['h'] if point[2]>=MINIMUM_DAILY_COUNT];latest=qualified[-1] if qualified else None
        identity=self._identity.get(item['s'])
        return {'slug':item['s'],'name':item['n'],'category':item['k'],'canonicalId':identity['id'] if identity else None,
                'price':latest[1] if latest else None,'priceDay':latest[0] if latest else None,'quantity':latest[2] if latest else None,
                'publisherMedian':item['summary']['medianSale'],'historyDays':len(item['h']),'qualifyingDays':len(qualified),
                'thinDays':sum(0<point[2]<MINIMUM_DAILY_COUNT for point in item['h']),
                'zeroCountDays':sum(point[2]==0 for point in item['h']),
                'carried':bool(latest and latest[0]<self.source_day),'partial':bool(latest and latest[0]==self.source_day)}

    def build_index(self):
        rows=[self._brief(self._items[slug]) for slug in sorted(self._items)]
        result=self._context('daily_market_search_index')
        result.update(itemCount=len(rows),identityCoverage=dict(self.identity_coverage),
                      coverage={'withQualifiedDailyPrice':sum(row['price'] is not None for row in rows),
                                'withoutQualifiedDailyPrice':sum(row['price'] is None for row in rows),
                                'withPublisherSummaryMedian':sum(row['publisherMedian'] is not None for row in rows),
                                'withRetainedDailyHistory':sum(row['historyDays']>0 for row in rows)},
                      priceKinds={'price':'latest_qualified_daily_median','publisherMedian':'unspecified_window_source_summary'},
                      coverageNote='All items in this accepted public daily provider collection, including thin and unqualified records; not every game item or every trade. No MPI membership or weight is assigned.',
                      quantityNote='Provider-recorded daily counts; exact stack/bundle-versus-unit semantics are not independently verified.',rows=rows)
        return result

    def resolve_item(self,slug,expected_projection_hash=None,expected_catalog_hash=None):
        if expected_projection_hash is not None and expected_projection_hash!=self.source_projection_hash:raise ValueError('Catalogue snapshot changed; refresh the index before joining item detail')
        if expected_catalog_hash is not None and expected_catalog_hash!=self.catalog_hash:raise ValueError('Catalogue identity or method changed; refresh the index before joining item detail')
        if not isinstance(slug,str) or not _SLUG.fullmatch(slug) or len(slug)>200:raise ValueError('Use the exact provider slug, not an alias, name, ID or path')
        item=self._items.get(slug)
        if item is None:return None
        row=self._brief(item);identity=self._identity.get(slug)
        history=[{'day':day,'median':price,'recordedCount':quantity,'qualified':quantity>=MINIMUM_DAILY_COUNT,
                  'quality':'qualified' if quantity>=MINIMUM_DAILY_COUNT else 'thin' if quantity>0 else 'zero_count',
                  'partial':day==self.source_day} for day,price,quantity in item['h']]
        qualified=[point for point in history if point['qualified']]
        result=self._context('daily_market_item_detail')
        result.update(row)
        result.update(itemSourceUrl='https://maplestory-classic.com/market/'+slug,
                      sourceSummary=dict(item['summary']),sourceReportedSales=item['reportedSales'],sourceLowData=item['sourceLowData'],
                      reportedLastSaleKind='provider_reported_last_sale_unconfirmed_not_individual_trade_evidence',
                      firstObservedDay=history[0]['day'] if history else None,lastHistoryDay=history[-1]['day'] if history else None,
                      latestDaily=dict(history[-1]) if history else None,currentQualified=dict(qualified[-1]) if qualified else None,
                      historyDatePrecision='UTC_calendar_day',history=history,identityProvenance={'kind':'reviewed_exact_provider_slug_and_name','planHashes':list(identity['planHashes'])} if identity else None,
                      limitations={'summaryWindow':'unspecified; summary and daily prices may differ',
                                   'dailyCounts':'Provider-recorded counts; stack/bundle-versus-unit semantics not independently verified',
                                   'priceDate':'Qualified prices retain their actual earlier day when carried; source publication is not a new sale',
                                   'partial':'Current source UTC calendar day can be incomplete',
                                   'quality':'Source category only; no stat/upgrade/slot-constant history is established',
                                   'scope':'Public daily developer-feed collection only; not all game items or individual settled trades',
                                   'metadata':'Unknown fixed NX costs, release dates, stats and trade identities are not inferred'})
        return result


def build_index(feed,identity_map=None):return MarketCatalog(feed,identity_map).build_index()


def resolve_item(feed,slug,identity_map=None,expected_projection_hash=None,expected_catalog_hash=None):return MarketCatalog(feed,identity_map).resolve_item(slug,expected_projection_hash,expected_catalog_hash)
