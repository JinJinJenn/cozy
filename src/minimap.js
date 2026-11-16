import {clamp,lerp} from '../packages/island-gen/src/rng.js';

// Top-down minimap: depth-tinted water + zone-painted land with hillshade.
export function renderMinimapPixels(island,W,H){
  const img={data:new Uint8ClampedArray(W*H*4)};
  const pal=island.preset.palette,hexc=h=>{const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255];};
  const shallow=hexc(pal.shallow),deep=hexc(pal.deep);
  for(let py=0;py<H;py++)for(let px=0;px<W;px++){
    const x=((px+.5)/W-.5)*island.size,z=((py+.5)/H-.5)*island.size;
    const h=island.sample(x,z);let r,g,b;
    const lv=island.waterAt(x,z),d=Math.max(h<0?-h:0,lv>h?lv-h:0);
    if(d>.05){const t=1-Math.exp(-d*.11);r=lerp(shallow[0],deep[0],t);g=lerp(shallow[1],deep[1],t);b=lerp(shallow[2],deep[2],t);}
    else{
      const e=14,gx=(island.sample(x+e,z)-island.sample(x-e,z))/(2*e),gz=(island.sample(x,z+e)-island.sample(x,z-e))/(2*e);
      const s=Math.hypot(gx,gz),c=island.paint(x,z,h,s,island.wetAt(x,z,h));
      const shade=clamp(.78+(-gx*-.45+-gz*.5)*1.1,.45,1.15);
      const sr=v=>Math.pow(clamp(v*shade,0,1),1/2.2)*255;r=sr(c[0]);g=sr(c[1]);b=sr(c[2]);
    }
    const k=(py*W+px)*4;img.data[k]=r;img.data[k+1]=g;img.data[k+2]=b;img.data[k+3]=255;
  }
  return img.data;
}
export function drawMinimap(canvas,island){
  const W=canvas.width,H=canvas.height,ctx=canvas.getContext('2d'),img=ctx.createImageData(W,H);
  img.data.set(renderMinimapPixels(island,W,H));ctx.putImageData(img,0,0);
}
export function drawMarker(canvas,island,target,cam){
  const W=canvas.width,H=canvas.height,ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  const m=(x,z)=>[(x/island.size+.5)*W,(z/island.size+.5)*H];
  const [cx,cy]=m(cam.x,cam.z),[tx,ty]=m(target.x,target.z);
  ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(tx,ty);ctx.stroke();
  ctx.fillStyle='#e9558f';ctx.strokeStyle='#fff';ctx.beginPath();ctx.arc(cx,cy,4,0,7);ctx.fill();ctx.stroke();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(tx,ty,3,0,7);ctx.fill();
}
