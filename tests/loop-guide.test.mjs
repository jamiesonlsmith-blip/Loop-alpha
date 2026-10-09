import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';

const require = createRequire(import.meta.url);
const guide = require('../brain/loop-guide.js');

const place = (name,taxonomy, match='direct')=>({
  place_id: 'overture:'+name, name, type:'restaurant',
  extratags:{taxonomy},loop_name:name,loop_match_type:match
});

test('member preference choices are schema-validated and unknown categories ignored',()=>{
  const p=guide.normalize({categories:{restaurants:['pizza','burgers','untrusted'],medical:['diagnosis'],auto:['brakes']},learnFromActivity:true});
  assert.deepEqual(p.categories.restaurants,['pizza','burgers']);
  assert.equal(Object.hasOwn(p.categories,'medical'),false);
  assert.deepEqual(p.categories.auto,['brakes']);
  assert.equal(p.learnFromActivity,true);
});

test('generic restaurant search prioritizes explicit matches in place data',()=>{
  const prefs=guide.normalize({categories:{restaurants:['pizza']}});
  const result=guide.rankPlaces([place('Burger Bar','burger_restaurant'),place('Mario Pizza','pizza_restaurant')],prefs,'restaurants','restaurants');
  assert.equal(result[0].name,'Mario Pizza');
  assert.match(result[0].loop_guide_reason,/Pizza/);
  assert.equal(result[1].loop_guide_matched,false);
});

test('search specificity and direct evidence outrank unrelated preferences',()=>{
  const prefs=guide.normalize({categories:{restaurants:['pizza']}});
  const ranked=guide.rankPlaces([place('Mario Pizza','pizza_restaurant','related'),place('Burger Bar','burger_restaurant','direct')],prefs,'restaurants','burgers');
  assert.equal(ranked[0].name,'Burger Bar');
});

test('guest does not inherit a signed-in member preference',()=>{
  const p=guide.normalize({});
  const original=[place('Burger Bar','burger_restaurant'),place('Mario Pizza','pizza_restaurant')];
  const ranked=guide.rankPlaces(original,p,'restaurants','restaurants');
  assert.deepEqual(ranked.map(x=>x.name),original.map(x=>x.name));
  assert.equal(ranked.some(x=>x.loop_guide_matched),false);
});

test('click learning is opt-in and can be disabled',()=>{
  const a=place('A Restaurant','casual_eatery'),b=place('B Restaurant','casual_eatery');
  const clicks={[b.place_id]:4};
  const off=guide.rankPlaces([a,b],guide.normalize({}), 'restaurants','restaurants',clicks);
  assert.equal(off[0].name,'A Restaurant');
  const on=guide.rankPlaces([a,b],guide.normalize({learnFromActivity:true}),'restaurants','restaurants',clicks);
  assert.equal(on[0].name,'B Restaurant');
});

test('category-aware inference is limited and medical preferences are not profiled',()=>{
  assert.equal(guide.categoryFor('all','pizza place'),'restaurants');
  assert.equal(guide.categoryFor('fun-games','bowling'),'fun-games');
  assert.equal(Object.hasOwn(guide.OPTIONS,'medical'),false);
});

test('profile preference UI JavaScript parses and preserves guest separation',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1].trim()).filter(Boolean);
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Script(scripts[0]));
  assert.match(html,/LoopGuide\?\.rankPlaces\(items,guideSettings\(\),currentCategory/);
  assert.match(html,/isProfileMode\(\)\?getProfile\(\)\.preferenceSettings:\{\}/);
  assert.match(html,/preference_settings/);
});
