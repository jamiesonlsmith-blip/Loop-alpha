import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';

const load=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const [html,layer,css,social,sw,migration]=await Promise.all([
  load('index.html'),load('social/profile-layer.js'),load('social/profile-layer.css'),
  load('social/profiles-messages.js'),load('sw.js'),load('supabase-profile-age-20261010.sql')
]);

test('profile enhancement and original app scripts parse and are installed in order',()=>{
  assert.doesNotThrow(()=>new Script(layer));
  const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(x=>x[1]).find(source=>source.includes('initializeLoopApp();'));
  assert.ok(inline,'original inline app should exist');
  assert.doesNotThrow(()=>new Script(inline));
  assert.ok(html.indexOf('/social/profiles-messages.js')<html.indexOf('/social/profile-layer.js'));
  assert.match(html,/href="\/social\/profile-layer.css"/);
  for(const asset of ['/social/profile-layer.js','/social/profile-layer.css'])assert.ok(sw.includes(asset),asset);
  assert.match(sw,/loop-alpha-v30/);
});
test('first layer offers concise identity, home, interests, communities and one edit action',()=>{
  for(const heading of ['About','Your preferences','My communities','Your Home Loop']){
    assert.ok(layer.includes(heading),'missing summary '+heading);
  }
  assert.match(layer,/hero\.after\(overview\)/);
  assert.match(layer,/identity'\)\?\.append\(editButton\)/);
  assert.match(layer,/grid\.before\(more\);more\.append\(grid\)/);
  assert.match(layer,/Reputation details, Home Loop & activity/);
  assert.match(css,/\.loop-profile-overview/);
  assert.match(css,/#profileEditor\{width:min\(96vw,650px\)/);
});
test('photo, public-sharing and community controls are moved behind Edit Profile',()=>{
  assert.match(layer,/actions\.before\(controls\)/);
  assert.match(layer,/const manage=document\.createElement\('section'\)/);
  assert.match(layer,/data-profile-community/);
  assert.match(layer,/\.from\('community_memberships'\)\.select\('category'\)/);
  assert.match(layer,/\.delete\(\)\.eq\('user_id',uid\)\.eq\('category',id\)/);
  assert.match(layer,/\.insert\(\{user_id:uid,category:id\}\)/);
  assert.match(layer,/busy=true/);
  assert.match(layer,/data-profile-edit="communities"/);
  assert.match(layer,/openTasteStudio/);
});
test('age is optional, cannot be disclosed without explicit opt-in, and requires authenticated owner update',()=>{
  assert.match(layer,/id="editAge"/);
  assert.match(layer,/id="editShareAge"/);
  assert.match(html,/age_years,share_age/);
  assert.match(html,/age_years:data\.age,share_age:data\.shareAge/);
  assert.match(html,/age:row\?\.age_years\?\?null,shareAge:!!row\?\.share_age/);
  assert.match(html,/!Number\.isInteger\(age\)\|\|age<18\|\|age>120/);
  assert.match(migration,/age_years smallint check \(age_years between 18 and 120\)/);
  assert.match(migration,/share_age boolean not null default false/);
  assert.match(migration,/case when p\.share_age then p\.age_years else null::smallint end/);
  assert.match(migration,/grant update\(age_years,share_age\) on public\.profiles to authenticated/);
  assert.match(migration,/revoke all on function public\.loop_member_cards\(uuid\[\]\) from anon/);
  assert.match(social,/card\.age_years/);
  assert.doesNotMatch(migration,/grant update\s+on public\.profiles/);
});
test('single authenticated profile view does not expose email or private home location in the summary',()=>{
  const intro=layer.split('overview.innerHTML=')[1]?.split('hero.after(overview)')[0]||'';
  assert.doesNotMatch(intro,/email|profileEmailDisplay/i);
  assert.match(intro,/loopOverviewCommunities/);
  assert.match(layer,/Age '\+p\.age\+\(p\.shareAge\?' · Shared with members':' · Only you can see this'\)/);
  assert.match(social,/Number\.isInteger\(age\)/);
});
