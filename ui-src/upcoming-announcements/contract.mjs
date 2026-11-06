const SHA=/^[a-f0-9]{64}$/;
const need=(v,c)=>{if(!v)throw Error('upcoming_'+c)};
const keys=(v,a)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...a].sort().join(','),'fields');
const text=(v,max=400)=>need(typeof v==='string'&&v.length>0&&v.length<=max,'text');
const stamp=v=>{text(v,40);need(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,19)===v.slice(0,19),'clock')};
const official=v=>{const u=new URL(v);need(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.hostname==='www.nexon.com'&&/^\/maplestory\/news\/general\/[1-9]\d*\/[a-z0-9-]+$/.test(u.pathname),'official_source')};
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
export function validateAnnouncements(input){
 const f=structuredClone(input);
 keys(f,['schemaVersion','kind','scope','reviewedAt','coverage','sources','records','referenceNotes','limitations']);
 need(f.schemaVersion===1&&f.kind==='reviewed_classic_world_announcements','profile');
 keys(f.scope,['game','region','targetWorld','worldNameExplicitInReviewedPosts']);
 need(f.scope.game==='MapleStory Classic World'&&f.scope.region==='Global'&&f.scope.targetWorld==='Windia'&&typeof f.scope.worldNameExplicitInReviewedPosts==='boolean','edition');
 stamp(f.reviewedAt);
 keys(f.coverage,['mode','automaticMonitoring','publicDiscordMessageContentsVerified','sourceIds']);
 need(f.coverage.mode==='bounded_reviewed_primary_posts_not_exhaustive'&&f.coverage.automaticMonitoring===false&&f.coverage.publicDiscordMessageContentsVerified===false,'coverage');
 need(Array.isArray(f.sources)&&f.sources.length>0&&f.sources.length<=32&&Array.isArray(f.records)&&f.records.length<=128,'bound');
 const sourceIds=new Set();
 for(const s of f.sources){
  keys(s,['sourceId','publisher','title','url','cmsUrl','isMSCW','publishedAt','capturedAt','bodySha256']);
  text(s.sourceId,80);need(!sourceIds.has(s.sourceId),'source_duplicate');sourceIds.add(s.sourceId);
  need(s.publisher==='Nexon'&&s.isMSCW===true&&typeof s.bodySha256==='string'&&SHA.test(s.bodySha256),'source');official(s.url);
  need(/^https:\/\/g\.nexonstatic\.com\/maplestory\/cms\/v1\/news\/[1-9]\d*$/.test(s.cmsUrl),'cms_source');
  need(new URL(s.url).pathname.split('/')[4]===s.cmsUrl.split('/').at(-1),'article_binding');
  stamp(s.publishedAt);stamp(s.capturedAt);need(Date.parse(s.publishedAt)<=Date.parse(s.capturedAt)&&Date.parse(s.capturedAt)<=Date.parse(f.reviewedAt),'clock_order');text(s.title,200);
 }
 const refs=a=>need(Array.isArray(a)&&a.length>0&&new Set(a).size===a.length&&a.every(id=>sourceIds.has(id)),'source_reference');
 refs(f.coverage.sourceIds);const ids=new Set();
 for(const r of f.records){
  keys(r,['announcementId','title','kind','status','date','summary','sourceIds','verifiedItems','nxPrice','rewardProbabilities','availabilityVerified','notes']);
  text(r.announcementId,100);need(!ids.has(r.announcementId),'record_duplicate');ids.add(r.announcementId);
  text(r.title,200);text(r.summary,600);text(r.notes,500);
  need(['world_update','fashion','item'].includes(r.kind)&&['announced','scheduled','released','cancelled'].includes(r.status),'state');refs(r.sourceIds);
  keys(r.date,['precision','value','timeZone']);need(['unknown','month','day','instant'].includes(r.date.precision),'date_precision');
  if(r.date.precision!=='unknown')need(typeof r.date.value==='string','date_value');
  if(r.date.precision==='unknown')need(r.date.value===null&&r.date.timeZone===null,'unknown_date');
  if(r.date.precision==='month')need(/^\d{4}-(?:0[1-9]|1[0-2])$/.test(r.date.value)&&r.date.timeZone===null,'month');
  if(r.date.precision==='day')need(/^\d{4}-\d\d-\d\d$/.test(r.date.value)&&new Date(r.date.value+'T00:00:00Z').toISOString().slice(0,10)===r.date.value&&r.date.timeZone==='UTC','day');
  if(r.date.precision==='instant'){stamp(r.date.value);need(r.date.timeZone==='UTC','zone');}
  need(r.status!=='scheduled'||['day','instant'].includes(r.date.precision),'scheduled_precision');
  // No verified item IDs/prices/probabilities were obtained in this review.
  // A future populated economic/identity schema needs its own source-bound review.
  need(Array.isArray(r.verifiedItems)&&r.verifiedItems.length===0&&r.nxPrice===null&&r.rewardProbabilities===null&&r.availabilityVerified===false,'unverified_economics');
 }
 need(Array.isArray(f.referenceNotes)&&f.referenceNotes.length<=16&&Array.isArray(f.limitations)&&f.limitations.length>0&&f.limitations.length<=16,'notes');
 for(const n of f.referenceNotes){keys(n,['sourceId','text']);need(sourceIds.has(n.sourceId),'note_source');text(n.text,600)}
 for(const n of f.limitations)text(n,600);return freeze(f);
}
export function dateLabel(date,instant){
 if(date.precision==='unknown')return 'Unknown';
 if(date.precision==='month')return '('+date.value.slice(5)+'-'+date.value.slice(0,4)+') · month only; day/time unknown';
 if(date.precision==='day')return '('+date.value.slice(5,7)+'-'+date.value.slice(8)+'-'+date.value.slice(0,4)+') · UTC calendar day; time unknown';
 return instant(date.value);
}
