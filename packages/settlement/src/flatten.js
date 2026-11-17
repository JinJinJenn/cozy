// Grades road beds and plot pads into a COPY of the heightfield. Never mutates the input; sea and water cells are left alone.
import {pointInPoly,distSeg} from './geom.js';
const ss=t=>{t=t<0?0:t>1?1:t;return t*t*(3-2*t);};
export function flattenHeightfield(island,plan,{shoulder=7,smoothWin=24,pads=true,roads=true}={}){
  const N=island.grid,cell=island.cell,half=island.size/2,sea=island.seaLevel||0,src=island.heightfield||island.h,w=island.water;
  const out=new Float32Array(src);const n=N*N;
  const protect=k=>src[k]<sea+0.3||(w&&w[k]>0.02);
  const bil=(x,z)=>{const fi=Math.min(N-1.0001,Math.max(0,(x+half)/cell)),fj=Math.min(N-1.0001,Math.max(0,(z+half)/cell));const i=Math.floor(fi),j=Math.floor(fj),tx=fi-i,tz=fj-j,k=j*N+i;
    return (src[k]*(1-tx)+src[k+1]*tx)*(1-tz)+(src[k+N]*(1-tx)+src[k+N+1]*tx)*tz;};
  const apply=(bestD,bestT,reach)=>{for(let k=0;k<n;k++){if(bestD[k]>=reach||protect(k))continue;const wt=ss(1-bestD[k]/reach);out[k]=out[k]*(1-wt)+bestT[k]*wt;}};
  if(roads){
    const bestD=new Float32Array(n).fill(1e9),bestT=new Float32Array(n);
    for(const r of plan.roads){if(r.bridge)continue;
      // dense profile every 2 m, smoothed by a moving average so cuts and fills stay gentle
      const dp=[];for(let i=0;i<r.pts.length-1;i++){const a=r.pts[i],b=r.pts[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),m=Math.max(1,Math.ceil(L/2));for(let t=0;t<m;t++)dp.push([a[0]+(b[0]-a[0])*t/m,a[1]+(b[1]-a[1])*t/m]);}
      dp.push(r.pts[r.pts.length-1]);const hh=dp.map(p=>bil(p[0],p[1])),W=Math.round(smoothWin/2),sm=hh.map((_,i)=>{let s=0,c=0;for(let q=Math.max(0,i-W);q<=Math.min(hh.length-1,i+W);q++){s+=hh[q];c++;}return s/c;});
      const hw=r.width/2;
      for(let i=0;i<dp.length-1;i++){const a=dp[i],b=dp[i+1],ra=hw+shoulder;
        const ia=Math.max(0,Math.floor((Math.min(a[0],b[0])-ra+half)/cell)),ib=Math.min(N-1,Math.ceil((Math.max(a[0],b[0])+ra+half)/cell)),ja=Math.max(0,Math.floor((Math.min(a[1],b[1])-ra+half)/cell)),jb=Math.min(N-1,Math.ceil((Math.max(a[1],b[1])+ra+half)/cell));
        for(let j=ja;j<=jb;j++)for(let ii=ia;ii<=ib;ii++){const k=j*N+ii,d=distSeg(-half+ii*cell,-half+j*cell,a[0],a[1],b[0],b[1]);const e=Math.max(0,d.d-hw);
          if(e<bestD[k]){bestD[k]=e;bestT[k]=sm[i]+(sm[i+1]-sm[i])*d.t;}}}}
    apply(bestD,bestT,shoulder);
  }
  if(pads){
    const bestD=new Float32Array(n).fill(1e9),bestT=new Float32Array(n),ra=shoulder-2;
    const civicPads=[plan.civic?.square,plan.civic?.hall].filter(Boolean).map(b=>{
      const c=Math.cos(b.yaw),s=Math.sin(b.yaw),r=b.half;
      return {buildable:true,poly:[[-r,-r],[r,-r],[r,r],[-r,r]].map(([x,z])=>[b.x+c*x+s*z,b.z-s*x+c*z])};
    });
    for(const l of [...plan.lots,...civicPads]){if(!l.buildable||l.use==='square'||l.use==='hall')continue;const p=l.poly;let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const v of p){x0=Math.min(x0,v[0]);x1=Math.max(x1,v[0]);z0=Math.min(z0,v[1]);z1=Math.max(z1,v[1]);}
      // pad height: mean of the ORIGINAL terrain inside the plot
      let s=0,c=0;for(let z=z0;z<=z1;z+=2)for(let x=x0;x<=x1;x+=2)if(pointInPoly(x,z,p)){s+=bil(x,z);c++;}if(!c)continue;const target=s/c;
      const ia=Math.max(0,Math.floor((x0-ra+half)/cell)),ib=Math.min(N-1,Math.ceil((x1+ra+half)/cell)),ja=Math.max(0,Math.floor((z0-ra+half)/cell)),jb=Math.min(N-1,Math.ceil((z1+ra+half)/cell));
      for(let j=ja;j<=jb;j++)for(let i=ia;i<=ib;i++){const k=j*N+i,x=-half+i*cell,z=-half+j*cell;let d;
        if(pointInPoly(x,z,p))d=0;else{d=1e9;for(let q=0;q<p.length;q++){const a=p[q],b=p[(q+1)%p.length];const e=distSeg(x,z,a[0],a[1],b[0],b[1]).d;if(e<d)d=e;}}
        if(d<bestD[k]){bestD[k]=d;bestT[k]=target;}}}
    apply(bestD,bestT,ra);
  }
  return out;
}
// island-gen flatten hook shape: hook(result) -> graded heightfield copy. Assign it to result.flattenHook.
export function createFlattenHook(plan,opts){return island=>flattenHeightfield(island,plan,opts);}
