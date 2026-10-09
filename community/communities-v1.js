/* Loop Communities 1.0: authenticated shared discussions, personalized to joined interests. */
(function () {
  'use strict';
  const categories=[
    {id:'restaurants',name:'Restaurants',icon:'🍽️',hint:'Dining & food'},
    {id:'medical',name:'Medical',icon:'✚',hint:'Health services'},
    {id:'parks',name:'Parks',icon:'🌳',hint:'Outdoors & family'},
    {id:'home-services',name:'Home Services',icon:'🏠',hint:'Trusted help'},
    {id:'auto',name:'Auto',icon:'🚙',hint:'Cars & repairs'},
    {id:'retail',name:'Retail',icon:'🛍️',hint:'Shops & style'},
    {id:'travel',name:'Travel',icon:'✈️',hint:'Trips & travel'},
    {id:'fun-games',name:'Fun & Games',icon:'🎮',hint:'Activities & play'},
    {id:'movies',name:'Movies & TV',icon:'🎬',hint:'Shows & films'},
    {id:'music',name:'Music',icon:'🎵',hint:'Artists & concerts'}
  ];
  const byId=Object.fromEntries(categories.map(c=>[c.id,c]));
  const state={member:null,joined:new Set(),active:'all',tab:'For You',posts:[],replies:[],reactions:[],bookmarks:[],busy:false,loading:false,error:'',ready:false};
  const shell=document.querySelector('#communityPage .community-shell');
  if(!shell)return;
  const safe=(v)=>esc(String(v==null?'':v));
  const displayDate=(iso)=>{const dt=new Date(iso);return isNaN(dt.getTime())?'Recently':dt.toLocaleDateString(undefined,{month:'short',day:'numeric'})};
  const user=()=>typeof currentAuthUser!=='undefined'?currentAuthUser:null;
  const db=()=>typeof loopAuthClient!=='undefined'?loopAuthClient:null;
  const categoryLabel=(key)=>byId[key]?byId[key].name:'Community';
  const categoryIcon=(key)=>byId[key]?byId[key].icon:'◎';
  const homeArea=()=>String(getProfile().location||'').trim().slice(0,90);
  const latestId=(id)=>String(id||'').replace(/[^a-f0-9-]/gi,'');
  function buildShell(){
    shell.innerHTML=[
      '<section class="c1-hero">',
      '<span class="c1-overline">LOOP COMMUNITIES 1.0 · EARLY ACCESS</span>',
      '<h1>Community, built around you.</h1>',
      '<p>Find people who share your interests. Trade real recommendations, make discoveries and build a reputation for helping others choose better.</p>',
      '<div class="c1-hero-stats"><span id="c1MemberCount">Choose your interests</span><span>Reviews · Recommendations · Reputation</span></div>',
      '</section>',
      '<div class="c1-section-head" id="c1DiscoverTitle"><div><h2>Discover communities</h2><p>Join as many as you like. Your interests shape your feed.</p></div></div>',
      '<div class="c1-interest-grid" id="c1Interests"></div>',
      '<div class="c1-section-head"><div><h2>My Communities</h2><p>Jump between interests or view them together.</p></div><button class="c1-text-action" data-action="manage">Manage interests ↗</button></div>',
      '<div class="c1-mine" id="c1Mine"></div>',
      '<div class="c1-composer"><span id="c1Avatar" class="c1-avatar">◎</span><button data-action="compose">Share a recommendation, question or discovery…</button></div>',
      '<div class="c1-section-head"><div><h2 id="c1FeedTitle">Your community feed</h2><p id="c1FeedDescription">Real discoveries, relevant to you.</p></div><button class="c1-text-action" data-action="reload" aria-label="Refresh community feed">↻ Refresh</button></div>',
      '<div class="c1-tabs" id="c1Tabs" aria-label="Filter community feed"></div>',
      '<div class="c1-notice" id="c1Note">Only real members’ posts appear here. Content is sorted using your interests and community activity.</div>',
      '<div id="c1Error" role="status" aria-live="polite"></div>',
      '<div class="c1-feed" id="c1Feed" aria-live="polite"></div>'
    ].join('');
  }
  function setError(message){state.error=message;document.getElementById('c1Error').innerHTML=message?'<div class="c1-error">'+safe(message)+'</div>':''}
  function renderInterests(){
    document.getElementById('c1Interests').innerHTML=categories.map(c=>{
      const joined=state.joined.has(c.id);
      return '<article class="c1-interest'+(joined?' joined':'')+'">' +
        '<span class="c1-interest-icon">'+c.icon+'</span>' +
        '<strong>'+safe(c.name)+'</strong><small>'+safe(c.hint)+'</small>' +
        '<button data-action="join" data-category="'+c.id+'" '+(state.busy?'disabled':'')+' aria-label="'+(joined?'Leave ':'Join ')+safe(c.name)+' community">'+(joined?'✓ Joined':'+ Join')+'</button>' +
        '<button data-action="browse" data-category="'+c.id+'" style="background:transparent;color:#46705a;margin-top:0;padding:2px" aria-label="Browse '+safe(c.name)+' posts">Browse posts ›</button>' +
        '</article>';
    }).join('');
    document.getElementById('c1MemberCount').textContent=state.joined.size+' '+(state.joined.size===1?'community':'communities')+' joined';
    document.getElementById('c1Avatar').textContent=initialsFor(getProfile().name||'Loop member');
  }
  function renderMine(){
    let out='';
    if(!state.joined.size)out='<div class="c1-empty-mine">No communities joined yet. Pick a topic above to start your Loop.</div>';
    else {
      out='<button class="c1-pill'+(state.active==='all'?' on':'')+'" data-action="browse" data-category="all">◎ All yours</button>';
      out+=categories.filter(c=>state.joined.has(c.id)).map(c=>
        '<button class="c1-pill'+(state.active===c.id?' on':'')+'" data-action="browse" data-category="'+c.id+'"><span>'+c.icon+'</span>'+safe(c.name)+'</button>'
      ).join('');
    }
    if(state.active!=='all'&&!state.joined.has(state.active)){
      out+='<button class="c1-pill on" data-action="browse" data-category="'+safe(state.active)+'">'+categoryIcon(state.active)+' '+safe(categoryLabel(state.active))+' · Preview</button>';
    }
    document.getElementById('c1Mine').innerHTML=out;
    document.getElementById('c1FeedTitle').textContent=state.active==='all'?'Your community feed':categoryLabel(state.active)+' community';
    document.getElementById('c1FeedDescription').textContent=state.active==='all'?'Stories from the interests you follow.':'Posts shared in '+categoryLabel(state.active)+'.';
  }
  function renderTabs(){
    document.getElementById('c1Tabs').innerHTML=['For You','New','Trending','Nearby','Saved'].map(tab=>
      '<button class="'+(state.tab===tab?'on':'')+'" data-action="tab" data-tab="'+tab+'">'+
      ({'For You':'✦ For You','New':'✨ New','Trending':'🔥 Trending','Nearby':'📍 Nearby','Saved':'♡ Saved'}[tab])+'</button>'
    ).join('');
  }
  function counts(id){
    const likes=state.reactions.filter(r=>r.post_id===id);
    const replies=state.replies.filter(r=>r.post_id===id);
    return {likes,replies,liked:likes.some(r=>r.user_id===user()?.id),saved:state.bookmarks.some(b=>b.post_id===id)};
  }
  function score(post){
    const n=counts(post.id),hours=Math.max(0,(Date.now()-new Date(post.created_at).getTime())/3600000);
    return Math.min(18,n.likes.length*2)+Math.min(18,n.replies.length*3)+Math.max(0,12-hours/5);
  }
  function selection(){
    const area=homeArea().toLowerCase();
    let posts=state.posts.filter(p=>state.active!=='all'?p.category===state.active:state.joined.has(p.category));
    if(state.tab==='Saved')posts=posts.filter(p=>state.bookmarks.some(b=>b.post_id===p.id));
    if(state.tab==='Nearby')posts=posts.filter(p=>!!area&&!!p.area&&p.area.toLowerCase().trim()===area);
    if(state.tab==='Trending')posts.sort((a,b)=>score(b)-score(a)||new Date(b.created_at)-new Date(a.created_at));
    else if(state.tab==='For You')posts.sort((a,b)=>score(b)+8*(b.topic==='Recommendation')-score(a)-8*(a.topic==='Recommendation')||new Date(b.created_at)-new Date(a.created_at));
    else posts.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    return posts;
  }
  function renderFeed(){
    const box=document.getElementById('c1Feed');
    if(state.loading){box.innerHTML='<div class="c1-placeholder"><strong>Connecting to your Loop…</strong><p>Loading real conversations from members.</p></div>';return}
    if(state.error){box.innerHTML='';return}
    if(state.active==='all'&&!state.joined.size){
      box.innerHTML='<div class="c1-placeholder"><strong>Your Loop begins with your interests.</strong><p>Join Restaurants, Parks, Music, Travel—or any combination you like—to create your personalized community feed.</p><button data-action="manage">Choose communities</button></div>';return;
    }
    const posts=selection();
    if(!posts.length){
      const saved=state.tab==='Saved',nearby=state.tab==='Nearby';
      box.innerHTML='<div class="c1-placeholder"><strong>'+(saved?'No saved posts yet':nearby?'Nothing from your home area yet':'Be the first to start the conversation')+
        '</strong><p>'+(saved?'Tap Save on recommendations worth revisiting.':nearby?'Nearby uses the general home area in your profile, not your live location.':'Real contributions will show here when members share. No made-up reviews or activity counts.')+
        '</p><button data-action="'+(state.active!=='all'&&!state.joined.has(state.active)?'join':'compose')+'" '+(state.active!=='all'&&!state.joined.has(state.active)?'data-category="'+state.active+'"':'')+'>'+(state.active!=='all'&&!state.joined.has(state.active)?'Join this community':'Share something useful')+'</button></div>';return;
    }
    box.innerHTML=posts.map(p=>{
      const n=counts(p.id),own=p.user_id===user()?.id,joined=state.joined.has(p.category);
      const replies=n.replies.slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
      return '<article class="c1-post"><div class="c1-post-head"><span class="c1-avatar">'+safe(initialsFor(p.author_name))+'</span>'+
        '<span class="c1-byline"><b>'+safe(p.author_name)+'</b><small>'+categoryIcon(p.category)+' '+safe(categoryLabel(p.category))+
        (p.area?' · '+safe(p.area):'')+' · '+displayDate(p.created_at)+'</small></span><span class="c1-post-kind">'+safe(p.topic)+'</span></div>'+
        '<div class="c1-post-body">'+safe(p.content)+'</div>'+
        (replies.length?'<div class="c1-post-replies">'+replies.map(r=>'<div class="c1-reply"><b>'+safe(r.author_name)+'</b>'+safe(r.content)+'</div>').join('')+'</div>':'')+
        '<div class="c1-post-actions"><button class="'+(n.liked?'on':'')+'" data-action="like" data-id="'+latestId(p.id)+'">'+(n.liked?'♥':'♡')+' Helpful · '+n.likes.length+'</button>'+
        '<button data-action="reply" data-id="'+latestId(p.id)+'">💬 Reply · '+n.replies.length+'</button>'+
        '<button class="'+(n.saved?'on':'')+'" data-action="save" data-id="'+latestId(p.id)+'">'+(n.saved?'✓ Saved':'♧ Save')+'</button>'+
        '<button data-action="explore" data-category="'+safe(p.category)+'">⌕ Explore</button>'+
        (!joined?'<button data-action="join" data-category="'+safe(p.category)+'">+ Join</button>':'')+
        (own?'<button data-action="remove" data-id="'+latestId(p.id)+'">Delete</button>':'')+
        '</div></article>';
    }).join('');
    const note=document.getElementById('c1Note');
    note.textContent=state.tab==='Nearby'?'Nearby matches your profile’s general home area, not GPS distance.':state.tab==='Trending'?'Trending reflects recent helpful reactions and replies, not inflated sample counts.':'Recommendations are shared by actual Loop members. Helpfulness and relevance matter more than popularity.';
  }
  function draw(){renderInterests();renderMine();renderTabs();setError(state.error);renderFeed()}
  async function loadData(){
    if(state.loading)return;
    const auth=user(),client=db();
    if(!auth||!client){state.ready=false;state.error='Sign in to explore and join real Loop Communities.';draw();return}
    state.loading=true;state.error='';draw();
    try{
      const results=await Promise.all([
        client.from('community_memberships').select('category').eq('user_id',auth.id),
        client.from('community_posts').select('id,user_id,author_name,category,topic,content,area,created_at').order('created_at',{ascending:false}).limit(150)
      ]);
      for(const result of results)if(result.error)throw result.error;
      state.joined=new Set((results[0].data||[]).map(row=>row.category));
      state.posts=results[1].data||[];
      const ids=state.posts.map(p=>p.id);
      const extra=[
        client.from('community_bookmarks').select('post_id,user_id').eq('user_id',auth.id).limit(500)
      ];
      if(ids.length){
        extra.push(client.from('community_replies').select('id,post_id,user_id,author_name,content,created_at').in('post_id',ids).order('created_at',{ascending:true}).limit(700));
        extra.push(client.from('community_reactions').select('post_id,user_id').in('post_id',ids).limit(1500));
      }
      const related=await Promise.all(extra);
      for(const result of related)if(result.error)throw result.error;
      state.bookmarks=related[0].data||[];
      state.replies=ids.length?related[1].data||[]:[];
      state.reactions=ids.length?related[2].data||[]:[];
      state.member=auth.id;state.ready=true;
    }catch(err){
      console.warn('Loop community data:',err);
      state.error='Community could not connect yet. Please try Refresh; your posts have not been replaced by demo content.';
    }finally{state.loading=false;draw()}
  }
  async function toggleJoin(category){
    if(!byId[category]||state.busy)return;
    if(!user()||!db())return notify('Sign in to join communities');
    state.busy=true;draw();
    try{
      const joined=state.joined.has(category);
      const q=db().from('community_memberships');
      const result=joined?await q.delete().eq('user_id',user().id).eq('category',category):
        await q.insert({user_id:user().id,category:category});
      if(result.error)throw result.error;
      if(joined)state.joined.delete(category);else state.joined.add(category);
      if(state.active==='all'&&state.joined.size===1)state.active=category;
      if(joined&&state.active===category)state.active='all';
      state.error='';
      notify(joined?'Left '+categoryLabel(category):'Joined '+categoryLabel(category)+' community');
    }catch(e){state.error='Could not update membership. Try again.';console.warn(e)}
    finally{state.busy=false;draw()}
  }
  async function toggleReaction(id,kind){
    const post=state.posts.find(p=>p.id===id);
    if(!post)return;
    if(kind==='like'&&!state.joined.has(post.category))return notify('Join this community to react');
    if(!user()||!db())return notify('Sign in to participate');
    const collection=kind==='like'?'community_reactions':'community_bookmarks',current=kind==='like'?state.reactions:state.bookmarks;
    const exists=current.some(row=>row.post_id===id&&row.user_id===user().id);
    const q=db().from(collection);
    const res=exists?await q.delete().eq('post_id',id).eq('user_id',user().id):await q.insert({post_id:id,user_id:user().id});
    if(res.error){notify('Could not save that change. Please try again.');return}
    if(exists){const i=current.findIndex(row=>row.post_id===id&&row.user_id===user().id);if(i>=0)current.splice(i,1)}
    else current.push({post_id:id,user_id:user().id});
    draw();
    if(!exists&&kind==='like')recordReputationEvent('interaction','community-like:'+id,post.category);
  }
  async function removePost(id){
    const post=state.posts.find(p=>p.id===id);
    if(!post||post.user_id!==user()?.id||!window.confirm('Delete your post and its replies?'))return;
    const res=await db().from('community_posts').delete().eq('id',id).eq('user_id',user().id);
    if(res.error)return notify('Unable to delete your post.');
    await loadData();notify('Post deleted');
  }
  function dialogCategory(){
    const select=document.getElementById('communityPostCategory');
    if(!select)return;
    select.innerHTML=categories.filter(c=>state.joined.has(c.id)).map(c=>'<option value="'+c.id+'">'+safe(c.name)+'</option>').join('');
    if(state.joined.has(state.active))select.value=state.active;
  }
  function initPostDialog(){
    const topic=document.getElementById('communityTopic');
    if(!topic)return;
    [...topic.options].filter(o=>o.value==='Entertainment').forEach(o=>o.remove());
    const field=document.createElement('div');field.className='field';field.innerHTML='<label for="communityPostCategory">Community</label><select id="communityPostCategory" required></select>';
    topic.closest('.field').before(field);
    const postBox=document.getElementById('communityPostText');
    postBox.setAttribute('placeholder','Tell people what made this park, restaurant, song, shop or experience worth sharing…');
  }
  const originalPost=window.openCommunityPost;
  window.openCommunityPost=function(){
    if(!state.joined.size)return notify('Join a community before posting.');
    dialogCategory();originalPost();
  };
  window.submitCommunityPost=async function(event){
    event.preventDefault();
    const content=document.getElementById('communityPostText').value.trim();
    const category=document.getElementById('communityPostCategory').value,topic=document.getElementById('communityTopic').value;
    if(content.length<10||content.length>500||!communityTextAllowed(content))return notify('Use 10–500 respectful characters.');
    if(!state.joined.has(category))return notify('Join the selected community first.');
    const button=event.target.querySelector('button.primary');button.disabled=true;
    try{
      const result=await db().from('community_posts').insert({
        user_id:user().id,author_name:(getProfile().name||'Loop member').slice(0,120),
        area:homeArea(),category,topic,content
      }).select('id').single();
      if(result.error)throw result.error;
      document.getElementById('communityPostDialog').close();
      state.active=category;state.tab='New';
      await loadData();
      recordReputationEvent(topic==='Recommendation'||topic==='Local find'?'recommendation':'community_post',result.data.id,category);
      notify('Your post is live in '+categoryLabel(category));
    }catch(e){console.warn(e);notify('Post was not shared. Please try again.')}
    finally{button.disabled=false}
  };
  const originalReply=window.openCommunityReply;
  window.openCommunityReply=function(id){
    const post=state.posts.find(p=>p.id===id);
    if(!post)return;
    if(!state.joined.has(post.category))return notify('Join '+categoryLabel(post.category)+' to reply');
    originalReply(id);
  };
  window.submitCommunityReply=async function(event){
    event.preventDefault();
    const postId=document.getElementById('communityReplyPostId').value;
    const post=state.posts.find(p=>p.id===postId),content=document.getElementById('communityReplyText').value.trim();
    if(!post||!state.joined.has(post.category))return notify('Join the community first.');
    if(content.length<2||content.length>350||!communityTextAllowed(content))return notify('Use 2–350 respectful characters.');
    const button=event.target.querySelector('button.primary');button.disabled=true;
    try{
      const result=await db().from('community_replies').insert({
        user_id:user().id,post_id:postId,author_name:(getProfile().name||'Loop member').slice(0,120),content
      }).select('id').single();
      if(result.error)throw result.error;
      document.getElementById('communityReplyDialog').close();
      await loadData();recordReputationEvent('reply',result.data.id,post.category);
      notify('Your reply is live');
    }catch(e){console.warn(e);notify('Reply could not be shared yet.')}
    finally{button.disabled=false}
  };
  window.renderCommunity=function(){
    if(!isProfileMode())return;
    if(state.member!==user()?.id||!state.ready){state.member=user()?.id||null;state.joined=new Set();state.active='all';loadData()}
    else {draw();loadData()}
  };
  shell.addEventListener('click',async event=>{
    const button=event.target.closest('[data-action]');if(!button)return;
    const action=button.dataset.action,cat=button.dataset.category,id=button.dataset.id;
    if(action==='join')await toggleJoin(cat);
    if(action==='browse'&& (cat==='all'||byId[cat])){state.active=cat;state.tab='New';draw();document.getElementById('c1FeedTitle').scrollIntoView({behavior:'smooth',block:'start'})}
    if(action==='tab'){state.tab=button.dataset.tab;draw()}
    if(action==='manage')document.getElementById('c1DiscoverTitle').scrollIntoView({behavior:'smooth',block:'start'});
    if(action==='compose')window.openCommunityPost();
    if(action==='reload')await loadData();
    if(action==='like'||action==='save')await toggleReaction(id,action);
    if(action==='reply')window.openCommunityReply(id);
    if(action==='remove')await removePost(id);
    if(action==='explore')openCategory(cat);
  });
  function initBulletin(){
    const menuLink=[...document.querySelectorAll('.drawer-link')].find(btn=>btn.getAttribute('onclick')==='showNotifications()');
    if(menuLink){menuLink.innerHTML='<span class="mi">✦</span>What’s New in Loop';menuLink.setAttribute('onclick','showWhatsNew()')}
    const bell='<svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 10a5 5 0 0 1 10 0v4l2 2H5l2-2v-4Z"></path><path d="M10 19h4"></path></svg>';
    const activityIcon=document.querySelector('.notification-title-icon');
    if(activityIcon)activityIcon.innerHTML=bell;
    const headerBell=document.querySelector('.notification-button svg');
    if(headerBell)headerBell.outerHTML=bell;
    const page=document.createElement('section');page.id='loopWhatsNew';page.className='c1-release';
    page.setAttribute('aria-label','What’s New in Loop');
    page.innerHTML='<div class="c1-release-shell">'+
      '<div class="c1-release-head"><button type="button" data-release="home" aria-label="Back to Loop">←</button><b>What’s New in Loop</b></div>'+
      '<div class="c1-release-title"><small>Loop™ alpha · release notes</small><h1>Fresh around the Loop ✦</h1><p>Updates, features and things you can try right now.</p></div>'+
      '<article class="c1-release-card"><strong>🌿 Communities 1.0 is here</strong><small>Latest · Early access</small><p>Join multiple interest-based communities like Parks, Restaurants, Retail and Music. Share real recommendations, reply, react, and explore New, Trending, Nearby, For You and Saved conversations.</p><button data-release="community">Explore Communities ↗</button></article>'+
      '<article class="c1-release-card"><strong>🔔 One familiar notification bell</strong><small>Navigation update</small><p>Your activity bell remains in the main app header. This menu now hosts feature announcements instead of duplicating Notifications.</p><button data-release="home">Back to Loop ↗</button></article>'+
      '<article class="c1-release-card"><strong>◎ The Triple R</strong><small>Community & reputation</small><p>Contribute helpful recommendations and firsthand experiences, then follow your reputation progress. Community interactions are tied to member accounts.</p><button data-release="profile">View my reputation ↗</button></article>'+
      '<article class="c1-release-card"><strong>📍 Discover what fits you</strong><small>Search & Explore</small><p>Explore categories including Travel, Retail, Parks, Fun & Games, Movies, Music and more. Search is still being improved through early testing.</p><button data-release="explore">Explore categories ↗</button></article>'+
      '<p class="c1-alt">Loop is in early access. New features and recommendation coverage are still growing.</p></div>';
    document.body.append(page);
    const originalHide=window.hidePrimaryViews;
    window.hidePrimaryViews=function(){page.classList.remove('active');return originalHide.apply(this,arguments)};
    window.showWhatsNew=function(){closeMenu();hidePrimaryViews();setActiveNav(null);page.classList.add('active');window.scrollTo(0,0)};
    page.addEventListener('click',event=>{
      const btn=event.target.closest('[data-release]');if(!btn)return;
      const action=btn.dataset.release;
      if(action==='community')showCommunity();
      else if(action==='profile')showProfile();
      else if(action==='explore')showExplore();
      else showHome();
    });
  }
  buildShell();
  initPostDialog();
  initBulletin();
  draw();
  if(document.getElementById('communityPage').classList.contains('active'))window.renderCommunity();
})();
