import {clamp} from './rng.js';

// The viewer always uses matching tile resolutions. Other callers can retain
// skirts when mixing resolutions. Sample the graded heightfield across tile
// boundaries so both tiles use the same lighting normal at the shared vertex.
const SKIRT=7;

export function buildTerrainChunk(island,cx,cz,res=33,{skirts=true}={}){
  const S=island.chunkSize,x0=cx*S,z0=cz*S,step=S/(res-1);
  const core=res*res,total=core+(skirts?4*res:0);
  const positions=new Float32Array(total*3),colors=new Float32Array(total*3);
  const normals=new Int16Array(total*3);
  const e=island.cell;
  for(let j=0;j<res;j++)for(let i=0;i<res;i++){
    const x=x0+i*step,z=z0+j*step,hh=island.sample(x,z),k=(j*res+i)*3;
    positions[k]=x;positions[k+1]=hh;positions[k+2]=z;
    const gx=(island.sample(x+e,z)-island.sample(x-e,z))/(2*e);
    const gz=(island.sample(x,z+e)-island.sample(x,z-e))/(2*e);
    const scale=32767/Math.hypot(gx,1,gz);
    normals[k]=Math.round(-gx*scale);
    normals[k+1]=Math.round(scale);
    normals[k+2]=Math.round(-gz*scale);
    const color=island.paint(x,z,hh,Math.hypot(gx,gz),island.wetAt(x,z,hh));
    for(let channel=0;channel<3;channel++)colors[k+channel]=clamp(color[channel],0,1);
  }
  const idx=[];
  for(let j=0;j<res-1;j++)for(let i=0;i<res-1;i++){
    const a=j*res+i,b=a+1,c=a+res,d=c+1;
    idx.push(a,c,b,b,c,d);
  }
  if(skirts){
    const sides=[
      i=>i, i=>(res-1)*res+i, j=>j*res, j=>j*res+res-1
    ];
    let next=core;
    for(const at of sides){
      for(let t=0;t<res;t++,next++){
        const a=at(t),k=a*3,o=next*3;
        positions.set(positions.subarray(k,k+3),o);
        positions[o+1]-=SKIRT;
        colors.set(colors.subarray(k,k+3),o);
        normals.set(normals.subarray(k,k+3),o);
        if(t+1<res){
          const b=at(t+1);
          idx.push(a,b,next,b,next+1,next,a,next,b,b,next,next+1);
        }
      }
    }
  }
  const IndexArray=total<=65536?Uint16Array:Uint32Array;
  return {cx,cz,res,positions,normals,colors,indices:IndexArray.from(idx)};
}

// Water surface chunk. Returns null when the chunk holds no water at all.
export function buildWaterChunk(island,cx,cz,res=49,{patchCells=res-1}={}){
  if(res<2)return null;
  if(!Number.isInteger(patchCells)||patchCells<1)throw new RangeError('Water patches must span at least one cell');
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
  function emitPatch(x0,z0,x1,z1){
    const width=x1-x0,height=z1-z0;
    if(width>3&&height>3){
      // Every source sample must be open sea. Keep the entire perimeter so
      // adjacent patches interpolate exactly the same depths at their seam.
      let minimum=Infinity,maximum=-Infinity;
      let offshore=true;
      for(let z=z0;offshore&&z<=z1;z++)for(let x=x0;x<=x1;x++){
        const v=z*res+x;
        if(positions[v*3+1]!==0||depth[v]<1.5){offshore=false;break;}
        minimum=Math.min(minimum,depth[v]);
        maximum=Math.max(maximum,depth[v]);
      }
      const midX=(x0+x1)>>1,midZ=(z0+z1)>>1;
      if(offshore && maximum-minimum<=minimum*.06){
        const center=midZ*res+midX;
        for(let x=x0;x<x1;x++){
          idx.push(center,z0*res+x+1,z0*res+x,center,z1*res+x,z1*res+x+1);
        }
        for(let z=z0;z<z1;z++){
          idx.push(center,z*res+x0,(z+1)*res+x0,center,(z+1)*res+x1,z*res+x1);
        }
        return;
      }
      emitPatch(x0,z0,midX,midZ);emitPatch(midX,z0,x1,midZ);
      emitPatch(x0,midZ,midX,z1);emitPatch(midX,midZ,x1,z1);
      return;
    }
    for(let z=z0;z<z1;z++)for(let x=x0;x<x1;x++){
      const a=z*res+x,b=a+1,c=a+res,d=c+1;
      if(depth[a]<-.4&&depth[b]<-.4&&depth[c]<-.4&&depth[d]<-.4)continue;
      idx.push(a,c,b,b,c,d);
    }
  }
  // Keep the original offshore fans when several water tiles share a draw.
  // A wholly dry subtile can still border shallow water in the same mesh.
  for(let z=0;z<res-1;z+=patchCells)for(let x=0;x<res-1;x+=patchCells){
    const x1=Math.min(x+patchCells,res-1),z1=Math.min(z+patchCells,res-1);
    let wet=patchCells>=res-1;
    for(let j=z;!wet&&j<=z1;j++)for(let i=x;i<=x1;i++)if(depth[j*res+i]>-.15){wet=true;break;}
    if(wet)emitPatch(x,z,x1,z1);
  }
  if(!idx.length) return null;
  const IndexArray=res*res<=65536?Uint16Array:Uint32Array;
  return {cx,cz,res,positions,depth,indices:IndexArray.from(idx)};
}
