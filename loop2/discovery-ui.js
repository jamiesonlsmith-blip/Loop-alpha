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
  function personalizeCategory(kind){
    if(!headerText[kind]||!$('categoryPage')?.classList.contains('active'))return;
    const member=Boolean(window.isProfileMode?.());
    const plan=guide.discoveryPlan(window.guideSettings(),kind);
    autoContext={category:kind,query:plan.query};
    banner.hidden=false;
    $('loop2DiscoveryTitle').textContent=member&&plan.personalized
      ?headerText[kind]+' picked for your tastes'
      :'Discover '+headerText[kind];
    $('loop2DiscoveryDetails').textContent=kind==='medical'
      ?'Browse nearby care listings; verify credentials, insurance, and suitability before choosing.'
      :member&&plan.personalized
        ?'Starting with '+plan.labels.join(', ')+'. Verified Loop peer reviews will influence ordering as they become available.'
        :member
          ?'Showing nearby options. Add category tastes to your profile for more personal results.'
          :'Showing general options. Create a profile to make these recommendations yours.';
    const tune=$('loop2DiscoveryCustomize');
    tune.textContent=member?'Tune my tastes':'Create a profile';
    tune.onclick=member?()=>window.openTasteStudio(kind):()=>window.startProfileSetup();
    const input=$('q');
    input.value=plan.query;
    if(typeof window.syncCategoryPromptState==='function')window.syncCategoryPromptState();
    $('status').textContent='Finding '+(member&&plan.personalized?'personalized ':'')+headerText[kind]+' suggestions…';
    window.findPlaces();
  }
  window.openCategory=function(kind){
    const token=++navigationToken;
    autoContext=null;
    baseOpenCategory(kind);
    if(kind==='all'||!headerText[kind]){
      banner.hidden=true;
      return;
    }
    // Let the existing category view and map render before loading discoveries.
    setTimeout(()=>{
      if(token!==navigationToken)return;
      personalizeCategory(kind);
    },70);
  };
  $('q')?.addEventListener('input',()=>{autoContext=null;});
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