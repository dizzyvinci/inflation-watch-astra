import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateAnnouncements,dateLabel} from '../ui-src/upcoming-announcements/contract.mjs';
const source=JSON.parse(fs.readFileSync(new URL('../ui-src/upcoming-announcements/feed.json',import.meta.url)));
test('actual primary source is Classic World only, immutable month-only context and no future economic guesses',()=>{
 const before=JSON.stringify(source),f=validateAnnouncements(source);
 assert(Object.isFrozen(f.records[0]));assert.equal(f.records.length,1);assert.equal(f.records[0].kind,'world_update');
 assert.equal(f.records[0].status,'announced');assert.equal(f.records[0].date.value,'2026-11');
 assert.equal(f.records.filter(r=>r.kind==='fashion'||r.kind==='item').length,0);
 assert.equal(f.records[0].nxPrice,null);assert.equal(f.records[0].rewardProbabilities,null);assert.deepEqual(f.records[0].verifiedItems,[]);
 assert.equal(f.scope.worldNameExplicitInReviewedPosts,false);assert.equal(JSON.stringify(source),before);
});
test('GMS/KMS/other world, unverified source and false date/economic data reject',()=>{
 const changes=[f=>f.scope.game='Global MapleStory',f=>f.scope.region='KMS',f=>f.scope.targetWorld='Scania',f=>f.sources[0].isMSCW=false,f=>f.sources[0].url='https://not-nexon.invalid/news',f=>f.sources[0].cmsUrl='https://g.nexonstatic.com/maplestory/cms/v1/news/47031',f=>f.records[0].sourceIds=['unknown'],f=>f.records[0].status='scheduled',f=>f.records[0].nxPrice=0,f=>f.records[0].rewardProbabilities=[1],f=>f.records[0].verifiedItems=[2040801],f=>f.coverage.automaticMonitoring=true,f=>f.records[0].date={precision:'day',value:'2026-02-30',timeZone:'UTC'},f=>f.sources[0].capturedAt='2027-01-01T00:00:00Z'];
 for(const change of changes){const f=structuredClone(source);change(f);assert.throws(()=>validateAnnouncements(f));}
});
test('announced/scheduled/released/cancelled stay explicit; calendar passage never changes state',()=>{
 for(const status of ['announced','scheduled','released','cancelled']){
  const f=structuredClone(source);f.records[0].status=status;f.records[0].date={precision:'day',value:'2026-11-18',timeZone:'UTC'};
  assert.equal(validateAnnouncements(f).records[0].status,status);
 }
 assert.equal(dateLabel(source.records[0].date,()=>assert.fail()),'(11-2026) · month only; day/time unknown');
 assert.equal(dateLabel({precision:'day',value:'2026-11-18',timeZone:'UTC'},()=>assert.fail()),'(11-18-2026) · UTC calendar day; time unknown');
 assert.equal(dateLabel({precision:'unknown',value:null,timeZone:null},()=>assert.fail()),'Unknown');
});
test('closed source/context arrays and duplicate references reject rather than silently merging',()=>{
 for(const change of [f=>f.records.push(structuredClone(f.records[0])),f=>f.sources.push(structuredClone(f.sources[0])),f=>f.records[0].sourceIds.push(f.records[0].sourceIds[0]),f=>f.coverage.privateDiscordChannelId='forbidden']){
  const f=structuredClone(source);change(f);assert.throws(()=>validateAnnouncements(f));
 }
});
