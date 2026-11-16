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
  // per-seed rotation of bays and plateaus so silhouettes differ between seeds
  const rotA=rng(key+':rot')()*Math.PI*2,rc=Math.cos(rotA),rs=Math.sin(rotA);
  const rot=o=>({...o,x:o.x*rc-o.z*rs,z:o.x*rs+o.z*rc});
  const bays=(preset.bays||[]).map(rot);
  const plateaus=(preset.plateaus||[]).map(o=>rot(o));
  const knolls=[];
  if(preset.hero){
    const hr=rng(key+':hero'),a=hr()*Math.PI*2;
    knolls.push({x:lobes[0].x+Math.cos(a)*lobes[0].r*preset.hero.dist,z:lobes[0].z+Math.sin(a)*lobes[0].r*preset.hero.dist,r:preset.hero.r,h:preset.hero.h});
  }
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
    for(const l of lobes){
      const dxl=wx-l.x,dzl=wz-l.z,ang=Math.atan2(dzl,dxl);
      const irr=1+(preset.shapeAmp??.22)*nz.noise(Math.cos(ang)*1.7+l.x*.003+5,Math.sin(ang)*1.7+l.z*.003+5);
      m=Math.max(m,1-Math.hypot(dxl,dzl)/(l.r*irr));
    }
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
  if(E.stream&&(opts.stream??true)) streamPower(h,N,cell,E.stream);
  const droplets=opts.droplets??E.droplets;
  if(droplets>0) hydraulic(h,N,droplets,er);
  if(E.thermal>0) thermal(h,N,E.thermal,E.talus*cell*.5);
  if(preset.landRatio){
    // sea level by height quantile: land ratio is a preset knob (shift limited so shapes stay sane)
    const sorted=Float32Array.from(h).sort(),q=sorted[Math.floor((1-preset.landRatio)*(sorted.length-1))];
    const shift=clamp(q,-8,8);
    for(let k=0;k<h.length;k++)h[k]-=shift;
  }

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
  // rivers: drainage network from priority-flood routing; channels where drainage area is large
  let riverMouths=0,riverCells=0;
  const R=preset.rivers;
  if(R&&R.minArea>0){
    const {parent,order,area}=route(h,N,cell);
    const bed=new Float32Array(N*N).fill(1e9);
    for(let o=0;o<order.length;o++){
      const k=order[o],par=parent[k];
      if(h[k]<=SEA_LEVEL+.05||area[k]<R.minArea||water[k]>0) continue;
      const a=area[k]/R.minArea,depth=clamp(R.depth*(.5+.28*Math.log(a+1)),.4,R.depth*3);
      let b=h[k]-depth;
      if(par>=0&&bed[par]<1e8) b=Math.max(b,bed[par]+.012);
      if(b>=h[k]) continue;
      bed[k]=b;riverCells++;
      if(par>=0&&h[par]<=SEA_LEVEL+.05) riverMouths++;
      const wc=clamp(R.width/cell*(.55+.22*Math.sqrt(a)),1.1,R.width/cell*3);
      const ci=k%N,cj=(k/N)|0;
      const pi=par>=0?par%N:ci,pj=par>=0?(par/N)|0:cj,pb=par>=0&&bed[par]<1e8?bed[par]:b;
      // capsule carve: distance to the segment k->parent keeps the channel continuous (no beads)
      const sx=pi-ci,sy=pj-cj,sl=sx*sx+sy*sy||1,rad=Math.ceil(wc+1.5);
      const x0=Math.max(0,Math.min(ci,pi)-rad),x1=Math.min(N-1,Math.max(ci,pi)+rad),y0=Math.max(0,Math.min(cj,pj)-rad),y1=Math.min(N-1,Math.max(cj,pj)+rad);
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const t=clamp(((x-ci)*sx+(y-cj)*sy)/sl,0,1),d=Math.hypot(x-(ci+sx*t),y-(cj+sy*t)),w=smooth(rad,wc*.3,d);
        if(w<=0) continue;
        const bb=lerp(b,pb,t),kk=y*N+x,target=bb-.7+(1-w)*R.depth*1.4;
        if(target<h[kk]) h[kk]=lerp(h[kk],target,Math.min(1,w*1.1));
        if(d<=Math.max(1.3,wc*.85)&&bb>.35) water[kk]=Math.max(water[kk],bb+.5);
      }
    }
  }

  // de-bead rivers: dilate the water ribbon one cell and blur the carved bed so the channel is continuous
  {
    for(let rep=0;rep<1;rep++){
    const w2=Float32Array.from(water);
    for(let j=1;j<N-1;j++)for(let i=1;i<N-1;i++){
      const k=j*N+i;if(water[k]>0) continue;
      let m=0;for(const o of [-1,1,-N,N]) m=Math.max(m,water[k+o]);
      if(m>0&&h[k]<m-.05) w2[k]=m;
    }
    water.set(w2);
    }
    for(let pass=0;pass<2;pass++){
      const t=Float32Array.from(h);
      for(let j=1;j<N-1;j++)for(let i=1;i<N-1;i++){
        const k=j*N+i;if(!(water[k]>0)) continue;
        const a=(h[k-1]+h[k+1]+h[k-N]+h[k+N])*.25;t[k]=Math.min(lerp(h[k],a,.5),water[k]-.35);
      }
      h.set(t);
    }
  }
  // plateaus (flat buildable shelves) and river-bank smoothing
  for(const pl of plateaus){
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

  // coast majority smoothing: removes speckle islets and fuzzy single-cell noise at the waterline
  for(let pass=0;pass<2;pass++){
    const t=Float32Array.from(h);
    for(let j=1;j<N-1;j++)for(let i=1;i<N-1;i++){
      const k=j*N+i,v=h[k];if(v>1.6||v<-1.6) continue;
      let sea=0;
      for(const o of [-N-1,-N,-N+1,-1,1,N-1,N,N+1]) if(h[k+o]<=0) sea++;
      if(v>0&&sea>=6) t[k]=-.25;
      else if(v<=0&&sea<=2&&water[k]<=0) t[k]=.25;
    }
    h.set(t);
  }
  // sea stacks: small rock spires standing in the shallows just off the coast
  const stacks=[];
  if(preset.stacks){
    const sr=rng(key+':stacks'),S=preset.stacks;let tries=0;
    while(stacks.length<S.count&&tries++<3000){
      const x=(sr()*2-1)*half*.8,z=(sr()*2-1)*half*.8,fi=Math.round((x+half)/cell),fj=Math.round((z+half)/cell),v=h[fj*N+fi];
      if(v>-1.2||v<-5) continue;
      let coast=false;
      for(let a=0;a<8&&!coast;a++){const px=Math.round(fi+Math.cos(a*.785)*14),pz=Math.round(fj+Math.sin(a*.785)*14);if(px>0&&pz>0&&px<N&&pz<N&&h[pz*N+px]>0.3) coast=true;}
      if(!coast||stacks.some(o=>Math.hypot(o.x-x,o.z-z)<60)) continue;
      stacks.push({x,z,r:S.r[0]+sr()*(S.r[1]-S.r[0]),h:S.h[0]+sr()*(S.h[1]-S.h[0])});
    }
    for(const st of stacks){
      const rad=Math.ceil(st.r*2.2/cell);
      const ci=Math.round((st.x+half)/cell),cj=Math.round((st.z+half)/cell);
      for(let y=cj-rad;y<=cj+rad;y++)for(let x=ci-rad;x<=ci+rad;x++){
        if(x<0||y<0||x>=N||y>=N) continue;
        const d=Math.hypot(-half+x*cell-st.x,-half+y*cell-st.z)/st.r;
        if(d<2.2) h[y*N+x]+=st.h*Math.exp(-d*d*1.6);
      }
    }
  }

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
  const stats={landRatio:landCells/h.length,minH,maxH,lakes:lakes.length,rivers:riverMouths,riverCells,stacks:stacks.length,lobes:lobes.length};
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

// ------------- drainage routing + stream power -------------
// Priority-flood from the sea: pop order = every cell's receiver comes before it,
// parent = the cell it drained into. Depressions are filled so every cell reaches the sea.
function route(h,N,cell){
  const n=N*N,parent=new Int32Array(n).fill(-1),order=new Int32Array(n),state=new Uint8Array(n),fill=new Float32Array(n);
  // binary heap
  const hk=new Float32Array(n+8),hi=new Int32Array(n+8);let hs=0;
  const push=(k,key)=>{let i=hs++;while(i>0){const p=(i-1)>>1;if(hk[p]<=key)break;hk[i]=hk[p];hi[i]=hi[p];i=p;}hk[i]=key;hi[i]=k;};
  const pop=()=>{const k=hi[0],last=hs-1;const key=hk[last],lk=hi[last];hs--;let i=0;while(true){let c=i*2+1;if(c>=hs)break;if(c+1<hs&&hk[c+1]<hk[c])c++;if(hk[c]>=key)break;hk[i]=hk[c];hi[i]=hi[c];i=c;}if(hs>0){hk[i]=key;hi[i]=lk;}return k;};
  const nb=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.4142],[1,-1,1.4142],[-1,1,1.4142],[-1,-1,1.4142]];
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const k=j*N+i;
    if(h[k]>SEA_LEVEL+.05) continue;
    let coast=false;
    for(const [dx,dy] of nb){const x=i+dx,y=j+dy;if(x>=0&&y>=0&&x<N&&y<N&&h[y*N+x]>SEA_LEVEL+.05){coast=true;break;}}
    state[k]=1;fill[k]=h[k];
    if(coast) push(k,h[k]);
  }
  let o=0;
  while(hs>0){
    const k=pop();order[o++]=k;
    const i=k%N,j=(k/N)|0;
    for(const [dx,dy] of nb){
      const x=i+dx,y=j+dy;if(x<0||y<0||x>=N||y>=N) continue;
      const q=y*N+x;if(state[q]) continue;
      state[q]=1;parent[q]=k;
      fill[q]=Math.max(h[q],fill[k]+1e-4);
      push(q,fill[q]);
    }
  }
  const area=new Float32Array(n).fill(1);
  for(let t=o-1;t>=0;t--){const k=order[t],p=parent[k];if(p>=0)area[p]+=area[k];}
  return {parent,order:order.subarray(0,o),area,filled:fill};
}
function streamPower(h,N,cell,P){
  const nb=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let it=0;it<P.iters;it++){
    const {parent,order,area}=route(h,N,cell);
    for(let t=0;t<order.length;t++){
      const k=order[t],p=parent[k];
      if(p<0||h[k]<=SEA_LEVEL+.05) continue;
      const di=Math.abs((k%N)-(p%N)),dj=Math.abs(((k/N)|0)-((p/N)|0)),dist=(di+dj>1)?1.4142:1;
      const f=P.K*Math.pow(area[k],P.m)/dist;
      const nh=(h[k]+P.uplift+f*h[p])/(1+f);
      h[k]=Math.max(nh,SEA_LEVEL+.02);
    }
    // hillslope diffusion on land
    if(P.diff>0){
      const t=Float32Array.from(h);
      for(let j=1;j<N-1;j++)for(let i=1;i<N-1;i++){
        const k=j*N+i;if(h[k]<=SEA_LEVEL+.5) continue;
        const a=(h[k-1]+h[k+1]+h[k-N]+h[k+N])*.25;t[k]=lerp(h[k],a,P.diff*(1+2.2*(1-clamp(h[k]/12,0,1))));
      }
      h.set(t);
    }
  }
}
