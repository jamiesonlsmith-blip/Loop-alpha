import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const community=await readFile(new URL('../community/communities-v1.js',import.meta.url),'utf8');
const js=await readFile(new URL('../social/profiles-messages.js',import.meta.url),'utf8');
const css=await readFile(new URL('../social/profiles-messages.css',import.meta.url),'utf8');
const sql=await readFile(new URL('../supabase-profiles-messages.sql',import.meta.url),'utf8');
const policy=await readFile(new URL('../supabase-profiles-messages-policy-fix.sql',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');

test('profiles and messages scripts parse and load after original app and Community',()=>{
  assert.doesNotThrow(()=>new Function(js));
  assert.doesNotThrow(()=>new Function(community));
  assert.match(html,/src="\/social\/profiles-messages.js"/);
  assert.match(html,/href="\/social\/profiles-messages.css"/);
  assert.ok(html.indexOf('community/communities-v1.js')<html.indexOf('social/profiles-messages.js'));
});
test('navigation calls Messages instead of old Messenger branding',()=>{
  assert.match(html,/<span>Messages<\/span>/);
  assert.match(html,/Use Messages and interact with community experiences/);
  assert.match(js,/Not a live-chat service/);
  assert.match(js,/Private, asynchronous replies/);
});
test('real community contributor IDs power clickable profiles, no fictitious identity',()=>{
  assert.match(community,/data-loop-member.*latestId\(p\.user_id\)/);
  assert.match(community,/data-loop-member.*latestId\(r\.user_id\)/);
  assert.match(community,/data-loop-reputation/);
  assert.match(community,/LoopProfiles\.enrichCommunity/);
  assert.match(js,/loop_member_cards/);
  assert.match(js,/public_interests/);
});
test('optional photo or presets and home avatar are available to signed-in members',()=>{
  assert.match(html,/id="loopWelcomeAvatar"/);
  assert.match(js,/id="loopAvatarUpload"/);
  assert.match(js,/image\/webp/);
  assert.match(js,/2097152/);
  assert.match(js,/share_communities/);
  assert.match(js,/allow_messages/);
  assert.match(sql,/loop-avatars/);
  assert.match(sql,/profiles/);
});
test('private messages use authenticated participant RLS and no email lookup',()=>{
  assert.match(sql,/messages_private_participants/);
  assert.match(sql,/threads_read_participant/);
  assert.match(policy,/loop_can_contact/);
  assert.match(sql,/loop_mark_thread_read/);
  assert.match(sql,/revoke all on public.loop_messages from anon/);
  assert.match(sql,/revoke all on function public.loop_member_cards/);
  assert.doesNotMatch(sql,/auth\.users.*email/i);
  assert.doesNotMatch(js,/mailto:|sendMail\(/);
});
test('member safety includes block, report, and server-side send rate limits',()=>{
  for(const table of ['loop_blocks','loop_message_reports','loop_messages','loop_message_threads'])assert.ok(sql.includes(table));
  assert.match(sql,/reports_submit_recipient/);
  assert.match(sql,/created_at>now\(\)-interval '1 minute'/);
  assert.match(js,/Report message/);
  assert.match(js,/Block member/);
});
test('in-app notices and installed app updates include new files',()=>{
  assert.match(js,/refreshUnread/);
  assert.match(js,/loopInboxActivity/);
  assert.match(sw,/loop-alpha-v28/);
  for(const asset of ['/social/profiles-messages.css','/social/profiles-messages.js'])assert.ok(sw.includes(asset));
  assert.match(sw,/social\\\//);
});

test('Profile has a single bottom navigation entry and drawer uses the saved member avatar',()=>{
  assert.match(html,/<button id="navYou" onclick="showProfile\(\)">\s*<span class="nav-icon">☺<\/span><span>Profile<\/span>/);
  assert.doesNotMatch(html,/<span class="mi">☺<\/span>Profile & Reputation<\/button>/);
  assert.match(html,/function syncDrawerAvatar\(element,profile\)/);
  assert.match(html,/syncDrawerAvatar\(drawerAvatar,data\)/);
  assert.match(html,/profile\?\.avatarUrl/);
  assert.match(html,/\.drawer-avatar img\{width:100%;height:100%;object-fit:cover/);
  assert.match(html,/if\(drawerAvatar\)drawerAvatar.textContent='G'/);
});
