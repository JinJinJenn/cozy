// Seeds gallery: 12 seeds x every preset as top-down minimap contact sheets (pure node, no browser).
//   node tools/gallery.mjs [outDir]
import {writeFile,mkdir} from 'node:fs/promises';
import zlib from 'node:zlib';
import path from 'node:path';
import {createIsland} from '../src/island.js';
import {PRESET_IDS} from '../src/presets.js';
import {renderMinimapPixels} from '../src/minimap.js';
const date=new Date().toISOString().slice(0,10);
const out=process.argv[2]||path.resolve('docs/shots',date,'gallery');await mkdir(out,{recursive:true});
const crcT=new Uint32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=b=>{let c=0xffffffff;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
function png(W,H,rgba){
  const raw=Buffer.alloc((W*3+1)*H);
  for(let y=0;y<H;y++){raw[y*(W*3+1)]=0;for(let x=0;x<W;x++){const s=(y*W+x)*4,d=y*(W*3+1)+1+x*3;raw[d]=rgba[s];raw[d+1]=rgba[s+1];raw[d+2]=rgba[s+2];}}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const T=256,COLS=4,ROWS=3,seeds=['petalwood','clover-101','plum-202','mint-303','dune-404','fern-505','tide-606','honey-707','moss-808','pearl-909','lilac-111','ember-222'];
for(const id of PRESET_IDS){
  const W=T*COLS,H=T*ROWS,sheet=new Uint8ClampedArray(W*H*4);
  seeds.forEach((seed,i)=>{
    const isl=createIsland(seed,id),px=renderMinimapPixels(isl,T,T),ox=(i%COLS)*T,oy=Math.floor(i/COLS)*T;
    for(let y=0;y<T;y++)for(let x=0;x<T;x++){const s=(y*T+x)*4,d=((oy+y)*W+ox+x)*4;sheet[d]=px[s];sheet[d+1]=px[s+1];sheet[d+2]=px[s+2];sheet[d+3]=255;}
    console.log(id,seed,JSON.stringify({land:+isl.stats.landRatio.toFixed(2),peak:Math.round(isl.stats.maxH)}));
  });
  await writeFile(path.join(out,`gallery-${id}.png`),png(W,H,sheet));
}
console.log('gallery in',out);
