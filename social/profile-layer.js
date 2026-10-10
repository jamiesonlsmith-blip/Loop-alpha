/* Loop Profile 2.0 — overview first, editing and advanced details on demand. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const safe=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const CATEGORIES=[
    ['restaurants','🍽️','Restaurants'],['medical','✚','Medical'],['parks','🌳','Parks'],
    ['home-services','🏠','Home Services'],['auto','🚙','Auto'],['retail','🛍️','Retail'],
    ['travel','✈️','Travel'],['fun-games','🎮','Fun & Games'],['movies','🎬','Movies & TV'],['music','🎵','Music']
  ];
  const profile=()=>typeof getProfile==='function'?getProfile():{};
  const member=()=>typeof currentAuthUser!=='undefined'?currentAuthUser:null;
  const client=()=>typeof loopAuthClient!=='undefined'?loopAuthClient:null;
  const signed=()=>typeof isProfileMode==='function'&&isProfileMode();
  let memberships=[],memberId=null,busy=false,requestSerial=0;
  let ready=false;
  function pills(){
    if(!memberships.length)return '<p class="loop-overview-muted">No communities joined yet. Use Edit Profile to discover interests.</p>';
    return '<div class="loop-overview-chips">'+CATEGORIES.filter(c=>memberships.includes(c[0])).map(c=>
      '<span class="loop-overview-chip">'+c[1]+' '+safe(c[2])+'</span>').join('')+'</div>';
  }
  function refresh(){
    if(!ready||!signed())return;
    const p=profile();
    const age=$('loopOverviewAge');
    if(age){
      age.hidden=!Number.isInteger(Number(p.age))||!p.age;
      age.textContent=p.age?'Age '+p.age+(p.shareAge?' · Shared with members':' · Only you can see this'):'';
    }
    const role=$('loopOverviewRole');
    if(role)role.textContent=[p.role,p.location].filter(Boolean).join(' · ')||'Loop member';
    const intro=$('loopOverviewIntro');
    if(intro)intro.textContent=p.publicInterests||'Add interests to help others understand your recommendations.';
    const tastes=$('loopOverviewTastes');
    if(tastes){
      const guides=typeof guideSettings==='function'?guideSettings().categories:{};
      const count=Object.values(guides||{}).reduce((sum,x)=>sum+(Array.isArray(x)?x.length:0),0);
      tastes.textContent=[p.tastes||p.publicInterests||'',count?count+' Loop Guide interests':''].filter(Boolean).join(' · ')||'Make discovery yours by choosing your interests.';
    }
    const home=$('loopOverviewHome');
    if(home)home.textContent=p.location||'Add a general home area';
    const community=$('loopOverviewCommunities');
    if(community)community.innerHTML=pills();
    renderEditorCommunities();
  }
  async function loadCommunities(){
    if(!signed()||!member()||!client()){memberships=[];memberId=null;refresh();return;}
    const id=member().id,serial=++requestSerial;
    const result=await client().from('community_memberships').select('category').eq('user_id',id);
    if(serial!==requestSerial||member()?.id!==id)return;
    if(result.error){const error=$('loopCommunityEditorStatus');if(error)error.textContent='Could not load your communities. Retry when connected.';return;}
    memberId=id;
    memberships=(result.data||[]).map(x=>x.category).filter(c=>CATEGORIES.some(y=>y[0]===c));
    refresh();
  }
  function renderEditorCommunities(){
    const area=$('loopProfileCommunityPicker');
    if(!area)return;
    area.innerHTML=CATEGORIES.map(c=>{
      const joined=memberships.includes(c[0]);
      return '<button type="button" class="loop-profile-community-choice'+(joined?' selected':'')+'" data-profile-community="'+c[0]+'" aria-pressed="'+joined+'" '+(busy?'disabled':'')+'><span>'+c[1]+'</span><span>'+safe(c[2])+'</span><b>'+(joined?'✓ Joined':'+ Join')+'</b></button>';
    }).join('');
    const count=$('loopCommunityEditorCount');
    if(count)count.textContent=memberships.length+' '+(memberships.length===1?'community':'communities')+' joined';
  }
  async function toggleCommunity(id){
    if(busy||!CATEGORIES.some(c=>c[0]===id))return;
    if(!signed()||!member()||!client()){if(typeof notify==='function')notify('Sign in to manage communities.');return;}
    const uid=member().id;
    busy=true;renderEditorCommunities();
    const joined=memberships.includes(id);
    try{
      const q=client().from('community_memberships');
      const result=joined?await q.delete().eq('user_id',uid).eq('category',id):await q.insert({user_id:uid,category:id});
      if(result.error)throw result.error;
      if(member()?.id!==uid)return;
      memberships=joined?memberships.filter(x=>x!==id):[...memberships,id];
      const message=$('loopCommunityEditorStatus');
      if(message)message.textContent=(joined?'Left ':'Joined ')+(CATEGORIES.find(c=>c[0]===id)?.[2]||'community')+'.';
    }catch(e){
      const message=$('loopCommunityEditorStatus');
      if(message)message.textContent='Could not update membership. Please try again.';
    }finally{busy=false;refresh();}
  }
  function build(){
    if(ready)return;
    const memberBody=$('memberProfileContent'),hero=memberBody?.querySelector('.profile-hero'),grid=memberBody?.querySelector('.profile-grid');
    const form=$('profileEditor')?.querySelector('form'),controls=$('loopProfileSettings');
    if(!memberBody||!hero||!grid||!form||!controls)return;
    // Profile's first impression only shows identity, reputation, interests and communities.
    const overview=document.createElement('div');
    overview.id='loopProfileOverview';
    overview.className='loop-profile-overview';
    overview.innerHTML='<section class="loop-overview-panel loop-overview-about"><h2>About</h2><p id="loopOverviewRole"></p><p id="loopOverviewAge" hidden></p><p id="loopOverviewIntro" class="loop-overview-muted"></p></section>'+
      '<section class="loop-overview-panel"><div class="loop-overview-head"><h2>Your preferences</h2></div><p id="loopOverviewTastes" class="loop-overview-muted"></p></section>'+
      '<section class="loop-overview-panel"><div class="loop-overview-head"><h2>My communities</h2></div><div id="loopOverviewCommunities"><p class="loop-overview-muted">Loading your communities…</p></div></section>'+
      '<section class="loop-overview-panel loop-overview-home"><h2>Your Home Loop</h2><p id="loopOverviewHome"></p></section>';
    hero.after(overview);
    const editButton=$('profileEditButton');
    if(editButton){editButton.classList.add('loop-hero-edit');hero.querySelector('.identity')?.append(editButton);}
    // Preserve all existing reputation and activity features without forcing them onto the first screen.
    const more=document.createElement('details');
    more.className='loop-profile-more';
    more.innerHTML='<summary>Reputation details, Home Loop & activity <span aria-hidden="true">⌄</span></summary>';
    grid.before(more);more.append(grid);
    // Existing optional photo, avatar and public-sharing fields move to the edit layer.
    controls.classList.add('loop-profile-edit-controls');
    const actions=form.querySelector('.dialog-actions');
    if(actions)actions.before(controls);
    const ageField=document.createElement('section');
    ageField.className='loop-profile-edit-block';
    ageField.innerHTML='<h3>About you</h3>'+
      '<div class="field"><label for="editAge">Age (optional)</label><input id="editAge" type="number" inputmode="numeric" min="18" max="120" placeholder="Optional"><small class="meta">Enter your age, not your birth date. You control whether other members see it.</small></div>'+
      '<label class="loop-edit-checkbox"><input type="checkbox" id="editShareAge"> Show my age on my public Loop profile</label>';
    form.querySelector('#editTastes')?.closest('.field')?.after(ageField);
    const manage=document.createElement('section');
    manage.className='loop-profile-edit-block loop-profile-communities-editor';
    manage.id='loopProfileCommunitiesEdit';
    manage.innerHTML='<div class="loop-overview-head"><h3>Your communities</h3><span id="loopCommunityEditorCount">0 joined</span></div>'+
      '<p>Choose topics you belong to. You can join or leave anytime; your Community feed follows these choices.</p>'+
      '<div id="loopProfileCommunityPicker" class="loop-community-choice-grid"></div>'+
      '<p id="loopCommunityEditorStatus" role="status" aria-live="polite" class="loop-edit-hint"></p>';
    if(actions)actions.before(manage);
    const guide=document.createElement('button');
    guide.type='button';guide.id='loopEditGuide';guide.className='loop-edit-guide';guide.textContent='◎ Tune detailed Loop Guide preferences';
    if(actions)actions.before(guide);
    const title=form.querySelector('h2');
    if(title)title.textContent='Edit your Loop profile';
    ready=true;
    renderEditorCommunities();
    refresh();
  }
  document.addEventListener('click',event=>{
    const option=event.target.closest('[data-profile-community]');
    if(option){toggleCommunity(option.dataset.profileCommunity);return;}
    if(event.target.closest('#loopEditGuide')){
      $('profileEditor')?.close();
      if(typeof openTasteStudio==='function')openTasteStudio();
    }
  });
  const originalApply=window.applyAccountState;
  if(typeof originalApply==='function')window.applyAccountState=function(){
    const result=originalApply.apply(this,arguments);
    const id=member()?.id||null;
    if(memberId&&id!==memberId){++requestSerial;memberships=[];memberId=null;}
    refresh();
    return result;
  };
  const originalShow=window.showProfile;
  if(typeof originalShow==='function')window.showProfile=function(){
    const result=originalShow.apply(this,arguments);
    loadCommunities();
    return result;
  };
  build();
  window.LoopProfileLayer={refresh,loadCommunities};
})();
