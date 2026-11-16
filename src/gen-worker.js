// Module worker: generates the island and builds chunk/minimap data off the main thread.
import {createIsland} from '../packages/island-gen/src/island.js';
import {buildTerrainChunk,buildWaterChunk} from '../packages/island-gen/src/chunks.js';
import {renderMinimapPixels} from './minimap.js';
let island=null;
self.onmessage=e=>{
  const m=e.data;
  try{
    if(m.type==='load'){
      const t=performance.now();
      island=createIsland(m.seed,m.preset,m.opts||{});
      const h=island.h.slice(),w=island.water.slice();
      self.postMessage({type:'loaded',id:m.id,ms:performance.now()-t,
        meta:{seed:island.seed,presetId:island.presetId,preset:island.preset,size:island.size,half:island.half,grid:island.grid,cell:island.cell,stats:island.stats,chunkSize:island.chunkSize,checksum:island.checksum()},
        h,water:w},[h.buffer,w.buffer]);
    }else if(m.type==='chunk'){
      const t=buildTerrainChunk(island,m.cx,m.cz,m.res),wd=buildWaterChunk(island,m.cx,m.cz,m.wres);
      const tr=[t.positions.buffer,t.colors.buffer,t.indices.buffer];
      if(wd) tr.push(wd.positions.buffer,wd.depth.buffer,wd.indices.buffer);
      self.postMessage({type:'chunk',id:m.id,terrain:t,water:wd},tr);
    }else if(m.type==='minimap'){
      const px=renderMinimapPixels(island,m.w,m.h);
      self.postMessage({type:'minimap',id:m.id,px},[px.buffer]);
    }
  }catch(err){self.postMessage({type:'error',id:m.id,message:String(err&&err.stack||err)});}
};
