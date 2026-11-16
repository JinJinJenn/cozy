// Plots cut along streets (street-first): walk each block boundary edge, lay plots of lotW x lotD inward from the street edge,
// keep only plots that sit inside the block region and do not overlap earlier plots. Every plot therefore fronts a street.
import {polyArea,polyCentroid,pointInPoly,distSeg,r1,r2,r3} from './geom.js';

export function buildLots(T,block,blockId,siteId,S,ctx,rng,lots){
  const {reg,win,centre,segs,occ}=ctx,poly=block.poly,n=poly.length;
  const near=segs.filter(s=>s.mxx>=block.cx-120&&s.mnx<=block.cx+120&&s.mxz>=block.cz-120&&s.mnz<=block.cz+120);
  const cellOf=(x,z)=>{const xx=Math.floor((x-win.ox)/win.rs),yy=Math.floor((z-win.oz)/win.rs);return (xx<0||yy<0||xx>=win.W||yy>=win.W)?-1:yy*win.W+xx;};
  const inBlock=(x,z)=>{const q=cellOf(x,z);return q>=0&&reg[q]===block.q;};
  // walk the block boundary by arclength; each plot spans one chord of the (possibly curved) street edge
  const cum=[0];for(let i=0;i<n;i++){const p=poly[i],q=poly[(i+1)%n];cum.push(cum[i]+Math.hypot(q[0]-p[0],q[1]-p[1]));}
  const total=cum[n],at=s=>{s=((s%total)+total)%total;let i=0;while(cum[i+1]<s)i++;const p=poly[i],q=poly[(i+1)%n],t=(s-cum[i])/((cum[i+1]-cum[i])||1);return [p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];};
  const m=Math.floor(total/S.lotW);let kept=0;if(m<1)return 0;const w=total/m;
  {
    for(let j=0;j<m;j++){
      const ea=at(j*w),eb=at((j+1)*w),el=Math.hypot(eb[0]-ea[0],eb[1]-ea[1]);if(el<S.lotW*0.5)continue;
      const e={a:ea,b:eb,L:el},ux=(eb[0]-ea[0])/el,uz=(eb[1]-ea[1])/el;let nx=-uz,nz=ux;
      const mx=(ea[0]+eb[0])/2,mz=(ea[1]+eb[1])/2;if(!inBlock(mx+nx*1.5,mz+nz*1.5)){nx=-nx;nz=-nz;if(!inBlock(mx+nx*1.5,mz+nz*1.5))continue;}
      let placed=null;
      for(const df of [1,0.8,0.6]){
        const d=S.lotD*df*(0.9+rng()*0.2);
        const p0=e.a,p1=e.b;
        // pull a hair off the street edge so plots do not touch the road bed
        const q=[[p0[0]+nx*0.3,p0[1]+nz*0.3],[p1[0]+nx*0.3,p1[1]+nz*0.3],[p1[0]+nx*d,p1[1]+nz*d],[p0[0]+nx*d,p0[1]+nz*d]];
        const c=polyCentroid(q);let ok=inBlock(c[0],c[1]);
        for(const v of q){if(!ok)break;if(!inBlock(v[0]+(c[0]-v[0])*0.12,v[1]+(c[1]-v[1])*0.12))ok=false;}
        if(!ok)continue;
        // overlap with earlier plots (1 m raster occupancy)
        let tot=0,hit=0;const xs=q.map(v=>v[0]),zs=q.map(v=>v[1]);
        for(let z=Math.min(...zs);z<=Math.max(...zs);z+=1)for(let x=Math.min(...xs);x<=Math.max(...xs);x+=1){if(!pointInPoly(x,z,q))continue;tot++;const k=cellOf(x,z);if(k<0||occ[k])hit++;}
        if(tot===0||hit>tot*0.08)continue;
        placed=q;break;}
      if(!placed)continue;
      const lp=placed,A=Math.abs(polyArea(lp)),c=polyCentroid(lp);
      let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const v of lp){x0=Math.min(x0,v[0]);x1=Math.max(x1,v[0]);z0=Math.min(z0,v[1]);z1=Math.max(z1,v[1]);}
      let ns=0,ss=0,sm=0,hs=0,bad=false;
      for(let z=z0;z<=z1;z+=1)for(let x=x0;x<=x1;x+=1){if(!pointInPoly(x,z,lp))continue;const k=cellOf(x,z);if(k>=0)occ[k]=1;}
      for(let z=z0+1;z<z1;z+=2)for(let x=x0+1;x<x1;x+=2){if(!pointInPoly(x,z,lp))continue;ns++;if(T.state(x,z)!==0)bad=true;const sl=T.slopeAt(x,z);ss+=sl;if(sl>sm)sm=sl;hs+=T.height(x,z);}
      if(ns===0)continue;
      // frontage road = nearest street edge to the plot's street-side midpoint
      const fm=[(lp[0][0]+lp[1][0])/2,(lp[0][1]+lp[1][1])/2];let fr=null,fg=1e9,fx=0,fz=0;
      for(const s of near){const d=distSeg(fm[0],fm[1],s.ax,s.az,s.bx,s.bz);const g=d.d-s.hw;if(g<fg){fg=g;fr=s.rid;fx=d.x;fz=d.z;}}
      if(fr===null)continue;
      const slope=ss/ns,full=S.lotW*S.lotD;
      const buildable=!bad&&A>=full*0.4&&slope<=S.slopeLimit&&sm<=S.slopeLimit*2;
      const dc=Math.hypot(c[0]-centre.x,c[1]-centre.z)/S.R,coast=T.dSea[T.k(c[0],c[1])]*T.cell;
      const size=A<full*0.75?'small':A<full*1.05?'medium':'large';
      const district=dc<0.28?'centre':coast<45?'waterfront':dc<0.75?'residential':'outskirts';
      lots.push({id:'l'+lots.length,blockId,townId:siteId,poly:lp.map(v=>[r1(v[0]),r1(v[1])]),frontageRoadId:fr,area:Math.round(A*10)/10,slope:r3(slope),buildable,
        h:r2(hs/ns),size,district,facing:r3(Math.atan2(fz-c[1],fx-c[0]))});kept++;
    }
  }
  return kept;
}
