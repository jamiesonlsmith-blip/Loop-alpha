import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('the application inline JavaScript parses after global map integration', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1].trim()).filter(Boolean);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Script(scripts[0], { filename: 'loop-inline.js' }));
});

test('world map has accessible explicit search-center and GPS controls', () => {
  assert.match(html, /id="loopDiscoveryMap"[^>]+role="region"/);
  assert.match(html, /onclick="useMapCenter\(\)"/);
  assert.match(html, /onclick="useDeviceArea\(\)"/);
  assert.match(html, /selectedMapCenter=\{lat:center\.lat,lon:center\.lng\}/);
  assert.match(html, /searchAt\(term,selectedMapCenter\.lat,selectedMapCenter\.lon,'local'\)/);
  assert.match(html, /https:\/\/tiles\.openfreemap\.org\/styles\/positron/);
  assert.match(html, /https:\/\/tiles\.openfreemap\.org\/styles\/liberty/);
  assert.match(html, /maplibregl\.Map/);
  assert.match(html, /function createLeafletBackup/);
  assert.match(html, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(html, /openstreetmap\.org\/copyright/);
});

test('map markers use the same result lat/lon returned by the place search API', () => {
  assert.match(html, /function showMapResults\(items,search\)/);
  assert.match(html, /const y=Number\(item\.lat\),x=Number\(item\.lon\)/);
  assert.match(html, /function render\(items,meta=\{\}\)\{[^\n]{0,230}showMapResults\(items,activePlaceSearch\)/);
  assert.match(html, /function renderNoPlaceMatches\(term,scope,data=\{\}\)\{showMapResults\(\[\],activePlaceSearch\)/);
  assert.match(sw, /loop-alpha-v27/);
});


test('modern vector map preserves selected location, results and accessible style switching',()=>{
  assert.match(html,/id="mapStyleToggle"[^>]+onclick="toggleLoopMapStyle\(\)"/);
  assert.match(html,/function useMapCenter\(\)/);
  assert.match(html,/function useDeviceArea\(\)/);
  assert.match(html,/if\(loopMapEngine==='vector'\)/);
  assert.match(html,/new maplibregl\.LngLatBounds\(\[lon,lat\],\[lon,lat\]\)/);
  assert.match(html,/popup\.textContent=name/);
  assert.match(html,/createVectorPin\(place\.lon,place\.lat,place\.name\)/);
  assert.match(html,/loopDiscoveryMap\.invalidateSize=\(\)=>loopDiscoveryMap\.resize\(\)/);
});

test('premium UI updates category icons and preserves reduced-motion accessibility',()=>{
  assert.match(html,/function loopCategoryIconSvg\(kind\)/);
  assert.match(html,/applyLoopCategoryIcons\(\)/);
  assert.match(html,/\.category-grid \.category-tile\{/);
  assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html,/button:focus-visible/);
});
