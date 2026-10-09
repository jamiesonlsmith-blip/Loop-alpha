import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const js=await readFile(new URL('../community/communities-v1.js',import.meta.url),'utf8');
const css=await readFile(new URL('../community/communities-v1.css',import.meta.url),'utf8');
const sql=await readFile(new URL('../supabase-communities.sql',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');

test('community script parses and loads after original application',()=>{
  assert.doesNotThrow(()=>new Script(js));
  assert.match(html,/src="\/community\/communities-v1.js"/);
  assert.match(html,/href="\/community\/communities-v1.css"/);
  assert.ok(html.indexOf('community/communities-v1.js')>html.indexOf('initializeLoopApp()'));
});
test('all 10 Explore category communities support multi-membership',()=>{
  for(const cat of ['restaurants','medical','parks','home-services','auto','retail','travel','fun-games','movies','music']){
    assert.ok(js.includes("id:'"+cat+"'"),cat+' missing from categories');
    assert.ok(sql.includes("'"+cat+"'"),cat+' missing from database validation');
  }
  assert.match(js,/new Set\(\)/);
  assert.match(js,/community_memberships/);
});
test('community posts are real authenticated database contributions, not demo testimonials',()=>{
  for(const table of ['community_posts','community_replies','community_reactions','community_bookmarks']){
    assert.ok(js.includes(table),table+' missing from front end');
    assert.ok(sql.includes('public.'+table),table+' missing from migration');
    assert.ok(sql.includes('alter table public.'+table+' enable row level security;'));
  }
  assert.ok(!js.includes('communitySeedPosts'));
  assert.ok(!js.includes('sample-coffee'));
  assert.match(js,/user_id:user\(\)\.id/);
  assert.match(js,/recordReputationEvent/);
});
test('feed filters and release notes are reachable',()=>{
  for(const tab of ['For You','New','Trending','Nearby','Saved'])assert.ok(js.includes("'"+tab+"'"));
  assert.match(js,/window\.showWhatsNew=function/);
  assert.match(js,/menuLink\.setAttribute\('onclick','showWhatsNew\(\)'\)/);
  assert.match(js,/notification-title-icon/);
  assert.match(css,/\.c1-interest-grid/);
  assert.match(css,/@media\(max-width:400px\)/);
});
test('RLS writes require joined membership and users own their reactions',()=>{
  assert.match(sql,/posts_write_joined/);
  assert.match(sql,/replies_write_joined/);
  assert.match(sql,/reactions_add_joined/);
  assert.match(sql,/user_id=\(select auth\.uid\(\)\)/);
  assert.match(sql,/revoke all on .* from anon/);
});
test('installed app caches new screens and preserves network-first code updates',()=>{
  assert.ok(sw.includes("'/community/communities-v1.js'"));
  assert.ok(sw.includes("'/community/communities-v1.css'"));
  assert.ok(sw.includes('loop-alpha-v27'));
  assert.match(sw,/cache: 'no-store'/);
});
