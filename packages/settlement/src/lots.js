// Plots cut along streets (street-first): walk each block boundary, lay plots inward from the street edge. A plot is a
// quadrilateral whose side edges follow the local street normal (so frontage curves fan the plots), a corner lot wraps
// a sharp block corner (5+ vertices), and a second pass fills leftover interior areas with irregular polygons that
// still touch a street. Plots stay inside the block region and never overlap (1 m raster occupancy).
import {polyArea,polyCentroid,pointInPoly,distSeg,dpClosed,r1,r2,r3} from './geom.js';

export function buildLots(T,block,blockId,siteId,S,ctx,rng,lots){
  const {reg,win,centre,segs,occ}=ctx,poly0=block.poly,poly=(()=>{const d=dpClosed(poly0,1.0);return d.length>=3?d:poly0;})(),n=poly.length,full=S.lotW*S.lotD,rs=win.rs;
  const near=segs.filter(s=>s.mxx>=block.cx-120&&s.mnx<=block.cx+120&&s.mxz>=block.cz-120&&s.mnz<=block.cz+120);
  const cellOf=(x,z)=>{const xx=Math.floor((x-win.ox)/rs),yy=Math.floor((z-win.oz)/rs);return (xx<0||yy<0||xx>=win.W||yy>=win.W)?-1:yy*win.W+xx;};
  const inBlock=(x,z)=>{const q=cellOf(x,z);return q>=0&&reg[q]===block.q;};
  // window cells whose centre lies inside a polygon
  const cellsIn=p=>{let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const v of p){x0=Math.min(x0,v[0]);x1=Math.max(x1,v[0]);z0=Math.min(z0,v[1]);z1=Math.max(z1,v[1]);}
    const out=[];const xa=Math.max(0,Math.floor((x0-win.ox)/rs)),xb=Math.min(win.W-1,Math.ceil((x1-win.ox)/rs)),ya=Math.max(0,Math.floor((z0-win.oz)/rs)),yb=Math.min(win.W-1,Math.ceil((z1-win.oz)/rs));
    for(let y=ya;y<=yb;y++)for(let x=xa;x<=xb;x++)if(pointInPoly(win.ox+(x+0.5)*rs,win.oz+(y+0.5)*rs,p))out.push(y*win.W+x);return out;};
  const overlap=cells=>{let hit=0;for(const c of cells)if(occ[c]||reg[c]!==block.q)hit++;return hit;};   // occupied or outside the block region
  let kept=0;
  const crs=(o,p,q)=>(p[0]-o[0])*(q[1]-o[1])-(p[1]-o[1])*(q[0]-o[0]);
  const simple=p=>{const k=p.length;for(let i=0;i<k;i++)for(let j=i+2;j<k;j++){if(i===0&&j===k-1)continue;const a=p[i],b=p[(i+1)%k],c=p[j],d=p[(j+1)%k];if(crs(a,b,c)*crs(a,b,d)<0&&crs(c,d,a)*crs(c,d,b)<0)return false;}return true;};
  // finish a plot: stats, frontage road, buildable flag. fm = point on the street side used to pick the frontage road.
  function commit(lp,shape,fm,cells,maxGap=4.5){
    lp=lp.map(v=>[r1(v[0]),r1(v[1])]);if(!simple(lp))return false;   // rounded output must stay a simple polygon
    const A=Math.abs(polyArea(lp)),c=polyCentroid(lp);
    let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const v of lp){x0=Math.min(x0,v[0]);x1=Math.max(x1,v[0]);z0=Math.min(z0,v[1]);z1=Math.max(z1,v[1]);}
    let ns=0,ss=0,sm=0,hs=0,bad=false;
    for(let z=z0+1;z<z1;z+=2)for(let x=x0+1;x<x1;x+=2){if(!pointInPoly(x,z,lp))continue;ns++;if(T.state(x,z)!==0)bad=true;const sl=T.slopeAt(x,z);ss+=sl;if(sl>sm)sm=sl;hs+=T.height(x,z);}
    if(ns===0)return false;
    let fr=null,fg=1e9,fx=0,fz=0;
    for(const s of near){const d=distSeg(fm[0],fm[1],s.ax,s.az,s.bx,s.bz);const g=d.d-s.hw;if(g<fg){fg=g;fr=s.rid;fx=d.x;fz=d.z;}}
    if(fr===null||fg>maxGap)return false;   // a plot must front a street, not a shore or cliff edge
    for(const q of cells)occ[q]=1;
    const slope=ss/ns;
    const buildable=!bad&&A>=full*0.4&&slope<=S.slopeLimit&&sm<=S.slopeLimit*2;
    const dc=Math.hypot(c[0]-centre.x,c[1]-centre.z)/S.R,coast=T.dSea[T.k(c[0],c[1])]*T.cell;
    const size=A<full*0.75?'small':A<full*1.05?'medium':'large';
    const district=dc<0.28?'centre':coast<45?'waterfront':dc<0.75?'residential':'outskirts';
    lots.push({id:'l'+lots.length,blockId,townId:siteId,poly:lp,frontageRoadId:fr,area:Math.round(A*10)/10,slope:r3(slope),buildable,
      h:r2(hs/ns),size,district,facing:r3(Math.atan2(fz-c[1],fx-c[0])),shape});kept++;return true;
  }
  // ---- pass 1: street-first quads and corner lots along the (possibly curved) boundary ----
  const cum=[0];for(let i=0;i<n;i++){const p=poly[i],q=poly[(i+1)%n];cum.push(cum[i]+Math.hypot(q[0]-p[0],q[1]-p[1]));}
  const total=cum[n],at=s=>{s=((s%total)+total)%total;let i=0;while(cum[i+1]<s)i++;const p=poly[i],q=poly[(i+1)%n],t=(s-cum[i])/((cum[i+1]-cum[i])||1);return [p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];};
  const corners=[];for(let i=0;i<n;i++){const a=poly[(i+n-1)%n],b=poly[i],c=poly[(i+1)%n],ux=b[0]-a[0],uz=b[1]-a[1],vx=c[0]-b[0],vz=c[1]-b[1];
    const turn=Math.abs(Math.atan2(ux*vz-uz*vx,ux*vx+uz*vz));if(turn>=0.5){const L1=Math.hypot(ux,uz)||1,L2=Math.hypot(vx,vz)||1;corners.push({s:cum[i]||total,s0:cum[i],i,turn,n1:[-uz/L1,ux/L1],n2:[-vz/L2,vx/L2],p:b});}}
  const tang=s=>{const dl=S.lotW*0.5,a=at(s-dl),b=at(s+dl),L=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [(b[0]-a[0])/L,(b[1]-a[1])/L];};
  const m=Math.floor(total/S.lotW);
  if(m>=1){const w=total/m;
    for(let j=0;j<m;j++){
      const s0=j*w,s1=(j+1)*w,ea=at(s0),eb=at(s1),el=Math.hypot(eb[0]-ea[0],eb[1]-ea[1]);if(el<S.lotW*0.5)continue;
      const ux=(eb[0]-ea[0])/el,uz=(eb[1]-ea[1])/el;let nx=-uz,nz=ux;
      const mx=(ea[0]+eb[0])/2,mz=(ea[1]+eb[1])/2;let sg=1;if(!inBlock(mx+nx*1.5,mz+nz*1.5)){sg=-1;nx=-nx;nz=-nz;if(!inBlock(mx+nx*1.5,mz+nz*1.5))continue;}
      // street-side points: chord ends plus sharp block corners strictly inside the chord (miter normals)
      const P=[];{const t0=tang(s0),t1=tang(s1);P.push({p:ea,n:[-t0[1]*sg,t0[0]*sg],k:1});
        for(const c of corners){if(c.s>s0+4&&c.s<s1-4){let bx=(c.n1[0]+c.n2[0])*sg,bz=(c.n1[1]+c.n2[1])*sg;const L=Math.hypot(bx,bz);if(L<0.35)continue;
          P.push({p:c.p,n:[bx/L,bz/L],k:Math.min(1.7,2/L)});}}
        P.push({p:eb,n:[-t1[1]*sg,t1[0]*sg],k:1});}
      const Pfull=P;let placed=null,cornerLot=false;
      for(const useCorner of (P.length>2?[true,false]:[false])){if(placed)break;
      const PP=useCorner?Pfull:[Pfull[0],Pfull[Pfull.length-1]];cornerLot=useCorner;
      for(const df of [1,0.8,0.6]){
        const d=S.lotD*df*(0.9+rng()*0.2);
        const O=PP.map(v=>[v.p[0]+v.n[0]*0.3*v.k,v.p[1]+v.n[1]*0.3*v.k]),I=PP.map(v=>[v.p[0]+v.n[0]*d*v.k,v.p[1]+v.n[1]*d*v.k]);
        const q=O.concat(I.slice().reverse());
        const A=Math.abs(polyArea(q));if(A<el*d*0.55||!simple(q))continue;
        if(!cornerLot){const iw=Math.hypot(I[1][0]-I[0][0],I[1][1]-I[0][1]);if(iw<el*0.55||iw>el*1.8)continue;}
        const c=polyCentroid(q);let ok=inBlock(c[0],c[1]);
        for(const v of q){if(!ok)break;if(!inBlock(v[0]+(c[0]-v[0])*0.12,v[1]+(c[1]-v[1])*0.12))ok=false;}
        for(let i=0;ok&&i<I.length-1;i++){const mm=[(I[i][0]+I[i+1][0])/2,(I[i][1]+I[i+1][1])/2];if(!inBlock(mm[0]+(c[0]-mm[0])*0.1,mm[1]+(c[1]-mm[1])*0.1))ok=false;}
        if(!ok)continue;
        const cells=cellsIn(q);if(!cells.length||overlap(cells)>cells.length*0.04)continue;
        placed={q,cells};break;}}
      if(!placed)continue;
      const fm=cornerLot?Pfull[1].p:[(ea[0]+eb[0])/2,(ea[1]+eb[1])/2];
      commit(placed.q,cornerLot?'corner':'quad',fm,placed.cells);
    }
  }
  // ---- pass 2: leftover interior areas become irregular lots (must still reach a street) ----
  const W=win.W;
  if(!ctx.F)ctx.F=new Uint8Array(W*W);
  const F=ctx.F;
  let bx0=1e9,bx1=-1e9,by0=1e9,by1=-1e9;for(const v of poly){bx0=Math.min(bx0,v[0]);bx1=Math.max(bx1,v[0]);by0=Math.min(by0,v[1]);by1=Math.max(by1,v[1]);}
  const xa=Math.max(1,Math.floor((bx0-win.ox)/rs)-1),xb=Math.min(W-2,Math.ceil((bx1-win.ox)/rs)+1),ya=Math.max(1,Math.floor((by0-win.oz)/rs)-1),yb=Math.min(W-2,Math.ceil((by1-win.oz)/rs)+1);
  const cand=[];
  for(let y=ya;y<=yb;y++)for(let x=xa;x<=xb;x++){const c=y*W+x;if(reg[c]===block.q&&!occ[c]){F[c]=1;cand.push(c);}}
  const keep=[];for(const c of cand)if(F[c-1]&&F[c+1]&&F[c-W]&&F[c+W])keep.push(c);   // erode one cell: margin to roads and neighbours
  for(const c of cand)F[c]=0;for(const c of keep)F[c]=1;
  const comps=[];
  for(const s of keep){if(F[s]!==1)continue;const cells=[],st=[s];F[s]=2;while(st.length){const c=st.pop();cells.push(c);for(const d of [-1,1,-W,W]){const q=c+d;if(F[q]===1){F[q]=2;st.push(q);}}}comps.push(cells);}
  for(const c of keep)F[c]=0;
  const minCells=full*0.4/(rs*rs),maxCells=full*1.7/(rs*rs);
  const split=cells=>{if(cells.length<=maxCells)return [cells];
    let mx=0,my=0;for(const c of cells){mx+=c%W;my+=(c/W)|0;}mx/=cells.length;my/=cells.length;
    let cxx=0,cyy=0,cxy=0;for(const c of cells){const dx=c%W-mx,dy=((c/W)|0)-my;cxx+=dx*dx;cyy+=dy*dy;cxy+=dx*dy;}
    const ang=0.5*Math.atan2(2*cxy,cxx-cyy),ax=Math.cos(ang),ay=Math.sin(ang),A=[],B=[];
    for(const c of cells){const pj=(c%W-mx)*ax+(((c/W)|0)-my)*ay;if(pj<-0.75)A.push(c);else if(pj>0.75)B.push(c);}
    return split(A).concat(split(B));};
  const hullOf=cells=>{const pts=[];for(const c of cells){const x=win.ox+(c%W)*rs,z=win.oz+((c/W)|0)*rs;pts.push([x,z],[x+rs,z],[x,z+rs],[x+rs,z+rs]);}
    pts.sort((p,q)=>p[0]-q[0]||p[1]-q[1]);const cr=(o,p,q)=>(p[0]-o[0])*(q[1]-o[1])-(p[1]-o[1])*(q[0]-o[0]);const lo=[],up=[];
    for(const p of pts){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);}
    for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p);}
    lo.pop();up.pop();return lo.concat(up);};
  const tryPiece=(cells,depth)=>{if(cells.length<minCells)return;
    let hull=hullOf(cells);hull=dpClosed(hull,0.7);if(hull.length>=3&&hull.length<=10){
      const A=Math.abs(polyArea(hull));let per=0;for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length];per+=Math.hypot(b[0]-a[0],b[1]-a[1]);}
      const c=polyCentroid(hull),cl=cellsIn(hull);
      let fm=null,bg=1e9;for(const v of hull)for(const s of near){const g=distSeg(v[0],v[1],s.ax,s.az,s.bx,s.bz).d-s.hw;if(g<bg){bg=g;fm=v;}}
      const okShape=A>=full*0.4&&A/(per*per)>=0.045&&inBlock(c[0],c[1])&&fm&&bg<=S.lotD*0.9;
      if(okShape&&cl.length&&overlap(cl)<=cl.length*0.03){commit(hull,'irregular',fm,cl,S.lotD*0.9);return;}}
    if(depth>=3||cells.length<minCells*2.2)return;
    // concave or overlapping: bisect along the principal axis (with a 1 m gap) and retry each half
    let mx=0,my=0;for(const c of cells){mx+=c%W;my+=(c/W)|0;}mx/=cells.length;my/=cells.length;
    let cxx=0,cyy=0,cxy=0;for(const c of cells){const dx=c%W-mx,dy=((c/W)|0)-my;cxx+=dx*dx;cyy+=dy*dy;cxy+=dx*dy;}
    const ang=0.5*Math.atan2(2*cxy,cxx-cyy),ax=Math.cos(ang),ay=Math.sin(ang),A=[],B=[];
    for(const c of cells){const pj=(c%W-mx)*ax+(((c/W)|0)-my)*ay;if(pj<-0.75)A.push(c);else if(pj>0.75)B.push(c);}
    tryPiece(A,depth+1);tryPiece(B,depth+1);};
  for(const comp of comps){for(const cells of split(comp))tryPiece(cells,0);}
  return kept;
}
