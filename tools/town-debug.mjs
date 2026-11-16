// Settlement debug renders (pure node, no browser): terrain + roads + blocks + plots for all four presets.
//   node tools/town-debug.mjs [outDir] [seed]
// Writes town-<preset>.png (whole island) and town-<preset>-zoom.png (first town) to docs/shots/<UTC date>/.
import {writeFile,mkdir} from 'node:fs/promises';
import zlib from 'node:zlib';
import path from 'node:path';
import {generate,PRESET_IDS} from '../packages/island-gen/index.js';
import {generateSettlement} from '../packages/settlement/index.js';
const date=new Date().toISOString().slice(0,10);
const out=process.argv[2]||path.resolve('docs/shots',date);const seed=process.argv[3]||'cozy-1';await mkdir(out,{recursive:true});
const crcT=new Uint32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=b=>{let c=0xffffffff;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
function png(W,H,rgba){const raw=Buffer.alloc((W*3+1)*H);
  for(let y=0;y<H;y++){raw[y*(W*3+1)]=0;for(let x=0;x<W;x++){const s=(y*W+x)*4,d=y*(W*3+1)+1+x*3;raw[d]=rgba[s];raw[d+1]=rgba[s+1];raw[d+2]=rgba[s+2];}}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}

function render(isl,plan,cx,cz,span,px){
  const W=px,H=px,scale=px/span,x0=cx-span/2,z0=cz-span/2,N=isl.grid,cell=isl.cell,half=isl.size/2,h=isl.heightfield,w=isl.water;
  const buf=new Uint8ClampedArray(W*H*4);
  const hAt=(x,z)=>{const i=Math.min(N-2,Math.max(0,Math.floor((x+half)/cell))),j=Math.min(N-2,Math.max(0,Math.floor((z+half)/cell)));return h[j*N+i];};
  const wAt=(x,z)=>{const i=Math.min(N-1,Math.max(0,Math.round((x+half)/cell))),j=Math.min(N-1,Math.max(0,Math.round((z+half)/cell)));return w[j*N+i];};
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const wx=x0+(x+0.5)/scale,wz=z0+(y+0.5)/scale,hh=hAt(wx,wz),d=4;
    const sh=Math.max(-0.5,Math.min(0.5,((hAt(wx-d,wz)-hAt(wx+d,wz))+(hAt(wx,wz-d)-hAt(wx,wz+d)))*0.05)),o=(y*W+x)*4;let r,g,b;
    if(hh<0){const t=Math.min(1,-hh/30);r=70-40*t;g=130-60*t;b=190-60*t;}
    else if(wAt(wx,wz)>0.02){r=80;g=140;b=200;}
    else{const t=Math.min(1,hh/90);r=hh<1.5?226:120+70*t;g=hh<1.5?210:160-20*t;b=hh<1.5?160:90+60*t;r+=sh*70;g+=sh*70;b+=sh*70;}
    buf[o]=r;buf[o+1]=g;buf[o+2]=b;buf[o+3]=255;}
  const px2=(X,Y,c,a)=>{if(X<0||Y<0||X>=W||Y>=H)return;const o=(Y*W+X)*4;buf[o]+=(c[0]-buf[o])*a;buf[o+1]+=(c[1]-buf[o+1])*a;buf[o+2]+=(c[2]-buf[o+2])*a;};
  const toS=p=>[(p[0]-x0)*scale,(p[1]-z0)*scale];
  const fillPoly=(poly,c,a)=>{const s=poly.map(toS);let mn=1e9,mx=-1e9;for(const p of s){mn=Math.min(mn,p[1]);mx=Math.max(mx,p[1]);}
    for(let y=Math.max(0,Math.floor(mn));y<=Math.min(H-1,Math.ceil(mx));y++){const xs=[];const yy=y+0.5;
      for(let i=0;i<s.length;i++){const A=s[i],B=s[(i+1)%s.length];if((A[1]>yy)!==(B[1]>yy))xs.push(A[0]+(yy-A[1])*(B[0]-A[0])/(B[1]-A[1]));}
      xs.sort((p,q)=>p-q);for(let i=0;i+1<xs.length;i+=2)for(let x=Math.max(0,Math.ceil(xs[i]-0.5));x<=Math.min(W-1,Math.floor(xs[i+1]-0.5));x++)px2(x,y,c,a);}};
  const line=(pts,wm,c,a=1)=>{const r=Math.max(0.6,wm*scale/2);for(let i=0;i<pts.length-1;i++){const A=toS(pts[i]),B=toS(pts[i+1]),n=Math.max(1,Math.ceil(Math.hypot(B[0]-A[0],B[1]-A[1])*2));
    for(let t=0;t<=n;t++){const X=A[0]+(B[0]-A[0])*t/n,Y=A[1]+(B[1]-A[1])*t/n;for(let dy=-Math.ceil(r);dy<=Math.ceil(r);dy++)for(let dx=-Math.ceil(r);dx<=Math.ceil(r);dx++)if(dx*dx+dy*dy<=r*r)px2(Math.round(X+dx),Math.round(Y+dy),c,a);}}};
  const outline=(poly,c,a)=>line(poly.concat([poly[0]]),0.5/scale*1.1,c,a);
  for(const b of plan.blocks)fillPoly(b.poly,[255,255,255],0.18);
  for(const l of plan.lots){fillPoly(l.poly,l.buildable?[120,200,90]:[220,70,60],0.45);}
  for(const l of plan.lots)outline(l.poly,[40,50,30],0.8);
  for(const r of plan.roads){const c=r.class==='main'?[236,196,110]:r.class==='street'?[245,240,225]:[205,165,115];
    line(r.pts,r.width+(r.bridge?2:0),r.bridge?[110,70,40]:[60,50,40],0.85);line(r.pts,r.width,r.bridge?[210,170,120]:c,1);}
  for(const s of plan.sites){const c=toS([s.x,s.z]);for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)if(dx*dx+dy*dy<=16)px2(Math.round(c[0]+dx),Math.round(c[1]+dy),[220,40,200],1);}
  return png(W,H,buf);
}
for(const id of PRESET_IDS){
  const isl=generate({seed,preset:id}),plan=generateSettlement(isl,{seed,style:id});
  await writeFile(path.join(out,`town-${id}.png`),render(isl,plan,0,0,isl.size,1024));
  const s=plan.sites[0];if(s)await writeFile(path.join(out,`town-${id}-zoom.png`),render(isl,plan,s.x,s.z,380,1140));
  console.log(id,JSON.stringify(plan.stats));
}
console.log('town shots in',out);
