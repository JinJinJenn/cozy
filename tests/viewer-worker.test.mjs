import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../packages/island-gen/index.js';
import { createFlattenHook } from '../packages/settlement/index.js';
import { buildTerrainChunk,buildWaterChunk } from '../packages/island-gen/src/chunks.js';

test('the viewer worker grades the field shared by chunk meshes and client queries', async () => {
  let reply;
  globalThis.self = { postMessage: message => { reply = message; } };
  try {
    await import('../src/gen-worker.js');
    const opts = { grid: 129, droplets: 100 };
    const config = { seed: 'cozy-1', preset: 'harborTown' };
    self.onmessage({ data: { type: 'load', id: 1, ...config, opts } });
    assert.equal(reply.type, 'loaded', reply.message);
    const { h, water, plan, meta } = reply;
    const raw = generate({ ...config, ...opts });
    const graded = createFlattenHook(plan)(raw);
    assert.deepEqual(h, graded);
    assert.deepEqual(water, raw.water);
    // Pick a changed interior vertex on this seed to catch a stale sampler closure.
    const index = h.findIndex((y, k) => Math.abs(y - raw.heightfield[k]) > 0.3);
    assert.ok(index >= 0);
    const x = (index % meta.grid) * meta.cell - meta.half;
    const z = Math.floor(index / meta.grid) * meta.cell - meta.half;
    const cx = Math.floor(x / meta.chunkSize), cz = Math.floor(z / meta.chunkSize);
    const res = Math.round(meta.chunkSize / meta.cell) + 1;
    self.onmessage({ data: { type: 'chunk', id: 2, cx, cz, res, wres: res } });
    assert.equal(reply.type, 'chunk', reply.message);
    const i = Math.round((x - cx * meta.chunkSize) / meta.cell);
    const j = Math.round((z - cz * meta.chunkSize) / meta.cell);
    assert.ok(Math.abs(reply.terrain.positions[(j * res + i) * 3 + 1] - graded[index]) < 1e-4);
    // Compare a complete region against its old, separately submitted tiles.
    // Include inland, coastline and offshore regions. The water fan indices
    // matter as well as the sampled points because they interpolate depth.
    raw.heightfield.set(graded);
    const tile=raw.island.chunkSize,span=meta.chunkSize/tile;
    assert.equal(span,4);
    const tileCells=Math.ceil(tile/meta.cell),waterCells=2*tileCells;
    assert.equal(meta.chunkCells,span*tileCells);
    let sawWet=false,sawDry=false;
    for(const [cx,cz] of [[0,0],[-2,1],[-4,-4],[3,0]]){
      const cells=meta.chunkCells,wres=2*cells+1;
      self.onmessage({data:{type:'chunk',id:3,cx,cz,res:cells+1,wres}});
      assert.equal(reply.type,'chunk',reply.message);
      let waterIndex=0;
      for(let tz=0;tz<span;tz++)for(let tx=0;tx<span;tx++){
        const x=cx*span+tx,z=cz*span+tz;
        const land=buildTerrainChunk(raw.island,x,z,tileCells+1,{skirts:false});
        for(let row=0;row<=tileCells;row++)for(const key of ['positions','normals','colors']){
          const start=((tz*tileCells+row)*(cells+1)+tx*tileCells)*3,offset=row*(tileCells+1)*3;
          assert.deepEqual(reply.terrain[key].subarray(start,start+(tileCells+1)*3),land[key].subarray(offset,offset+(tileCells+1)*3));
        }
        const water=buildWaterChunk(raw.island,x,z,waterCells+1);
        if(!water){sawDry=true;continue;}
        sawWet=true;
        for(const index of water.indices){
          const k=reply.water.indices[waterIndex++];
          assert.equal(reply.water.depth[k],water.depth[index]);
          for(let axis=0;axis<3;axis++)assert.equal(reply.water.positions[k*3+axis],water.positions[index*3+axis]);
        }
      }
      assert.equal(reply.water?.indices.length||0,waterIndex);
      if(reply.water)assert.equal(new Set(reply.water.indices).size,reply.water.depth.length);
    }
    assert.ok(sawWet&&sawDry);
  } finally {
    delete globalThis.self;
  }
});
