import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const guide=require('../brain/loop-guide.js');
const place=(name,match='direct',peer=null)=>({
  place_id:'overture:'+name,name,loop_name:name,loop_match_type:match,
  extratags:{taxonomy:'italian restaurant'},
  ...(peer?{loop_peer_evidence:peer}:{})
});

test('profile tastes make restaurant and parks tiles specific without changing categories for guests',()=>{
  const p=guide.withProfileTastes({categories:{}},'Italian restaurants, parks with pools and kid-friendly playgrounds');
  assert.ok(p.categories.restaurants.includes('italian'));
  assert.ok(p.categories.parks.includes('swimming-pools'));
  assert.ok(p.categories.parks.includes('family-friendly'));
  assert.equal(guide.discoveryPlan(p,'restaurants').query,'italian restaurant');
  assert.equal(guide.discoveryPlan(p,'parks').personalized,true);
  assert.equal(guide.discoveryPlan(guide.normalize({}),'restaurants').query,'restaurant');
  assert.equal(Object.hasOwn(p.categories,'medical'),false);
});

test('explicit category picks override free-text inferred picks and remain editable',()=>{
  const p=guide.withProfileTastes({categories:{restaurants:['sushi']}},'Italian food');
  assert.deepEqual(p.categories.restaurants,['sushi']);
  assert.equal(guide.discoveryPlan(p,'restaurants').query,'sushi restaurant');
});

test('genuine peer evidence can inform discovery ranking, but unverified claims cannot',()=>{
  const high={source:'loop-verified',recommendationCount:10,averageExperience:9,averageReputation:9};
  const fake={...high,source:'other'};
  assert.equal(guide.peerEvidence(place('Unknown','direct',fake)),null);
  const p=guide.normalize({categories:{restaurants:['italian']}});
  const ranked=guide.rankPlaces([place('No reviews'),place('Supported','direct',high)],p,'restaurants','italian restaurant',{}, {discovery:true});
  assert.equal(ranked[0].name,'Supported');
  const unverified=guide.rankPlaces([place('Unverified','direct',fake),place('No reviews')],p,'restaurants','italian restaurant',{}, {discovery:true});
  assert.equal(unverified[0].name,'Unverified');
  assert.ok(guide.peerEvidence(place('Supported','direct',high)).rank>0);
});

test('related fallback never outranks direct exact place results on trust alone',()=>{
  const high={source:'loop-verified',recommendationCount:50,averageExperience:10,averageReputation:10};
  const p=guide.normalize({categories:{restaurants:['italian']}});
  const ranked=guide.rankPlaces([place('Direct'),place('Related','related',high)],p,'restaurants','italian restaurant',{}, {discovery:true});
  assert.equal(ranked[0].name,'Direct');
});

test('category UI is loaded as a separate valid script without losing the universal search',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const ui=await readFile(new URL('../loop2/discovery-ui.js',import.meta.url),'utf8');
  const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
  assert.doesNotThrow(()=>new Script(ui));
  assert.match(html,/openUniversalSearch\(\)/);
  assert.match(html,/loop2\/discovery-ui\.js/);
  assert.match(html,/loop2\/discovery-ui\.css/);
  assert.match(ui,/window\.isProfileMode/);
  assert.match(ui,/window\.findPlaces\(\)/);
  assert.match(sw,/loop2\/discovery-ui\.js/);
});

test('tapping a category starts a profile-tailored query without requiring typing',async()=>{
  const {createContext}=await import('node:vm');
  const source=await readFile(new URL('../loop2/discovery-ui.js',import.meta.url),'utf8');
  const calls=[],input={value:'',addEventListener(){}};
  const ids={
    loop2DiscoveryBanner:{hidden:true},
    loop2DiscoveryTitle:{textContent:''},
    loop2DiscoveryDetails:{textContent:''},
    loop2DiscoveryCustomize:{textContent:'',onclick:null},
    categoryPage:{classList:{contains:()=>true}},
    categoryPrompts:{addEventListener(){}},
    q:input,status:{textContent:''}
  };
  const context=createContext({
    document:{
      getElementById:id=>ids[id]||null,
      querySelectorAll:()=>[]
    },
    setTimeout:fn=>fn(),
    window:{
      LoopGuide:guide,
      openCategory:()=>{},
      guideSettings:()=>guide.normalize({categories:{restaurants:['italian']}}),
      findPlaces:()=>calls.push(input.value),
      isProfileMode:()=>true,
      getProfile:()=>({tastes:'Italian'}),
      applyAccountState:()=>{},
      saveGuideSettings:async()=>{}
    }
  });
  new Script(source).runInContext(context);
  context.window.openCategory('restaurants');
  assert.equal(input.value,'italian restaurant');
  assert.deepEqual(calls,['italian restaurant']);
  assert.equal(ids.loop2DiscoveryTitle.textContent,'Restaurants picked for your tastes');
});
