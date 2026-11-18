/* Loop 2.0 — category tiles initiate useful discovery without requiring a search.
   Uses existing Loop Guide, member preferences, place index, and honest trust evidence. */
(function(){
  'use strict';
  const guide=window.LoopGuide;
  const $=id=>document.getElementById(id);
  if(!guide||!window.openCategory||!window.findPlaces||!window.guideSettings)return;
  const baseGuideSettings=window.guideSettings;
  const baseOpenCategory=window.openCategory;
  const baseApplyAccountState=window.applyAccountState;
  const baseSaveGuideSettings=window.saveGuideSettings;
  const baseRankPlaces=guide.rankPlaces;
  let navigationToken=0,autoContext=null;
  window.Loop2Discovery={isAuto:()=>Boolean(autoContext),refreshTiles:()=>renderHomeTiles()};

  // Private profile tastes are only used for the signed-in member. Guest never inherits them.
  window.guideSettings=function(){
    const prefs=baseGuideSettings();
    return guide.withProfileTastes(prefs,window.isProfileMode?.()?window.getProfile()?.tastes||'':'');
  };
  guide.rankPlaces=function(items,prefs,category,query,activity,opts){
    const discovery=!!autoContext&&autoContext.category===category&&autoContext.query===query;
    return baseRankPlaces(items,prefs,category,query,activity,{...(opts||{}),discovery});
  };

  const headerText={
    restaurants:'Restaurants',parks:'Parks',medical:'Medical',
    'home-services':'Home Services',auto:'Auto',retail:'Retail',
    travel:'Travel','fun-games':'Fun & Games',movies:'Movies & TV',music:'Music'
  };
  function renderHomeTiles(){
    const member=Boolean(window.isProfileMode?.()),preferences=window.guideSettings();
    document.querySelectorAll('#homeCategoryGrid .category-tile').forEach(tile=>{
      const match=tile.getAttribute('onclick')?.match(/openCategory\('([^']+)'\)/);
      const small=tile.querySelector('small');
      if(!small||!match)return;
      if(!small.dataset.loopDefaultCopy)small.dataset.loopDefaultCopy=small.textContent;
      const plan=guide.discoveryPlan(preferences,match[1]);
      const personal=member&&plan.personalized;
      small.textContent=personal?'For you: '+plan.labels.slice(0,2).join(' · '):small.dataset.loopDefaultCopy;
      tile.classList.toggle('loop2-personalized-tile',personal);
    });
  }
  function ensureBanner(){
    let banner=$('loop2DiscoveryBanner');
    if(banner)return banner;
    banner=document.createElement('section');
    banner.className='loop2-discovery-banner';
    banner.id='loop2DiscoveryBanner';
    banner.hidden=true;
    banner.setAttribute('aria-live','polite');
    banner.innerHTML='<div class="loop2-discovery-copy"><span class="loop2-discovery-spark" aria-hidden="true">✦</span>'+
      '<div><strong id="loop2DiscoveryTitle">Discovery made for you</strong>'+
      '<p id="loop2DiscoveryDetails"></p></div></div>'+
      '<button type="button" class="loop2-tune" id="loop2DiscoveryCustomize">Customize</button>';
    $('categoryPrompts')?.before(banner);
    return banner;
  }
  const banner=ensureBanner();
  const tastes=document.createElement('div');
  tastes.id='loop2TasteChoices';
  tastes.className='loop2-taste-choices';
  tastes.hidden=true;
  tastes.setAttribute('aria-label','Your saved category preferences');
  banner.after(tastes);
  function runPersonalTaste(kind,query){
    autoContext={category:kind,query};
    $('q').value=query;
    if(typeof window.syncCategoryPromptState==='function')window.syncCategoryPromptState();
    tastes.querySelectorAll('button[data-loop-query]').forEach(button=>
      button.setAttribute('aria-pressed',String(button.dataset.loopQuery===query)));
    $('status').textContent='Finding '+query+' within your Loop…';
    window.findPlaces();
  }
  function personalizeCategory(kind){
    if(!headerText[kind]||!$('categoryPage')?.classList.contains('active'))return;
    const member=Boolean(window.isProfileMode?.());
    const plan=guide.discoveryPlan(window.guideSettings(),kind);
    banner.hidden=false;
    const options=guide.OPTIONS[kind]||[], selected=(window.guideSettings().categories[kind]||[]).slice(0,5);
    tastes.replaceChildren();
    tastes.hidden=!(member&&selected.length);
    if(!tastes.hidden){
      const heading=document.createElement('strong');
      heading.textContent='Your tastes';
      tastes.append(heading);
      selected.forEach(id=>{
        const label=options.find(item=>item[0]===id)?.[1]||id;
        const filtered=guide.normalize({categories:{[kind]:[id]}});
        const query=guide.discoveryPlan(filtered,kind).query;
        const button=document.createElement('button');
        button.type='button';
        button.textContent=label;
        button.dataset.loopQuery=query;
        button.setAttribute('aria-pressed',String(query===plan.query));
        button.addEventListener('click',()=>runPersonalTaste(kind,query));
        tastes.append(button);
      });
    }
    $('loop2DiscoveryTitle').textContent=member&&plan.personalized
      ?headerText[kind]+' picked for your tastes'
      :'Discover '+headerText[kind];
    $('loop2DiscoveryDetails').textContent=kind==='medical'
      ?'Browse nearby care listings; verify credentials, insurance, and suitability before choosing.'
      :member&&plan.personalized
        ?'Your preferences: '+plan.labels.join(' · ')+'. Showing real places; verified community reviews will influence ranking as they become available.'
        :member
          ?'Showing nearby options. Add category tastes to your profile for more personal results.'
          :'Showing general options. Create a profile to make these recommendations yours.';
    const tune=$('loop2DiscoveryCustomize');
    tune.textContent=member?'Tune my tastes':'Create a profile';
    tune.onclick=member?()=>window.openTasteStudio(kind):()=>window.startProfileSetup();
    runPersonalTaste(kind,plan.query);
  }
  window.openCategory=function(kind){
    const token=++navigationToken;
    autoContext=null;
    baseOpenCategory(kind);
    if(kind==='all'||!headerText[kind]){
      banner.hidden=true;
      tastes.hidden=true;
      return;
    }
    // Let the existing category view and map render before loading discoveries.
    setTimeout(()=>{
      if(token!==navigationToken)return;
      personalizeCategory(kind);
    },70);
  };
  $('q')?.addEventListener('input',()=>{autoContext=null;tastes.querySelectorAll('button[data-loop-query]').forEach(b=>b.setAttribute('aria-pressed','false'));});
  $('categoryPrompts')?.addEventListener('click',()=>{autoContext=null;});
  if(typeof baseApplyAccountState==='function'){
    window.applyAccountState=function(){
      const result=baseApplyAccountState.apply(this,arguments);
      renderHomeTiles();
      return result;
    };
  }
  if(typeof baseSaveGuideSettings==='function'){
    window.saveGuideSettings=async function(){
      const result=await baseSaveGuideSettings.apply(this,arguments);
      renderHomeTiles();
      const current=autoContext?.category;
      if(current&&$('categoryPage')?.classList.contains('active'))personalizeCategory(current);
      return result;
    };
  }
  renderHomeTiles();
})();