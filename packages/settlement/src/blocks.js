// Blocks: rasterise roads (+ water / cliffs) at 1 m into a local window, flood fill the free space, keep enclosed regions,
// trace their outlines. Streets come first; blocks are whatever the street network encloses.
import {distSeg,dpClosed,polyArea} from './geom.js';

export function rasterWindow(T,roads,site,S,rs=1){
  const Wh=Math.ceil(S.R*1.5+50),W=Math.round(2*Wh/rs),ox=site.x-Wh,oz=site.z-Wh,blocked=new Uint8Array(W*W);
  for(let y=0;y<W;y++)for(let x=0;x<W;x++){const px=ox+(x+0.5)*rs,pz=oz+(y+0.5)*rs;
    if(Math.abs(px)>=T.half-8||Math.abs(pz)>=T.half-8||T.state(px,pz)!==0||T.slopeAt(px,pz)>0.5)blocked[y*W+x]=1;}
  for(const r of roads){const rr=r.width/2+0.6;let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const p of r.pts){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1]);}
    if(x1+rr<ox||x0-rr>ox+W*rs||z1+rr<oz||z0-rr>oz+W*rs)continue;
    for(let i=0;i<r.pts.length-1;i++){const a=r.pts[i],b=r.pts[i+1];
      const xa=Math.max(0,Math.floor((Math.min(a[0],b[0])-rr-ox)/rs)),xb=Math.min(W-1,Math.ceil((Math.max(a[0],b[0])+rr-ox)/rs)),ya=Math.max(0,Math.floor((Math.min(a[1],b[1])-rr-oz)/rs)),yb=Math.min(W-1,Math.ceil((Math.max(a[1],b[1])+rr-oz)/rs));
      for(let y=ya;y<=yb;y++)for(let x=xa;x<=xb;x++){if(distSeg(ox+(x+0.5)*rs,oz+(y+0.5)*rs,a[0],a[1],b[0],b[1]).d<=rr)blocked[y*W+x]=1;}}}
  return {W,ox,oz,rs,blocked,Wh};
}
function traceOuter(cells,W,regionId,reg){
  // directed boundary edges, clockwise in x-right/z-down, interior on the right; vertex key = y*(W+1)+x
  const V=W+1,out=new Map();const add=(ax,ay,bx,by)=>{const k=ay*V+ax;let l=out.get(k);if(!l){l=[];out.set(k,l);}l.push([bx,by,0]);};
  for(const c of cells){const x=c%W,y=(c/W)|0;
    if(y===0||reg[c-W]!==regionId)add(x,y,x+1,y);
    if(x===W-1||reg[c+1]!==regionId)add(x+1,y,x+1,y+1);
    if(y===W-1||reg[c+W]!==regionId)add(x+1,y+1,x,y+1);
    if(x===0||reg[c-1]!==regionId)add(x,y+1,x,y);}
  let best=null,bestA=0;
  for(const [key,list] of [...out.entries()].sort((a,b)=>a[0]-b[0])){
    for(const e0 of list){if(e0[2])continue;
      const sx=key%V,sy=(key/V)|0;const loop=[[sx,sy]];let cx=sx,cy=sy,e=e0,guard=0;
      while(guard++<200000){e[2]=1;const nx=e[0],ny=e[1];if(nx===sx&&ny===sy)break;loop.push([nx,ny]);
        const dx=nx-cx,dy=ny-cy;cx=nx;cy=ny;const l=out.get(cy*V+cx);if(!l)break;
        // prefer right turn, then straight, then left (heading (dx,dy), right in z-down = (-dy,dx))
        const pref=[[-dy,dx],[dx,dy],[dy,-dx]];let nxt=null;
        for(const [px,py] of pref){for(const c of l){if(!c[2]&&c[0]-cx===px&&c[1]-cy===py){nxt=c;break;}}if(nxt)break;}
        if(!nxt)break;e=nxt;}
      if(loop.length>=4){const a=Math.abs(polyArea(loop));if(a>bestA){bestA=a;best=loop;}}}}
  return best;
}
export function buildBlocks(T,roads,site,S,ownerOf,opts={}){
  const win=rasterWindow(T,roads,site,S),{W,ox,oz,rs,blocked,Wh}=win;
  const reg=new Int32Array(W*W).fill(-1),lab=new Int32Array(W*W).fill(-1);let nl=0;const stack=new Int32Array(W*W);
  const info=[];
  // gap closing: flood fill on roads dilated by 2 cells (a street that stops a few metres short of another no longer leaks), then regrow regions 2 cells
  const GAP=opts.gap??2;let fb=blocked;
  if(GAP>0){fb=new Uint8Array(W*W);const tmp=new Uint8Array(W*W);fb.set(blocked);
    for(let it=0;it<GAP;it++){tmp.set(fb);for(let y=1;y<W-1;y++)for(let x=1;x<W-1;x++){const c=y*W+x;if(!fb[c]&&(fb[c-1]||fb[c+1]||fb[c-W]||fb[c+W]))tmp[c]=1;}fb.set(tmp);}}
  for(let s=0;s<W*W;s++){if(fb[s]||lab[s]>=0)continue;let sp=0;stack[sp++]=s;lab[s]=nl;const cells=[];let border=false,sx=0,sy=0;
    while(sp){const c=stack[--sp];cells.push(c);const x=c%W,y=(c/W)|0;sx+=x;sy+=y;if(x===0||y===0||x===W-1||y===W-1)border=true;
      if(x>0&&!fb[c-1]&&lab[c-1]<0){lab[c-1]=nl;stack[sp++]=c-1;}if(x<W-1&&!fb[c+1]&&lab[c+1]<0){lab[c+1]=nl;stack[sp++]=c+1;}
      if(y>0&&!fb[c-W]&&lab[c-W]<0){lab[c-W]=nl;stack[sp++]=c-W;}if(y<W-1&&!fb[c+W]&&lab[c+W]<0){lab[c+W]=nl;stack[sp++]=c+W;}}
    if(GAP>0&&!border){let fr=cells;for(let it=0;it<GAP;it++){const nx=[];for(const c of fr){const x=c%W,y=(c/W)|0;if(x<1||y<1||x>=W-1||y>=W-1)continue;for(const d of [-1,1,-W,W]){const q=c+d;if(!blocked[q]&&lab[q]<0){lab[q]=nl;nx.push(q);cells.push(q);}}}fr=nx;}
      sx=0;sy=0;for(const c of cells){sx+=c%W;sy+=(c/W)|0;}}
    info.push({cells,border,cx:ox+(sx/cells.length+0.5)*rs,cz:oz+(sy/cells.length+0.5)*rs});nl++;}
  const out=[];
  for(let q=0;q<info.length;q++){const r=info[q],area=r.cells.length*rs*rs;
    if(r.border||area<(opts.minBlock||130)||area>(opts.maxBlock||40000))continue;
    if(Math.hypot(r.cx-site.x,r.cz-site.z)>S.R*1.5)continue;
    if(ownerOf(r.cx,r.cz)!==site.id)continue;
    for(const c of r.cells)reg[c]=q;
    const loop=traceOuter(r.cells,W,q,reg);if(!loop)continue;
    const poly=dpClosed(loop,0.6).map(v=>[ox+v[0]*rs,oz+v[1]*rs]);if(poly.length<3)continue;
    out.push({q,poly,area,cx:r.cx,cz:r.cz});}
  return {blocks:out,win,reg};
}
