import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest=JSON.parse(await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');

test('approved Loop icon is configured for standard and maskable PWA launchers',()=>{
  const standard=manifest.icons.filter(icon=>icon.purpose==='any');
  const adaptive=manifest.icons.find(icon=>icon.purpose==='maskable');
  assert.ok(standard.some(x=>x.sizes==='192x192'));
  assert.ok(standard.some(x=>x.sizes==='512x512'));
  assert.equal(adaptive?.sizes,'512x512');
  assert.match(adaptive.src,/icon-maskable-512\.png\?v=25$/);
  assert.match(html,/rel="apple-touch-icon"[^>]+href="\/icons\/icon-180\.png\?v=25"/);
  assert.match(html,/rel="manifest"[^>]+href="\/manifest\.webmanifest\?v=25"/);
  assert.match(sw,/loop-alpha-v27/);
});

test('every actual launcher icon is a well-formed PNG at its advertised resolution',async()=>{
  for(const [path,size] of [
    ['icon-180.png',180],['icon-192.png',192],
    ['icon-512.png',512],['icon-maskable-512.png',512]
  ]){
    const file=await readFile(new URL('../icons/'+path,import.meta.url));
    assert.ok(file.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),path);
    assert.equal(file.toString('ascii',12,16),'IHDR',path);
    assert.equal(file.readUInt32BE(16),size,path);
    assert.equal(file.readUInt32BE(20),size,path);
    assert.ok(file.length>10000,path+' must contain genuine rendered art');
  }
});

test('approved icon source is preserved for future reproducible exports',async()=>{
  const encoded=(await readFile(new URL('../icons/loop-approved-source.b64',import.meta.url),'utf8')).trim();
  const bytes=Buffer.from(encoded,'base64');
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.equal(encoded.length,5264);
  assert.match(await readFile(new URL('../scripts/build_loop_icons.py',import.meta.url),'utf8'),/loop-approved-source\.b64/);
});
