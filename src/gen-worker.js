// Module worker: generates the island and builds chunk/minimap data off the main thread.
import {generate} from '../packages/island-gen/index.js';
import {generateSettlement,createFlattenHook} from '../packages/settlement/index.js';
import {buildTerrainChunk,buildWaterChunk} from '../packages/island-gen/src/chunks.js';
import {renderMinimapPixels} from './minimap.js';
let island=null;
self.onmessage=e=>{
  const m=e.data;
  try{
    if(m.type==='load'){
      const t=performance.now();
      const result=generate({...m.opts,seed:m.seed,preset:m.preset});
      const plan=generateSettlement(result);
      island=result.island;
      // Chunks and query closures both read this array. Keep its identity when grading.
      result.heightfield.set(createFlattenHook(plan)(result));
      const h=island.h.slice(),w=island.water.slice();
      self.postMessage({type:'loaded',id:m.id,ms:performance.now()-t,
        meta:{seed:island.seed,presetId:island.presetId,preset:island.preset,size:island.size,half:island.half,grid:island.grid,cell:island.cell,stats:island.stats,chunkSize:island.chunkSize,checksum:island.checksum()},
        h,water:w,plan},[h.buffer,w.buffer]);
    }else if(m.type==='chunk'){
      const t=buildTerrainChunk(island,m.cx,m.cz,m.res,{skirts:false}),wd=buildWaterChunk(island,m.cx,m.cz,m.wres);
      const tr=[t.positions.buffer,t.normals.buffer,t.colors.buffer,t.indices.buffer];
      if(wd) tr.push(wd.positions.buffer,wd.depth.buffer,wd.indices.buffer);
      self.postMessage({type:'chunk',id:m.id,terrain:t,water:wd},tr);
    }else if(m.type==='minimap'){
      const px=renderMinimapPixels(island,m.w,m.h);
      self.postMessage({type:'minimap',id:m.id,px},[px.buffer]);
    }
  }catch(err){self.postMessage({type:'error',id:m.id,message:String(err&&err.stack||err)});}
};
