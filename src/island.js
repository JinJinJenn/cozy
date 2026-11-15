import {rng,makeNoise,clamp,lerp,smooth,hashSeed} from './rng.js';
import {PRESETS} from './presets.js';

// Heightfield island generator. Pure data (no DOM/Three). Deterministic:
// same (seed, presetId, opts) always produces the same arrays.
//
// Pipeline: lobe/falloff mask + domain-warped fBm + ridged mountains
//   -> droplet hydraulic erosion -> thermal relax -> rivers + lakes
//   -> beach shaping -> cliff terraces -> water-level + wetness grids.

export const SEA_LEVEL=0;
const CHUNK_DEFAULT=64;

const lin=v=>Math.pow(v,2.2);
// palette hex -> LINEAR rgb (Three outputs sRGB, so vertex colours must be linear)
const hex=h=>{const n=parseInt(h.slice(1),16);return [lin((n>>16&255)/255),lin((n>>8&255)/255),lin((n&255)/255)];};
const win=(v,w)=>{ // range window [a,b,soft] -> 0..1
  if(!w) return 1;
  const [a,b,s=1]=w;
  return smooth(a-s,a,v)*(1-smooth(b,b+s,v));
};

export function createIsland(seedValue='petalwood',presetId='meadowCove',opts={}){
  const preset=PRESETS[presetId]||PRESETS.meadowCove;
  const id=PRESETS[presetId]?presetId:'meadowCove';
  const seed=String(seedValue).trim().slice(0,48)||'petalwood';
  const N=opts.grid||preset.grid,size=preset.size,half=size/2,cell=size/(N-1);
  const key=`${seed}|${id}`;
  const nz=makeNoise(key);
  const h=new Float32Array(N*N);

  // ---------------- 1. base shape ----------------
  const lobes=preset.lobes.map(l=>({...l}));
  if(preset.scatter){
    const r=rng(key+':scatter'),sc=preset.scatter;
    let tries=0;
    while(lobes.length<1+sc.count&&tries++<400){
      const a=r()*Math.PI*2,d=sc.avoid+r()*(sc.spread-sc.avoid),rr=sc.minR+r()*(sc.maxR-sc.minR);
      const x=Math.cos(a)*d,z=Math.sin(a)*d;
      if(Math.abs(x)+rr>half*.82||Math.abs(z)+rr>half*.82) continue;
      if(lobes.some(l=>Math.hypot(l.x-x,l.z-z)<(l.r+rr)*.62)) continue;
      lobes.push({x,z,r:rr});
    }
  }
  const bays=preset.bays||[];
  const knolls=[];
  if(preset.knolls){
    const kr=rng(key+':knolls'),K=preset.knolls;let t=0;
    while(knolls.length<K.count&&t++<300){
      const a=kr()*Math.PI*2,d=Math.sqrt(kr())*lobes[0].r*K.spread,r=K.r[0]+kr()*(K.r[1]-K.r[0]);
      knolls.push({x:lobes[0].x+Math.cos(a)*d,z:lobes[0].z+Math.sin(a)*d,r,h:K.h[0]+kr()*(K.h[1]-K.h[0])});
    }
  }
  const W=preset.warp,B=preset.base,Hh=preset.hills,Mt=preset.mountains;
  const detailFreq=.03;
  const maskAt=(wx,wz)=>{
    let m=-1;
    for(const l of lobes) m=Math.max(m,1-Math.hypot(wx-l.x,wz-l.z)/l.r);
    for(const b of bays) m-=b.depth*smooth(b.r,b.r*.15,Math.hypot(wx-b.x,wz-b.z));
    return m;
  };
  const baseHeight=(x,z)=>{
    const wx=x+nz.fbm(x*W.freq+11,z*W.freq+7,3)*W.amp;
    const wz=z+nz.fbm(x*W.freq-5,z*W.freq+23,3)*W.amp;
    const m=maskAt(wx,wz);
    let out;
    if(m<0){
      const t=-m;
      out=-B.shelfDepth*smooth(0,B.shelfWidth,t)-(B.deepDepth-B.shelfDepth)*smooth(B.shelfWidth,B.shelfWidth*3.2,t);
    }else{
      out=B.coastRise*smooth(0,.06,m)+B.inlandLift*smooth(.05,.7,m);
    }
    const land=smooth(.0,.22,m);
    if(land>0){
      let amp=Hh.amp;
      if(Hh.inlandBias){const b=Hh.inlandBias;amp*=1+b.amp*smooth(b.from,b.to,((x/half)*b.x+(z/half)*b.z));}
      const hills=nz.fbm(wx*Hh.freq+300,wz*Hh.freq+300,Hh.oct)*.5+.5;
      out+=(hills*hills*1.35)*amp*land;
      out+=nz.fbm(x*detailFreq+90,z*detailFreq+90,3)*Hh.detail*land;
      for(const k of knolls){const q=Math.hypot(x-k.x,z-k.z)/k.r;if(q<2.2)out+=k.h*Math.exp(-q*q)*land;}
      if(Mt){
        let cmask=1;
        if(Mt.center) cmask=1-smooth(Mt.center.r*.35,Mt.center.r,Math.hypot(x-Mt.center.x,z-Mt.center.z));
        const ridge=Math.pow(nz.ridged(wx*Mt.freq+700,wz*Mt.freq+700,Mt.oct),Mt.power);
        out+=ridge*Mt.amp*cmask*smooth(.32,.85,m);
      }
    }
    return out;
  };
  for(let j=0;j<N;j++)for(let i=0;i<N;i++) h[j*N+i]=baseHeight(-half+i*cell,-half+j*cell);

  // ---------------- 2. erosion ----------------
  const E=preset.erosion,er=rng(key+':erosion');
  const droplets=opts.droplets??E.droplets;
  if(droplets>0) hydraulic(h,N,droplets,er);
  if(E.thermal>0) thermal(h,N,E.thermal,E.talus*cell*.5);

  // ---------------- 3. rivers + lakes ----------------
  const water=new Float32Array(N*N); // water surface level (>0 only where a river/lake holds water above sea)
  const gi=(x,z)=>[ (x+half)/cell,(z+half)/cell ];
  const hAt=(i,j)=>h[clamp(j,0,N-1)*N+clamp(i,0,N-1)];
  const lakeRng=rng(key+':lakes'),riverRng=rng(key+':rivers');
  const lakes=[];
  if(preset.lakes&&preset.lakes.count>0){
    const L=preset.lakes;let tries=0;
    while(lakes.length<L.count&&tries++<300){
      const x=(lakeRng()*2-1)*half*.55,z=(lakeRng()*2-1)*half*.55,r=L.r[0]+lakeRng()*(L.r[1]-L.r[0]);
      const [fi,fj]=gi(x,z),h0=hAt(Math.round(fi),Math.round(fj));
      if(h0<8||h0>L.maxH) continue;
      if(lakes.some(k=>Math.hypot(k.x-x,k.z-z)<(k.r+r)*1.4)) continue;
      // ring minimum decides the water level so it can't spill
      let ringMin=1e9;
      for(let a=0;a<24;a++){const px=x+Math.cos(a/24*6.2832)*r*1.15,pz=z+Math.sin(a/24*6.2832)*r*1.15;const [pi,pj]=gi(px,pz);ringMin=Math.min(ringMin,hAt(Math.round(pi),Math.round(pj)));}
      if(ringMin<4) continue;
      const level=ringMin-.7;
      lakes.push({x,z,r,level,depth:L.depth,seed:lakeRng()*100});
    }
    for(const lk of lakes){
      const reach=lk.r*2.2,i0=Math.floor(gi(lk.x-reach,0)[0]),i1=Math.ceil(gi(lk.x+reach,0)[0]),j0=Math.floor(gi(0,lk.z-reach)[1]),j1=Math.ceil(gi(0,lk.z+reach)[1]);
      for(let j=Math.max(0,j0);j<=Math.min(N-1,j1);j++)for(let i=Math.max(0,i0);i<=Math.min(N-1,i1);i++){
        const x=-half+i*cell,z=-half+j*cell,dx=x-lk.x,dz=z-lk.z,d=Math.hypot(dx,dz),a=Math.atan2(dz,dx);
        const rr=lk.r*(.78+.3*nz.noise(Math.cos(a)*1.3+lk.seed,Math.sin(a)*1.3+lk.seed));
        const t=d/rr;
        if(t<2){
          const floor=lk.level-lk.depth*(1-Math.min(1,t)**2.2);
          const k=smooth(2,.82,t);
          const target=t<1?floor:lerp(h[j*N+i],Math.min(h[j*N+i],lk.level+.3),k);
          if(t<1) h[j*N+i]=Math.min(h[j*N+i],target); else h[j*N+i]=Math.min(h[j*N+i],lerp(h[j*N+i],lk.level+.35,k*.7));
        }
        if(t<1.05) water[j*N+i]=Math.max(water[j*N+i],lk.level);
      }
    }
  }
  const riverPaths=[];
  if(preset.rivers&&preset.rivers.count>0){
    const R=preset.rivers;const cands=[];
    for(let k=0;k<700;k++){
      const x=(riverRng()*2-1)*half*.6,z=(riverRng()*2-1)*half*.6,[fi,fj]=gi(x,z),h0=hAt(Math.round(fi),Math.round(fj));
      if(h0>R.minH) cands.push({x,z,fi,fj,h0});
    }
    cands.sort((a,b)=>b.h0-a.h0);
    const picked=[];
    for(const c of cands){
      if(picked.length>=R.count) break;
      if(picked.some(p=>Math.hypot(p.x-c.x,p.z-c.z)<half*.25)) continue;
      picked.push(c);
    }
    for(const src of picked){
      let fi=src.fi,fj=src.fj,dx=0,dz=0;const path=[];
      for(let step=0;step<4000;step++){
        const ci=Math.round(fi),cj=Math.round(fj);
        if(ci<1||cj<1||ci>N-2||cj>N-2) break;
        const here=hAt(ci,cj);
        if(here<.3) break;
        path.push([ci,cj,here]);
        // steepest descent among 8 neighbours with momentum
        let best=null,bs=1e9;
        for(let oj=-1;oj<=1;oj++)for(let oi=-1;oi<=1;oi++){
          if(!oi&&!oj) continue;
          const nh=hAt(ci+oi,cj+oj)+ (oi*dx+oj*dz)*-.12 + nz.noise((ci+oi)*.3,(cj+oj)*.3)*.05;
          const dist=Math.hypot(oi,oj);
          const sc=(nh-here)/dist;
          if(sc<bs){bs=sc;best=[oi,oj];}
        }
        if(path.length>3&&path.slice(-12,-1).some(p=>p[0]===ci+best[0]&&p[1]===cj+best[1])){best=[Math.sign(dx)||1,Math.sign(dz)||1];}
        dx=best[0];dz=best[1];fi=ci+dx;fj=cj+dz;
      }
      if(path.length<30) continue;
      riverPaths.push(path);
      // carve with a monotonically descending bed
      let bed=1e9;
      const wCells=R.width/cell;
      path.forEach((p,idx)=>{
        const f=idx/path.length;
        const depth=R.depth*(.45+.9*f);
        bed=Math.min(bed-.015,p[2]-depth);
        const rad=Math.ceil(wCells*(1+f*1.2)+1.5);
        for(let oj=-rad;oj<=rad;oj++)for(let oi=-rad;oi<=rad;oi++){
          const ci=p[0]+oi,cj=p[1]+oj;
          if(ci<0||cj<0||ci>=N||cj>=N) continue;
          const d=Math.hypot(oi,oj),w=smooth(rad,wCells*.35,d);
          if(w<=0) continue;
          const k=cj*N+ci,target=bed+(1-w)*(R.depth*1.6);
          if(target<h[k]) h[k]=lerp(h[k],target,Math.min(1,w*1.15));
          if(d<=wCells*(1+f*1.2)*.62&&bed>.35) water[k]=Math.max(water[k],bed+.45);
        }
      });
    }
  }

  // plateaus (flat buildable shelves) and river-bank smoothing
  for(const pl of preset.plateaus||[]){
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){
      const x=-half+i*cell,z=-half+j*cell,d=Math.hypot((x-pl.x)/pl.rx,(z-pl.z)/pl.rz);
      const w=1-smooth(1,1+pl.soft,d);
      if(w>0&&h[j*N+i]>-1.5) h[j*N+i]=lerp(h[j*N+i],pl.level,w*(pl.amount??1));
    }
  }
  for(let pass=0;pass<2;pass++){
    const t=Float32Array.from(h);
    for(let j=2;j<N-2;j++)for(let i=2;i<N-2;i++){
      const k=j*N+i;let near=false;
      for(let o=-2;o<=2&&!near;o+=2)for(let q=-2;q<=2;q+=2)if(water[k+o*N+q]>0){near=true;break;}
      if(!near||water[k]>0&&h[k]<water[k]-.5) continue;
      if(water[k]>0) continue;
      const a=(h[k-1]+h[k+1]+h[k-N]+h[k+N]+h[k-N-1]+h[k-N+1]+h[k+N-1]+h[k+N+1])/8;
      t[k]=Math.max(lerp(h[k],a,.55),(water[k+1]||water[k-1]||water[k+N]||water[k-N])?Math.max(water[k+1],water[k-1],water[k+N],water[k-N])+.05:-9);
    }
    h.set(t);
  }

  // ---------------- 4. beach shaping ----------------
  const bt=preset.beach.top;
  for(let k=0;k<h.length;k++){
    const v=h[k];
    if(v>0&&v<bt){const t=v/bt;h[k]=v*(.38+.62*t*t);}
  }
  smoothNear(h,N,-3,bt+1,2);

  // ---------------- 5. terraces on steep ground ----------------
  const T=preset.terrace;
  if(T){
    const src=Float32Array.from(h);
    for(let j=1;j<N-1;j++)for(let i=1;i<N-1;i++){
      const k=j*N+i,v=src[k];
      if(v<T.hMin||water[k]>0) continue;
      const gx=(src[k+1]-src[k-1])/(2*cell),gz=(src[k+N]-src[k-N])/(2*cell),s=Math.hypot(gx,gz);
      const w=T.amount*smooth(T.slopeMin,T.slopeMin+.5,s);
      if(w<=0) continue;
      const q=v/T.step,fl=Math.floor(q),fr=q-fl,sq=fl+smooth(.3,.7,fr);
      h[k]=lerp(v,sq*T.step,w);
    }
  }

  // ---------------- queries ----------------
  const sample=(x,z)=>{
    const fi=clamp((x+half)/cell,0,N-1.0001),fj=clamp((z+half)/cell,0,N-1.0001);
    const i=Math.floor(fi),j=Math.floor(fj),tx=fi-i,tz=fj-j,k=j*N+i;
    return lerp(lerp(h[k],h[k+1],tx),lerp(h[k+N],h[k+N+1],tx),tz);
  };
  const waterAt=(x,z)=>{
    const fi=clamp((x+half)/cell,0,N-1.0001),fj=clamp((z+half)/cell,0,N-1.0001);
    const i=Math.floor(fi),j=Math.floor(fj),tx=fi-i,tz=fj-j,k=j*N+i;
    return Math.max(0,lerp(lerp(water[k],water[k+1],tx),lerp(water[k+N],water[k+N+1],tx),tz));
  };
  const slope=(x,z,e=cell)=>{
    const gx=(sample(x+e,z)-sample(x-e,z))/(2*e),gz=(sample(x,z+e)-sample(x,z-e))/(2*e);
    return Math.hypot(gx,gz);
  };
  const wetAt=(x,z,hh=sample(x,z))=>{
    // closeness to inland water
    const w=waterAt(x,z);
    if(w<=0) return 0;
    return clamp(1-Math.max(0,hh-w)/1.6,0,1);
  };
  // zone painter
  const zones=preset.zones.map(zn=>({...zn,rgb:hex(zn.color),n:zn.noise?makeNoise(`${key}:zone:${zn.noise.seed||0}`):null}));
  const nzS=makeNoise(key+':paint');
  const paint=(x,z,hh,s,wet)=>{
    let c=[...zones[0].rgb];
    for(const zn of zones){
      let wgt=win(hh,zn.h)*win(s,zn.slope)*win(wet,zn.wet);
      if(wgt<=0) continue;
      if(zn.n){const nv=zn.n.fbm(x*zn.noise.scale,z*zn.noise.scale,3)*.5+.5;wgt*=smooth(zn.noise.min-(zn.noise.soft||.1),zn.noise.min,nv)*(1-smooth(zn.noise.max,zn.noise.max+(zn.noise.soft||.1),nv));}
      if(zn.strength!=null) wgt*=zn.strength;
      c[0]=lerp(c[0],zn.rgb[0],wgt);c[1]=lerp(c[1],zn.rgb[1],wgt);c[2]=lerp(c[2],zn.rgb[2],wgt);
    }
    if(preset.strata&&s>preset.strata.slope){
      const k=smooth(preset.strata.slope,preset.strata.slope+.3,s),band=Math.sin(hh*preset.strata.freq+nzS.fbm(x*.02,z*.02,2)*3);
      const m=1+band*preset.strata.amp*k;c[0]*=m;c[1]*=m;c[2]*=m;
    }
    const jn=1+nzS.fbm(x*.09+5,z*.09+5,2)*(preset.jitter??.05);
    c[0]*=jn;c[1]*=jn;c[2]*=jn;
    return c;
  };
  // stats
  let landCells=0,minH=1e9,maxH=-1e9;
  for(let k=0;k<h.length;k++){if(h[k]>SEA_LEVEL)landCells++;if(h[k]<minH)minH=h[k];if(h[k]>maxH)maxH=h[k];}
  const stats={landRatio:landCells/h.length,minH,maxH,lakes:lakes.length,rivers:riverPaths.length,lobes:lobes.length};
  // shoreline spot for cameras: march from origin outward along angle until sea
  const shoreAt=(angle)=>{
    for(let d=0;d<half;d+=cell*.5){
      const x=Math.cos(angle)*d,z=Math.sin(angle)*d;
      if(sample(x,z)<SEA_LEVEL) return {x,z,d};
    }
    return {x:0,z:0,d:0};
  };
  const checksum=()=>{let s=0;for(let k=0;k<h.length;k+=7)s=(s*31+Math.round(h[k]*100))>>>0;return s;};
  return {seed,presetId:id,preset,size,half,grid:N,cell,h,water,lobes,lakes,stats,
    sample,slope,waterAt,wetAt,paint,shoreAt,checksum,
    chunkSize:CHUNK_DEFAULT,flattenHook:null};
}

// ------------- erosion helpers -------------
function hydraulic(h,N,count,r){
  const inertia=.05,capacity=4,minCap=.01,deposit=.3,erode=.3,evap=.02,grav=4,maxLife=34,radius=3;
  // brush weights
  const bo=[],bw=[];let ws=0;
  for(let oj=-radius;oj<=radius;oj++)for(let oi=-radius;oi<=radius;oi++){
    const d=Math.hypot(oi,oj);if(d<=radius){const w=1-d/radius;bo.push([oi,oj]);bw.push(w);ws+=w;}
  }
  for(let i=0;i<bw.length;i++)bw[i]/=ws;
  const heightGrad=(x,y)=>{
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,k=iy*N+ix;
    const a=h[k],b=h[k+1],c=h[k+N],d=h[k+N+1];
    return {gx:(b-a)*(1-fy)+(d-c)*fy,gy:(c-a)*(1-fx)+(d-b)*fx,h:a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy};
  };
  for(let n=0;n<count;n++){
    let x=0,y=0,ok=false;
    for(let t=0;t<6&&!ok;t++){x=r()*(N-3)+1;y=r()*(N-3)+1;ok=h[Math.floor(y)*N+Math.floor(x)]>.5;}
    if(!ok) continue;
    let dx=0,dy=0,speed=1,water=1,sed=0;
    for(let life=0;life<maxLife;life++){
      const ix=Math.floor(x),iy=Math.floor(y);
      if(ix<radius+1||iy<radius+1||ix>=N-radius-2||iy>=N-radius-2) break;
      const g=heightGrad(x,y);
      dx=dx*inertia-g.gx*(1-inertia);dy=dy*inertia-g.gy*(1-inertia);
      const len=Math.hypot(dx,dy);if(len<1e-6) break;
      dx/=len;dy/=len;
      const nx=x+dx,ny=y+dy;
      if(nx<1||ny<1||nx>=N-2||ny>=N-2) break;
      const ng=heightGrad(nx,ny),dh=ng.h-g.h;
      const cap=Math.max(-dh,minCap)*speed*water*capacity;
      if(ng.h<1.4) break; // sediment is lost at the shore (no deposit spits)
      if(sed>cap||dh>0){
        const amt=dh>0?Math.min(dh,sed):(sed-cap)*deposit;
        sed-=amt;
        const fx=x-ix,fy=y-iy,k=iy*N+ix;
        h[k]+=amt*(1-fx)*(1-fy);h[k+1]+=amt*fx*(1-fy);h[k+N]+=amt*(1-fx)*fy;h[k+N+1]+=amt*fx*fy;
      }else{
        const amt=Math.min((cap-sed)*erode,-dh);
        for(let b=0;b<bo.length;b++){
          const k=(iy+bo[b][1])*N+ix+bo[b][0];
          const dv=amt*bw[b];
          const w=h[k]<dv?h[k]:dv; h[k]-=w; sed+=w;
        }
      }
      speed=Math.sqrt(Math.max(0,speed*speed-dh*grav));
      water*=1-evap;x=nx;y=ny;
    }
  }
}
function thermal(h,N,iters,talus){
  const d=new Float32Array(h.length);
  for(let it=0;it<iters;it++){
    d.fill(0);
    for(let j=1;j<N-1;j++)for(let i=1;i<N-1;i++){
      const k=j*N+i,v=h[k];if(v<0) continue;
      for(const o of [1,-1,N,-N]){
        const diff=v-h[k+o];
        if(diff>talus){const m=(diff-talus)*.25;d[k]-=m;d[k+o]+=m;}
      }
    }
    for(let k=0;k<h.length;k++)h[k]+=d[k];
  }
}
function smoothNear(h,N,lo,hi,passes){
  const t=new Float32Array(h.length);
  for(let p=0;p<passes;p++){
    t.set(h);
    for(let j=1;j<N-1;j++)for(let i=1;i<N-1;i++){
      const k=j*N+i,v=h[k];
      if(v<lo||v>hi) continue;
      const a=(h[k-1]+h[k+1]+h[k-N]+h[k+N])*.25;
      t[k]=lerp(v,a,.6);
    }
    h.set(t);
  }
}
