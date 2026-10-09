/* Loop Profiles + Messages 1.0 — real contributors, private async correspondence. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const escHtml=s=>String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const uuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s||''));
const me=()=>typeof currentAuthUser!=='undefined'?currentAuthUser:null;
const db=()=>typeof loopAuthClient!=='undefined'?loopAuthClient:null;
const cache=new Map();
const state={threads:[],messages:[],cards:new Map(),thread:null,loading:false,unread:0};
const icons=['🌿','🌻','🐬','🎬','🎨','🌎','☕','⭐'];
const avatarAllowed=value=>{
  const raw=String(value||'');
  if(raw.startsWith('preset:'))return icons.includes(raw.slice(7))?raw:'';
  try{const u=new URL(raw);return u.protocol==='https:'&&u.hostname.endsWith('.supabase.co')&&u.pathname.includes('/storage/v1/object/public/loop-avatars/')?raw:''}catch{return ''}
};
function avatarHTML(url,name,cssClass='loop-mini-member'){
  const val=avatarAllowed(url);
  if(val.startsWith('preset:'))return '<span class="'+cssClass+'">'+escHtml(val.slice(7))+'</span>';
  if(val)return '<span class="'+cssClass+'"><img loading="lazy" decoding="async" alt="" src="'+escHtml(val)+'"></span>';
  return '<span class="'+cssClass+'">'+escHtml(initialsFor(name||'?'))+'</span>';
}
function myProfile(){return typeof getProfile==='function'?getProfile():{}}
function setCachedProfile(patch){try{const profile={...myProfile(),...patch};localStorage.setItem('loopUserProfileV1',JSON.stringify(profile));window.applyAccountState?.()}catch{}}
function status(message,error=false){const el=$('loopProfileStatus');if(el){el.textContent=message;el.style.color=error?'#a23b35':'#0e6644';}}
function ownAppearance(){
 const p=myProfile(),val=avatarAllowed(p.avatarUrl),name=p.name||'Loop member',signed=!!me();
 for(const el of [$('loopWelcomeAvatar'),$('loopOwnAvatar')]){
  if(!el)continue;
  if(el.id==='loopWelcomeAvatar')el.hidden=!signed;
  if(!signed)continue;
  el.innerHTML=avatarHTML(val,name,el.id==='loopOwnAvatar'?'loop-my-avatar':'loop-welcome-avatar').replace(/^<span[^>]*>/,'').replace(/<\/span>$/,'');
 }
 const hero=$('avatar');
 if(hero&&signed&&val)hero.innerHTML=avatarHTML(val,name,'loop-my-avatar').replace(/^<span[^>]*>/,'').replace(/<\/span>$/,'');
 const picker=$('loopAvatarPicker');
 if(picker&&document.activeElement!==picker){const a=val.startsWith('preset:')?val:'';picker.querySelectorAll('button[data-avatar-preset]').forEach(button=>button.classList.toggle('selected',button.dataset.avatarPreset===a));}
 const interests=$('loopPublicInterests'),share=$('loopShareCommunities'),allow=$('loopAllowMessages');
 if(interests&&document.activeElement!==interests)interests.value=p.publicInterests||'';
 if(share)share.checked=!!p.shareCommunities;
 if(allow)allow.checked=p.allowMessages!==false;
}
const originalApply=window.applyAccountState;
if(typeof originalApply==='function')window.applyAccountState=function(){const r=originalApply.apply(this,arguments);ownAppearance();return r;};
async function cardsFor(ids){
 const valid=[...new Set(ids.filter(uuid))].filter(id=>!cache.has(id));
 if(!valid.length)return;
 const client=db();if(!client||!me())return;
 for(let i=0;i<valid.length;i+=50){
  const set=valid.slice(i,i+50);
  const {data,error}=await client.rpc('loop_member_cards',{target_ids:set});
  if(error){console.warn('Loop member cards:',error.message);return;}
  for(const entry of data||[])cache.set(entry.id,entry);
 }
}
function cardFor(id){return cache.get(id)||state.cards.get(id)||null}
function refreshContributorNodes(){
 document.querySelectorAll('[data-loop-member-avatar]').forEach(node=>{
  const id=node.getAttribute('data-loop-member-avatar'),card=cardFor(id);if(!card)return;
  node.innerHTML=avatarHTML(card.avatar_url,card.display_name,'loop-mini-member').replace(/^<span[^>]*>/,'').replace(/<\/span>$/,'');
 });
 document.querySelectorAll('[data-loop-reputation]').forEach(node=>{
  const card=cardFor(node.getAttribute('data-loop-reputation'));if(card)node.textContent='★ '+Number(card.reputation_score||0).toFixed(1)+'/10';
 });
}
async function enrichCommunity(posts=[],replies=[]){
 const ids=[...posts,...replies].map(p=>p.user_id);
 await cardsFor(ids);
 refreshContributorNodes();
}
function profileMarkup(card){
 const own=card.id===me()?.id,communities=Array.isArray(card.communities)?card.communities:[];
 const members=communities.length?'<div class="loop-public-section"><h3>Communities they share</h3><div class="loop-public-chips">'+communities.map(x=>'<span>'+escHtml(x.replace(/-/g,' '))+'</span>').join('')+'</div></div>':'';
 return '<div class="loop-public-inner"><div class="loop-public-head"><small>Loop member · Public profile</small><button type="button" class="loop-close" data-loop-close aria-label="Close profile">×</button></div>'+
   avatarHTML(card.avatar_url,card.display_name,'loop-public-avatar')+
   '<h2 class="loop-public-title">'+escHtml(card.display_name)+'</h2>'+
   '<div class="loop-public-rep">★ '+Number(card.reputation_score||0).toFixed(1)+'/10 · Loop Reputation</div>'+
   '<div class="loop-public-section"><h3>Interests</h3><p>'+escHtml(card.public_interests||'No interests shared yet')+'</p></div>'+
   members+
   '<div class="loop-public-foot"><button type="button" class="loop-member-message" data-loop-contact="'+escHtml(card.id)+'" '+(own||!card.allow_messages?'disabled':'')+'>'+(own?'Your profile':!card.allow_messages?'Not accepting messages':'✉ Ask a question')+'</button></div>'+
   '<p class="loop-public-note">Only shared interests and communities appear here. Email, work details and private preferences stay private. Message people respectfully about their contributions.</p></div>';
}
async function openMember(id){
 if(!uuid(id))return;
 if(!me()){requireProfile('Messages');return;}
 const modal=$('loopPublicProfileDialog'),content=$('loopPublicProfileContent');
 if(!modal||!content)return;
 content.innerHTML='<div class="loop-public-inner">Loading member profile…</div>';
 modal.showModal();
 await cardsFor([id]);
 const card=cardFor(id);
 content.innerHTML=card?profileMarkup(card):'<div class="loop-public-inner"><button class="loop-close" data-loop-close aria-label="Close">×</button><p>That public member profile is not available yet.</p></div>';
}
function createProfileControls(){
 const before=$('memberProfileContent')?.querySelector('.profile-grid');if(!before)return;
 const el=document.createElement('section');el.className='loop-profile-settings';el.id='loopProfileSettings';
 el.innerHTML='<h2>Your picture & public profile</h2>'+
  '<p>Choose an optional photo or avatar. Your name, reputation, and interests you choose to share help others understand your recommendations. Your email never appears on your public profile.</p>'+
  '<div class="loop-own-avatar-row"><div id="loopOwnAvatar" class="loop-my-avatar">?</div><div><label for="loopAvatarUpload">Add a picture (optional)</label><input id="loopAvatarUpload" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="loopAvatarHint"><div id="loopAvatarHint" class="loop-avatar-hint">JPG, PNG or WebP, 2 MB maximum. Photos appear publicly next to your contributions.</div></div></div>'+
  '<label class="loop-field">Or use an avatar</label><div id="loopAvatarPicker" class="loop-avatar-choices">'+icons.map(x=>'<button type="button" data-avatar-preset="preset:'+x+'" aria-label="Use '+x+' avatar">'+x+'</button>').join('')+'</div>'+
  '<label class="loop-field" for="loopPublicInterests">Interests to display to other Loop members</label>'+
  '<input id="loopPublicInterests" type="text" maxlength="180" placeholder="Pizza, family parks, movies, auto care…">'+
  '<label class="loop-toggle"><input id="loopShareCommunities" type="checkbox"><span>Show communities I joined on my public profile</span></label>'+
  '<label class="loop-toggle"><input id="loopAllowMessages" type="checkbox" checked><span>Let members ask me questions about my recommendations</span></label>'+
  '<button class="loop-primary" type="button" id="loopSavePublicProfile">Save public profile</button> <button class="secondary" type="button" id="loopPreviewOwnProfile">Preview my public profile</button>'+
  '<p id="loopProfileStatus" class="loop-profile-status" role="status"></p>';
 before.before(el);
 ownAppearance();
}
async function savePublicSettings(){
 const p=myProfile();
 if(!me()||!db())return status('Sign in to save your public profile.',true);
 const patch={public_interests:$('loopPublicInterests').value.trim(),share_communities:$('loopShareCommunities').checked,allow_messages:$('loopAllowMessages').checked};
 if(patch.public_interests.length>180)return status('Use 180 characters or fewer.',true);
 const {error}=await db().from('profiles').update(patch).eq('id',me().id);
 if(error){status('Could not save: '+error.message,true);return;}
 setCachedProfile({publicInterests:patch.public_interests,shareCommunities:patch.share_communities,allowMessages:patch.allow_messages});
 cache.delete(me().id);status('Your public profile has been saved.');
}
async function setAvatar(avatar){
 if(!me()||!db())return status('Sign in to add a public picture.',true);
 const safe=avatarAllowed(avatar);if(!safe)return status('Please choose a valid avatar.',true);
 const {error}=await db().from('profiles').update({avatar_url:safe}).eq('id',me().id);
 if(error){status('Picture could not be saved: '+error.message,true);return;}
 setCachedProfile({avatarUrl:safe});cache.delete(me().id);status('Profile picture updated.');
}
async function uploadAvatar(file){
 if(!file||!me()||!db())return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2097152||file.size===0){
  status('Choose a JPG, PNG or WebP image under 2 MB.',true);return;
 }
 status('Uploading your picture…');
 const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
 const path=me().id+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;
 const {error}=await db().storage.from('loop-avatars').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
 if(error){status('Upload failed: '+error.message,true);return;}
 const {data}=db().storage.from('loop-avatars').getPublicUrl(path);
 await setAvatar(data.publicUrl);
}
function buildMessages(){
 const page=$('messengerPage');if(!page)return;
 const badge=page.querySelector('.detail-header .meta');if(badge)badge.textContent='Private member correspondence';
 const shell=page.querySelector('.messenger-shell');if(!shell)return;
 shell.className='loop-msg-shell';
 shell.innerHTML='<header class="loop-msg-head"><h2>Messages</h2><p>Ask about firsthand recommendations and reply when it suits you. Not a live-chat service.</p></header><div id="loopMessagesBody" aria-live="polite"></div>';
 const nav=$('navMessenger');const navLabel=nav?.lastElementChild;if(navLabel)navLabel.textContent='Messages';
 const menu=[...document.querySelectorAll('.drawer-link')].find(x=>x.getAttribute('onclick')==='showMessenger()');
 if(menu)menu.innerHTML='<span class="mi">✉</span>Messages';
 const existing=window.showMessenger;
 window.showMessenger=function(){existing.apply(this,arguments);if(page.classList.contains('active'))loadInbox();};
 const notice=$('activityPage')?.querySelector('.update-list');
 if(notice){const card=document.createElement('div');card.id='loopInboxActivity';notice.before(card);}
}
function pairs(a,b){return a.toLowerCase()<b.toLowerCase()?{member_a:a,member_b:b}:{member_a:b,member_b:a}}
async function openMessagesWith(id){
 if(!uuid(id)||!me()||!db())return;
 if(me().id===id)return;
 const permission=await db().rpc('loop_can_contact',{target:id,requester:me().id,require_contribution:true});
 if(permission.error||!permission.data){notify('This member is not accepting new questions.');return;}
 let row=state.threads.find(t=>[t.member_a,t.member_b].includes(id));
 if(!row){
  const pair=pairs(me().id,id);
  const match=await db().from('loop_message_threads').select('*').eq('member_a',pair.member_a).eq('member_b',pair.member_b).maybeSingle();
  row=match.data;
  if(!row){
   const created=await db().from('loop_message_threads').insert(pair).select('*').single();
   if(created.error){
    const retry=await db().from('loop_message_threads').select('*').eq('member_a',pair.member_a).eq('member_b',pair.member_b).maybeSingle();
    if(!retry.data){notify('Unable to start a conversation. '+(created.error.message||''));return;}
    row=retry.data;
   }else row=created.data;
  }
 }
 $('loopPublicProfileDialog')?.close();
 window.showMessenger();
 state.thread=row.id;
 await loadInbox();
}
function otherPerson(t){return t.member_a===me()?.id?t.member_b:t.member_a}
function displayTime(value){try{return new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}catch{return ''}}
async function loadInbox(){
 if(!me()||!db()){const content=$('loopMessagesBody');if(content)content.innerHTML='<div class="loop-msg-card">Sign in to view your private messages.</div>';return;}
 if(state.loading)return;
 state.loading=true;
 try{
  const id=me().id,client=db();
  const response=await client.from('loop_message_threads').select('id,member_a,member_b,created_at,updated_at').or('member_a.eq.'+id+',member_b.eq.'+id).order('updated_at',{ascending:false}).limit(60);
  if(response.error)throw response.error;
  state.threads=response.data||[];
  await cardsFor(state.threads.map(otherPerson));
  if(state.threads.length){
   const m=await client.from('loop_messages').select('id,thread_id,sender_id,body,created_at,read_at').in('thread_id',state.threads.map(t=>t.id)).order('created_at',{ascending:false}).limit(400);
   if(m.error)throw m.error;
   state.messages=m.data||[];
  }else state.messages=[];
  if(state.thread&&!state.threads.some(t=>t.id===state.thread))state.thread=null;
  if(state.thread)await markRead(state.thread);
  showMessageUI();
  await refreshUnread();
 }catch(e){const el=$('loopMessagesBody');if(el)el.innerHTML='<div class="loop-msg-card loop-messages-error">Messages could not load: '+escHtml(e?.message||'Please try again')+' <button type="button" data-msg-action="reload">Try again</button></div>';}
 finally{state.loading=false;}
}
function showMessageUI(){
 const el=$('loopMessagesBody');if(!el)return;
 if(!state.thread){
  if(!state.threads.length){el.innerHTML='<div class="loop-msg-card loop-messages-empty"><b>No messages yet</b><p>When a member asks about one of your recommendations—or you ask about theirs—the conversation will appear here.</p><button class="loop-primary" type="button" data-msg-action="community">Explore recommendations</button></div>';return;}
  el.innerHTML='<section class="loop-msg-card"><h3>Your conversations</h3><p class="loop-messages-muted">Private, asynchronous replies. We only show messages between the participants.</p>'+
    state.threads.map(t=>{
     const id=otherPerson(t),c=cardFor(id),messages=state.messages.filter(m=>m.thread_id===t.id),last=messages[0];
     const unread=messages.filter(m=>m.sender_id!==me().id&&!m.read_at).length;
     return '<button class="loop-message-item" type="button" data-msg-action="thread" data-id="'+escHtml(t.id)+'">'+
      avatarHTML(c?.avatar_url,c?.display_name||'Member','loop-message-avatar')+
      '<span class="loop-message-person"><b>'+escHtml(c?.display_name||'Loop member')+'</b><small>'+escHtml(last?.body||'Tap to write your first message')+'</small></span>'+
      (unread?'<span class="loop-unread-count">'+unread+'</span>':'')+'</button>';
    }).join('')+'</section>';
  return;
 }
 const t=state.threads.find(x=>x.id===state.thread);if(!t){state.thread=null;return showMessageUI();}
 const recipient=otherPerson(t),c=cardFor(recipient);
 const messages=state.messages.filter(m=>m.thread_id===t.id).reverse();
 const bubbles=messages.map(m=>'<div class="loop-bubble'+(m.sender_id===me().id?' mine':'')+'"><span>'+escHtml(m.body)+'</span><time>'+escHtml(displayTime(m.created_at))+'</time>'+
  (m.sender_id!==me().id?'<button type="button" data-msg-action="report" data-id="'+escHtml(m.id)+'">Report message</button>':'')+'</div>').join('');
 el.innerHTML='<section class="loop-msg-card"><div class="loop-thread-bar"><button type="button" data-msg-action="inbox">← Inbox</button>'+avatarHTML(c?.avatar_url,c?.display_name,'loop-message-avatar')+'<b>'+escHtml(c?.display_name||'Loop member')+'</b><button data-loop-member="'+escHtml(recipient)+'" type="button" aria-label="View profile">Profile</button></div>'+
  '<p class="loop-thread-meta">Ask questions about their recommendations. Messages may be answered later; this is not live chat.</p>'+
  '<div class="loop-bubbles">'+(bubbles||'<p class="loop-messages-muted">Start with a question about a recommendation or experience.</p>')+'</div>'+
  '<form id="loopComposeForm" class="loop-compose"><label for="loopComposeText">Your message</label><textarea id="loopComposeText" maxlength="800" minlength="2" required placeholder="Hi! I saw your recommendation. Can I ask…?"></textarea>'+
  '<div class="loop-compose-actions"><span class="loop-messages-muted">2–800 characters · Be kind</span><button type="submit" class="loop-messages-send">Send message</button></div></form>'+
  '<div class="loop-report-controls"><button type="button" data-msg-action="block" data-id="'+escHtml(recipient)+'">Block member</button><button type="button" data-msg-action="refresh">Refresh replies ↻</button></div></section>';
}
async function markRead(thread){
 if(!db()||!me())return;
 const res=await db().rpc('loop_mark_thread_read',{target_thread:thread});
 if(res.error){console.warn('Loop message receipts:',res.error.message);return;}
 state.messages.filter(m=>m.thread_id===thread&&m.sender_id!==me().id).forEach(m=>m.read_at=new Date().toISOString());
}
async function sendMessage(){
 const body=$('loopComposeText')?.value.trim(),thread=state.thread;
 if(!body||body.length<2||body.length>800||!thread)return;
 const submit=$('loopComposeForm')?.querySelector('[type=submit]');if(submit)submit.disabled=true;
 const {error}=await db().from('loop_messages').insert({thread_id:thread,sender_id:me().id,body});
 if(error){notify('Message could not be sent: '+error.message);if(submit)submit.disabled=false;return;}
 await loadInbox();notify('Message sent');
}
async function refreshUnread(){
 if(!me()||!db()){state.unread=0;updateBadges();return;}
 try{
  const {count,error}=await db().from('loop_messages').select('id',{head:true,count:'exact'}).neq('sender_id',me().id).is('read_at',null);
  if(!error)state.unread=count||0;
 }catch{}
 updateBadges();
}
function updateBadges(){
 let node=$('loopMessagesNavBadge');const nav=$('navMessenger')?.lastElementChild;
 if(nav&&!node){node=document.createElement('span');node.id='loopMessagesNavBadge';node.className='loop-msg-badge';nav.append(node)}
 if(node){node.textContent=state.unread;node.hidden=!state.unread}
 const bell=$('homeNoticeDot');if(bell&&state.unread)bell.style.display='block';
 const card=$('loopInboxActivity');if(card){
  card.innerHTML='<article class="loop-notify-message"><span>✉</span><span><strong>'+ (state.unread?state.unread+' unread message'+(state.unread===1?'':'s'):'Your messages')+'</strong><br><small>Private member questions and replies</small></span><button type="button" data-msg-action="inbox-open">Open Messages</button></article>';
 }
}
async function blockMember(id){
 if(!uuid(id)||!me()||!confirm('Block this member? They will not be able to send you more messages, and you will not be able to message them.'))return;
 const {error}=await db().from('loop_blocks').insert({blocker_id:me().id,blocked_id:id});
 if(error&&error.code!=='23505'){notify('Unable to block: '+error.message);return;}
 state.thread=null;await loadInbox();notify('Member blocked. You can manage blocks in a future safety update.');
}
function setupDialogs(){
 const dialog=document.createElement('dialog');dialog.id='loopPublicProfileDialog';dialog.className='loop-public-dialog';
 dialog.innerHTML='<div id="loopPublicProfileContent"></div>';document.body.append(dialog);
 const report=document.createElement('dialog');report.id='loopReportDialog';report.className='loop-public-dialog';
 report.innerHTML='<form id="loopReportForm" class="loop-public-inner"><div class="loop-public-head"><b>Report a message</b><button type="button" class="loop-close" data-loop-close aria-label="Close">×</button></div>'+
 '<p class="loop-messages-muted">Reports go to Loop moderation for review. Report harassment, bullying, hate, spam, or other violations.</p>'+
 '<input id="loopReportMessageId" type="hidden">'+
 '<label class="loop-field" for="loopReportReason">Reason</label><select id="loopReportReason"><option>Harassment</option><option>Bullying</option><option>Hate</option><option>Spam</option><option>Inappropriate</option><option>Other</option></select>'+
 '<label class="loop-field" for="loopReportDetails">More details (optional)</label><textarea id="loopReportDetails" maxlength="450" rows="3" placeholder="What happened?"></textarea>'+
 '<div class="loop-compose-actions"><button type="button" class="secondary" data-loop-close>Cancel</button><button type="submit" class="loop-primary">Submit report</button></div></form>';
 document.body.append(report);
}
async function sendReport(){
 const message_id=$('loopReportMessageId').value,reason=$('loopReportReason').value,details=$('loopReportDetails').value.trim();
 if(!uuid(message_id))return;
 const {error}=await db().from('loop_message_reports').insert({message_id,reporter_id:me().id,reason,details});
 if(error){notify(error.code==='23505'?'You already reported this message.':'Report failed: '+error.message);return;}
 $('loopReportDialog').close();notify('Report submitted to the Loop moderation queue.');
}
function bindEvents(){
 document.addEventListener('click',async event=>{
  const close=event.target.closest('[data-loop-close]');
  if(close){close.closest('dialog')?.close();return;}
  const member=event.target.closest('[data-loop-member]');if(member){await openMember(member.dataset.loopMember);return;}
  const contact=event.target.closest('[data-loop-contact]');if(contact){await openMessagesWith(contact.dataset.loopContact);return;}
  const preset=event.target.closest('[data-avatar-preset]');if(preset){await setAvatar(preset.dataset.avatarPreset);return;}
  if(event.target.closest('#loopSavePublicProfile')){await savePublicSettings();return;}
  if(event.target.closest('#loopPreviewOwnProfile')){await openMember(me()?.id);return;}
  const action=event.target.closest('[data-msg-action]');if(!action)return;
  const key=action.dataset.msgAction,id=action.dataset.id;
  if(key==='community'){showCommunity();return;}
  if(key==='inbox'){state.thread=null;showMessageUI();return;}
  if(key==='inbox-open'){window.showMessenger();return;}
  if(key==='thread'){state.thread=id;await markRead(id);showMessageUI();await refreshUnread();return;}
  if(key==='refresh'||key==='reload'){await loadInbox();return;}
  if(key==='block'){await blockMember(id);return;}
  if(key==='report'){const target=$('loopReportMessageId');if(target)target.value=id;$('loopReportDialog').showModal();return;}
 });
 document.addEventListener('change',event=>{if(event.target.id==='loopAvatarUpload')uploadAvatar(event.target.files?.[0]);});
 document.addEventListener('submit',event=>{
  if(event.target.id==='loopComposeForm'){event.preventDefault();sendMessage();}
  if(event.target.id==='loopReportForm'){event.preventDefault();sendReport();}
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshUnread();});
 window.addEventListener('focus',()=>refreshUnread());
 setInterval(()=>{if(!document.hidden&&me()){if($('messengerPage')?.classList.contains('active'))loadInbox();else refreshUnread();}},90000);
}
const oldShowNotifications=window.showNotifications;
if(typeof oldShowNotifications==='function')window.showNotifications=function(){oldShowNotifications.apply(this,arguments);refreshUnread();};
function init(){
 createProfileControls();setupDialogs();buildMessages();bindEvents();ownAppearance();
 refreshUnread();
}
window.LoopProfiles={enrichCommunity,openMember,openMessagesWith,refreshUnread,avatarHTML};
init();
})();
