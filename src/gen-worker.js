// Module worker: generates the island and builds chunk/minimap data off the main thread.
import {generate} from '../packages/island-gen/index.js';
import {generateSettlement,createFlattenHook} from '../packages/settlement/index.js';
import {buildTerrainChunk,buildWaterChunk} from '../packages/island-gen/src/chunks.js';
import {renderMinimapPixels} from './minimap.js';
let island=null,tilesPerSide=1;
// Keep grid indexing inside the water builder. The renderer only needs the
// vertices referenced by an actual water triangle, especially along rivers.
function packWater(mesh){
  if(!mesh)return null;
  const {indices,depth,positions}=mesh,remap=new Uint32Array(depth.length);
  for(const index of indices)remap[index]=1;
  let count=0;
  for(const used of remap)count+=used;
  if(count===depth.length)return mesh;
  const packedDepth=new Float32Array(count),packedPositions=new Float32Array(count*3);
  let dest=0;
  for(let i=0;i<depth.length;i++)if(remap[i]){
    remap[i]=dest;packedDepth[dest]=depth[i];
    for(let axis=0;axis<3;axis++)packedPositions[dest*3+axis]=positions[i*3+axis];
    dest++;
  }
  for(let i=0;i<indices.length;i++)indices[i]=remap[indices[i]];
  return {...mesh,depth:packedDepth,positions:packedPositions};
}
self.onmessage=e=>{
  const m=e.data;
  try{
    if(m.type==='load'){
      const t=performance.now();
      const result=generate({...m.opts,seed:m.seed,preset:m.preset});
      const plan=generateSettlement(result);
      const source=result.island;
      // The generated data and its sampler closures retain their original grid.
      // Group complete 64 m tiles so every outer edge lands on the island boundary.
      tilesPerSide=[4,2].find(n=>source.half%(source.chunkSize*n)===0)??1;
      island={...source,chunkSize:source.chunkSize*tilesPerSide};
      // Chunks and query closures both read this array. Keep its identity when grading.
      result.heightfield.set(createFlattenHook(plan)(result));
      const h=island.h.slice(),w=island.water.slice();
      self.postMessage({type:'loaded',id:m.id,ms:performance.now()-t,
        meta:{seed:island.seed,presetId:island.presetId,preset:island.preset,size:island.size,half:island.half,grid:island.grid,cell:island.cell,stats:island.stats,chunkSize:island.chunkSize,chunkCells:tilesPerSide*Math.ceil(source.chunkSize/source.cell),checksum:island.checksum()},
        h,water:w,plan},[h.buffer,w.buffer]);
    }else if(m.type==='chunk'){
      const t=buildTerrainChunk(island,m.cx,m.cz,m.res,{skirts:false});
      const wd=packWater(buildWaterChunk(island,m.cx,m.cz,m.wres,{patchCells:Math.max(1,Math.ceil((m.wres-1)/tilesPerSide))}));
      const tr=[t.positions.buffer,t.normals.buffer,t.colors.buffer,t.indices.buffer];
      if(wd) tr.push(wd.positions.buffer,wd.depth.buffer,wd.indices.buffer);
      self.postMessage({type:'chunk',id:m.id,terrain:t,water:wd},tr);
    }else if(m.type==='minimap'){
      const px=renderMinimapPixels(island,m.w,m.h);
      self.postMessage({type:'minimap',id:m.id,px},[px.buffer]);
    }
  }catch(err){self.postMessage({type:'error',id:m.id,message:String(err&&err.stack||err)});}
};
