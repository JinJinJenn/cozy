import {clamp,lerp,smooth} from './rng.js';

// Pure chunk geometry builders (typed arrays only). Chunk (cx,cz) covers
// [cx*S,(cx+1)*S] x [cz*S,(cz+1)*S] in world metres; S = island.chunkSize.
// Terrain gets baked light + shadow + cavity shade in vertex colours for the
// flat pastel toon look (rendered with an unlit material).

const SUN=(()=>{const v=[-.45,.72,.5],l=Math.hypot(...v);return v.map(a=>a/l);})();
const SKIRT=7;

function shadowAt(island,x,y,z){
  // march toward the sun over the heightfield; 1 = fully shadowed
  const hx=SUN[0],hz=SUN[2],hl=Math.hypot(hx,hz),sy=SUN[1];
  let occ=0;
  for(let i=1;i<=34;i++){
    const d=i*8,px=x+hx/hl*d,pz=z+hz/hl*d,ry=y+d*sy/hl;
    const t=island.sample(px,pz);
    if(t>ry){occ=Math.max(occ,clamp((t-ry)/14,0,1));if(occ>=1)break;}
  }
  return occ;
}

export function buildTerrainChunk(island,cx,cz,res=33){
  const S=island.chunkSize,x0=cx*S,z0=cz*S,step=S/(res-1);
  const core=res*res,skirtCount=4*res,total=core+skirtCount;
  const positions=new Float32Array(total*3),colors=new Float32Array(total*3);
  const e=Math.max(island.cell,step);
  for(let j=0;j<res;j++)for(let i=0;i<res;i++){
    const x=x0+i*step,z=z0+j*step,hh=island.sample(x,z),k=(j*res+i)*3;
    positions[k]=x;positions[k+1]=hh;positions[k+2]=z;
    const gx=(island.sample(x+e,z)-island.sample(x-e,z))/(2*e),gz=(island.sample(x,z+e)-island.sample(x,z-e))/(2*e);
    const s=Math.hypot(gx,gz),wet=island.wetAt(x,z,hh);
    const c=island.paint(x,z,hh,s,wet);
    const nl=Math.hypot(gx,1,gz),lam=Math.max(0,(-gx*SUN[0]+SUN[1]-gz*SUN[2])/nl);
    let light=.6+.52*lam;
    const sh=hh>-.5?shadowAt(island,x,hh+.6,z):0;
    light*=1-.3*sh;
    const avg=(island.sample(x+11,z)+island.sample(x-11,z)+island.sample(x,z+11)+island.sample(x,z-11))*.25;
    light*=1-clamp((avg-hh)*.035,0,.22);          // cavity darkening
    light*=1+clamp((hh-avg)*.012,0,.08);           // ridge lift
    const q=Math.floor(light*5+.5)/5;light=lerp(light,q,.22); // soft toon banding
    const cool=sh*.5;
    colors[k]=clamp(c[0]*light*(1-cool*.1),0,1);
    colors[k+1]=clamp(c[1]*light*(1-cool*.04),0,1);
    colors[k+2]=clamp(c[2]*light*(1+cool*.1),0,1);
  }
  // skirts hide LOD cracks between chunks of different resolution
  let sk=core;
  const edge=[];
  for(let i=0;i<res;i++)edge.push(i);                       // top (j=0)
  for(let i=0;i<res;i++)edge.push((res-1)*res+i);           // bottom
  for(let j=0;j<res;j++)edge.push(j*res);                   // left
  for(let j=0;j<res;j++)edge.push(j*res+res-1);             // right
  const skirtOf=new Map();
  for(const v of edge){
    const k=v*3,o=sk*3;
    positions[o]=positions[k];positions[o+1]=positions[k+1]-SKIRT;positions[o+2]=positions[k+2];
    colors[o]=colors[k]*.9;colors[o+1]=colors[k+1]*.9;colors[o+2]=colors[k+2]*.9;
    skirtOf.set(v+':'+(sk),sk);sk++;
  }
  const idx=[];
  for(let j=0;j<res-1;j++)for(let i=0;i<res-1;i++){
    const a=j*res+i,b=a+1,c=a+res,d=c+1;
    idx.push(a,c,b,b,c,d);
  }
  // skirt quads
  const sides=[
    {start:core,           list:Array.from({length:res},(_,i)=>i),                    flip:false},
    {start:core+res,       list:Array.from({length:res},(_,i)=>(res-1)*res+i),        flip:true},
    {start:core+2*res,     list:Array.from({length:res},(_,j)=>j*res),                flip:true},
    {start:core+3*res,     list:Array.from({length:res},(_,j)=>j*res+res-1),          flip:false},
  ];
  for(const sd of sides){
    for(let t=0;t<res-1;t++){
      const a=sd.list[t],b=sd.list[t+1],sa=sd.start+t,sb=sd.start+t+1;
      // double sided via both windings keeps it simple
      idx.push(a,b,sa,b,sb,sa,a,sa,b,b,sa,sb);
    }
  }
  return {cx,cz,res,positions,colors,indices:Uint32Array.from(idx)};
}

// Water surface chunk. Returns null when the chunk holds no water at all.
export function buildWaterChunk(island,cx,cz,res=49){
  const S=island.chunkSize,x0=cx*S,z0=cz*S,step=S/(res-1);
  const positions=new Float32Array(res*res*3),depth=new Float32Array(res*res);
  let any=false;
  for(let j=0;j<res;j++)for(let i=0;i<res;i++){
    const x=x0+i*step,z=z0+j*step,hh=island.sample(x,z),lv=island.waterAt(x,z),k=j*res+i;
    positions[k*3]=x;positions[k*3+1]=lv;positions[k*3+2]=z;
    depth[k]=lv-hh;
    if(depth[k]>-.15) any=true;
  }
  if(!any) return null;
  const idx=[];
  for(let j=0;j<res-1;j++)for(let i=0;i<res-1;i++){
    const a=j*res+i,b=a+1,c=a+res,d=c+1;
    // skip fully dry quads
    if(depth[a]<-.4&&depth[b]<-.4&&depth[c]<-.4&&depth[d]<-.4) continue;
    idx.push(a,c,b,b,c,d);
  }
  if(!idx.length) return null;
  return {cx,cz,res,positions,depth,indices:Uint32Array.from(idx)};
}
