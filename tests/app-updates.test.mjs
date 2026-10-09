import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';

const sw = await readFile(new URL('../sw.js',import.meta.url),'utf8');
const update = await readFile(new URL('../updates/auto-update.js',import.meta.url),'utf8');
const html = await readFile(new URL('../index.html',import.meta.url),'utf8');
const version = await readFile(new URL('../api/app-version.js',import.meta.url),'utf8');

test('auto updater and revised service worker are syntactically valid',()=>{
  assert.doesNotThrow(()=>new Script(sw));
  assert.doesNotThrow(()=>new Script(update));
});

test('the installed app checks automatically when launched and foregrounded',()=>{
  assert.match(update,/serviceWorker\.register\('\/sw\.js', \{updateViaCache:'none'\}\)/);
  assert.match(update,/registration\.update\(\)/);
  assert.match(update,/addEventListener\('focus'/);
  assert.match(update,/addEventListener\('visibilitychange'/);
  assert.match(update,/CHECK_INTERVAL_MS = 30 \* 60 \* 1000/);
  assert.match(update,/fetch\('\/api\/app-version', \{cache:'no-store'/);
  assert.match(version,/VERCEL_GIT_COMMIT_SHA/);
  assert.match(version,/no-store/);
});

test('never silently interrupt active searches or typed member forms',()=>{
  assert.match(update,/function idleOnHome\(\)/);
  assert.match(update,/document\.querySelector\('dialog\[open\]/);
  assert.match(update,/\.category-page\.active/);
  assert.match(update,/\.place-page\.active/);
  assert.match(update,/if \(!postponed\) offerUpdate\(\)/);
  assert.match(update,/textContent = 'Update now'/);
  assert.match(update,/textContent = 'Later'/);
  assert.match(update,/if \(!hadController\)/);
});

test('new service worker waits for safe activation and preserves all local user storage',()=>{
  assert.match(sw,/CACHE_NAME = 'loop-alpha-v27'/);
  assert.match(sw,/if \(!self\.registration\.active\) await self\.skipWaiting\(\)/);
  assert.match(sw,/LOOP_APPLY_UPDATE/);
  assert.match(sw,/self\.clients\.claim\(\)/);
  assert.match(sw,/if \(url\.pathname\.startsWith\('\/api\/'\)\) return/);
  assert.match(sw,/const isCode =/);
  assert.match(sw,/community\\\/communities-v1\\.js/);
  assert.match(sw,/cache: 'no-store'/);
  assert.doesNotMatch(sw,/localStorage|indexedDB|deleteDatabase/);
  assert.doesNotMatch(update,/localStorage\.clear|indexedDB\.deleteDatabase/);
});

test('app exposes visible update check in settings and preloads updater',()=>{
  assert.match(html,/<script defer src="\/updates\/auto-update\.js"><\/script>/);
  assert.match(html,/id="loopUpdateButton"/);
  assert.match(html,/window\.LoopAutoUpdate\?\.checkNow\(\)/);
  assert.match(html,/id="loopUpdateStatus"/);
  assert.match(html,/loop-update-banner/);
});
