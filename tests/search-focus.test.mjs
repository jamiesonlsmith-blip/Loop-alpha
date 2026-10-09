import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('category search has rounded search-pill focus and no rectangular input outline',()=>{
  assert.match(html,/class="search category-search"/);
  assert.match(html,/<input id="q"/);
  assert.match(html,/\.search input:focus-visible\{outline:none;outline-offset:0;box-shadow:none\}/);
  assert.match(html,/\.search:focus-within\{box-shadow:[^}]*rgba\(15,112,75,\.22\)/);
});

test('other form fields and buttons retain visible accessible keyboard outlines',()=>{
  assert.match(html,/button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible\{outline:3px solid #e9b83c/);
  assert.match(html,/@media\(forced-colors:active\)\{\.search:focus-within\{outline:2px solid Highlight/);
});
