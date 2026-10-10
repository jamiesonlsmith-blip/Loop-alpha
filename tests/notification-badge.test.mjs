import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
const generator=await readFile(new URL('../scripts/build_loop_icons.py',import.meta.url),'utf8');
const badge=await readFile(new URL('../icons/notification-badge-96.png',import.meta.url));

function readRgbaPng(file) {
  assert.equal(file.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let offset=8,width,height,type;
  const parts=[];
  while(offset < file.length){
    const length=file.readUInt32BE(offset);offset+=4;
    const tag=file.toString('ascii',offset,offset+4);offset+=4;
    const contents=file.subarray(offset,offset+length);offset+=length+4;
    if(tag==='IHDR'){width=contents.readUInt32BE(0);height=contents.readUInt32BE(4);type=contents[9];assert.equal(contents[8],8)}
    if(tag==='IDAT')parts.push(contents);
    if(tag==='IEND')break;
  }
  assert.equal(type,6,'badge must be true RGBA, not an opaque palette or color tile');
  assert.equal(width,96);assert.equal(height,96);
  const raw=inflateSync(Buffer.concat(parts));
  const stride=width*4;
  const data=Buffer.alloc(stride*height);
  let start=0;
  for(let y=0;y<height;y++){
    const filter=raw[start++];
    for(let i=0;i<stride;i++){
      const x=raw[start++], left=i>=4?data[y*stride+i-4]:0,
        up=y?data[(y-1)*stride+i]:0,
        upperLeft=i>=4&&y?data[(y-1)*stride+i-4]:0;
      let predictor=0;
      if(filter===1)predictor=left;
      else if(filter===2)predictor=up;
      else if(filter===3)predictor=Math.floor((left+up)/2);
      else if(filter===4){
        const p=left+up-upperLeft,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-upperLeft);
        predictor=a<=b&&a<=c?left:b<=c?up:upperLeft;
      }else assert.equal(filter,0,'unexpected PNG filter');
      data[y*stride+i]=(x+predictor)&255;
    }
  }
  return {width,height,data};
}

test('Android uses distinct full-color expanded icon and alpha-only status-bar badge',()=>{
  assert.match(html,/icon:'\/icons\/icon-192\.png\?v=25'/);
  assert.match(html,/badge:'\/icons\/notification-badge-96\.png\?v=1'/);
  assert.doesNotMatch(html,/badge:'\/icons\/icon-192\.png/);
  assert.match(sw,/\/icons\/notification-badge-96\.png/);
  assert.match(generator,/loop-approved-source\.b64/);
});

test('monochrome PNG contains transparent edges and recognizable pure-white ring artwork',()=>{
  const {width,height,data}=readRgbaPng(badge);
  function pixel(x,y){return data.subarray((y*width+x)*4,(y*width+x+1)*4)}
  for(const [x,y] of [[0,0],[95,0],[0,95],[95,95],[48,0],[0,48]])
    assert.equal(pixel(x,y)[3],0,'background must be transparent');
  let opaque=0,semi=0,clear=0;
  for(let i=0;i<data.length;i+=4){
    const [r,g,b,a]=data.subarray(i,i+4);
    if(a>100)opaque++;
    if(a>0&&a<255)semi++;
    if(a===0)clear++;
    if(a>0){assert.equal(r,255);assert.equal(g,255);assert.equal(b,255)}
  }
  assert.ok(opaque>500&&opaque<6000,'rings must be visible without a solid rectangle');
  assert.ok(clear>3000,'most of the icon background must be transparent');
  assert.ok(semi>0,'rings should have smooth anti-aliased edges');
});
