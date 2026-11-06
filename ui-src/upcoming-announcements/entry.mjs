import raw from './feed.json';
import {validateAnnouncements,dateLabel} from './contract.mjs';
const feed=validateAnnouncements(raw);
if(!window.AstraUpcomingAnnouncements){
 let enabled=false,query='',kind='all',status='all',sort='title',ascending=true;
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const options=document.getElementById('display-options'),content=document.getElementById('content'),nav=document.querySelector('.nav-wrap nav');
 const state=()=>Object.freeze({enabled,sourceReviewAt:feed.reviewedAt,verifiedUpcomingItemLineups:feed.records.filter(r=>r.kind!=='world_update'&&['announced','scheduled'].includes(r.status)).length,automaticMonitoring:false});
 window.AstraUpcomingAnnouncements=Object.freeze({getState:state});
 if(options&&content&&nav&&!document.getElementById('view-upcoming-announcements')){
  const zone=()=>document.getElementById('display-timezone')?.value||'UTC';
  function instant(value){
   let z=zone();try{new Intl.DateTimeFormat('en-US',{timeZone:z})}catch{z='UTC'}
   const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:z,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
   return '('+p.month+'-'+p.day+'-'+p.year+' '+p.hour+':'+p.minute+':'+p.second+' '+p.timeZoneName+')';
  }
  const controls=make('div',undefined,'upcoming-options');controls.dataset.previewControls='upcoming-announcements';
  controls.setAttribute('role','group');controls.setAttribute('aria-label','Upcoming announcements visibility');
  const toggle=make('button');toggle.type='button';toggle.className='upcoming-toggle';toggle.setAttribute('aria-controls','view-upcoming-announcements upcoming-announcements-nav');
  controls.append(toggle,make('small','Optional dated official-news review. Off by default in each tab; no announcement polling or model changes.'));options.append(controls);
  const link=make('a','Upcoming items','nav-link');link.id='upcoming-announcements-nav';link.href='#upcoming-announcements';link.hidden=true;nav.querySelector('.fallback-link')?.before(link);if(!link.isConnected)nav.append(link);
  const view=make('section',undefined,'view upcoming-page');view.id='view-upcoming-announcements';view.hidden=true;view.setAttribute('aria-labelledby','upcoming-announcements-title');
  const h=make('h1','Upcoming fashion & items');h.id='upcoming-announcements-title';
  view.append(make('p','Classic World / official announcements','eyebrow'),h,
   make('p','No upcoming fashion or item lineup is verified in the reviewed official posts.','upcoming-scope'));
  const clocks=make('p',undefined,'upcoming-clocks');view.append(clocks);
  const searchLabel=make('label','Search reviewed announcements '),search=make('input');search.type='search';search.id='upcoming-announcements-search';search.placeholder='Title, category or status';searchLabel.append(search);
  const filterLabel=make('label','Category '),filter=make('select');filter.id='upcoming-announcements-kind';for(const [value,label]of [['all','Fashion and items'],['fashion','Fashion'],['item','Items']]){const o=make('option',label);o.value=value;filter.append(o)}filterLabel.append(filter);
  const statusLabel=make('label','Status '),statusFilter=make('select');statusFilter.id='upcoming-announcements-status';for(const value of ['all','announced','scheduled','released','cancelled']){const o=make('option',value[0].toUpperCase()+value.slice(1));o.value=value;statusFilter.append(o)}statusLabel.append(statusFilter);
  const form=make('div',undefined,'upcoming-filters');form.append(searchLabel,filterLabel,statusLabel);view.append(form);
  const result=make('p',undefined,'upcoming-results');result.setAttribute('role','status');view.append(result);
  const host=make('div',undefined,'table-wrap upcoming-table');host.setAttribute('role','region');host.setAttribute('aria-label','Scrollable reviewed announcements');host.tabIndex=0;view.append(host);
  const legend=make('p','Status: yellow Announced / Scheduled · green Released · red Cancelled.','upcoming-legend');view.append(legend);
  const world=make('section',undefined,'upcoming-world-context');world.setAttribute('aria-label','Separate world-update context');view.append(world);
  const refs=make('details',undefined,'upcoming-sources');view.append(refs);
  function sourceLink(s){const a=make('a',s.title+' ↗');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function draw(){
   link.hidden=!enabled;toggle.textContent='Upcoming items page: '+(enabled?'On':'Off');toggle.setAttribute('aria-pressed',String(enabled));
   clocks.textContent='Reviewed '+instant(feed.reviewedAt)+'.';
   const rows=feed.records.filter(r=>r.kind!=='world_update'&&(kind==='all'||r.kind===kind)&&(status==='all'||r.status===status)&&(r.title+' '+r.kind+' '+r.status+' '+r.summary).toLowerCase().includes(query));
   const sortValue=r=>sort==='date'?r.date.value:r[sort];
   rows.sort((a,b)=>{const av=sortValue(a),bv=sortValue(b);if(av===null)return bv===null?a.title.localeCompare(b.title):1;if(bv===null)return-1;return(ascending?1:-1)*String(av).localeCompare(String(bv))||a.title.localeCompare(b.title)});
   result.textContent=rows.length+' matching fashion/item announcements in this review.';
   host.replaceChildren();const table=make('table'),head=make('thead'),tr=make('tr');
   for(const [key,label]of [['title','Announcement'],['status','Status'],['date','Stated timing'],['source','Official source']]){
    const th=make('th');th.scope='col';th.setAttribute('aria-sort',sort===key?(ascending?'ascending':'descending'):'none');
    if(['title','kind','status','date'].includes(key)){const b=make('button',label+(sort===key?(ascending?' ↑':' ↓'):''));b.type='button';b.dataset.upcomingSort=key;th.append(b)}else th.textContent=label;
    tr.append(th);
   }head.append(tr);table.append(head);const body=make('tbody');
   for(const r of rows){const row=make('tr');row.dataset.announcementId=r.announcementId;const title=make('td');title.append(make('strong',r.title),make('p',r.summary));row.append(title);
    const statusCell=make('td'),dot=make('span','●','announcement-dot '+r.status);dot.setAttribute('aria-hidden','true');statusCell.append(dot,document.createTextNode(' '+r.status[0].toUpperCase()+r.status.slice(1)));row.append(statusCell);
    const date=make('td',dateLabel(r.date,instant));date.dataset.sourceDatePrecision=r.date.precision;row.append(date);
    const source=make('td');for(const id of r.sourceIds){const s=feed.sources.find(s=>s.sourceId===id),part=make('p');part.append(sourceLink(s));const published=make('time',instant(s.publishedAt));published.dateTime=s.publishedAt;const captured=make('time',instant(s.capturedAt));captured.dateTime=s.capturedAt;part.append(make('br'),document.createTextNode('Published '),published,make('br'),document.createTextNode('Retrieved '),captured);source.append(part)}row.append(source);body.append(row);
   }
   if(!rows.length){const empty=make('tr'),cell=make('td','No matching verified fashion or item announcement in this review.');cell.colSpan=4;empty.append(cell);body.append(empty)}
   table.append(body);host.append(table);world.replaceChildren();
   const worldRows=feed.records.filter(r=>r.kind==='world_update');
   if(worldRows.length){world.append(make('h2','Separate world-update context'));for(const r of worldRows){const card=make('p');card.dataset.worldAnnouncement=r.announcementId;const when=make('span',dateLabel(r.date,instant));when.dataset.sourceDatePrecision=r.date.precision;card.append(make('strong',r.title+' · '+r.status+' '),when,document.createTextNode('. '+r.summary+' '),sourceLink(feed.sources.find(s=>s.sourceId===r.sourceIds[0])));world.append(card)}}
   refs.replaceChildren(make('summary','Official sources and review details'));
   refs.append(make('p','This is a dated, bounded manual review, not an automatic announcement feed. Publication/retrieval clocks are separate from release timing and market/trade clocks. Unknown item IDs, NX prices and probabilities are not zero, and no EV or index impact is calculated. Announced/Scheduled are not release confirmations; Released is a source claim, not current shop stock. Calendar passage never changes a record’s status.'));
   for(const s of feed.sources){const para=make('p');para.append(sourceLink(s));const published=make('time',instant(s.publishedAt));published.dateTime=s.publishedAt;const captured=make('time',instant(s.capturedAt));captured.dateTime=s.capturedAt;para.append(make('br'),document.createTextNode('Published '),published,document.createTextNode(' · retrieved '),captured);refs.append(para)}
   for(const n of feed.referenceNotes){const para=make('p',n.text+' ');para.append(sourceLink(feed.sources.find(s=>s.sourceId===n.sourceId)));refs.append(para)}
   for(const n of feed.limitations)refs.append(make('p',n));
  }
  function route(){if(location.hash==='#upcoming-announcements'){if(!enabled){view.hidden=true;location.hash='#index';return;}document.querySelectorAll('.view').forEach(s=>s.hidden=s!==view);link.setAttribute('aria-current','page')}else{view.hidden=true;link.setAttribute('aria-current','false')}}
  toggle.addEventListener('click',()=>{enabled=!enabled;draw();route()});
  search.addEventListener('input',()=>{query=search.value.trim().toLowerCase();draw()});filter.addEventListener('change',()=>{kind=filter.value;draw()});statusFilter.addEventListener('change',()=>{status=statusFilter.value;draw()});
  host.addEventListener('click',e=>{const b=e.target.closest('[data-upcoming-sort]');if(!b)return;ascending=sort===b.dataset.upcomingSort?!ascending:true;sort=b.dataset.upcomingSort;draw();host.querySelector('[data-upcoming-sort="'+sort+'"]')?.focus()});
  document.getElementById('display-timezone')?.addEventListener('change',draw);
  content.append(view);window.addEventListener('hashchange',route);draw();route();
 }
}
