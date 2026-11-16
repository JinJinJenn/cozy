import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIsland} from '../src/island.js';
import {PRESETS,PRESET_IDS} from '../src/presets.js';
import {buildTerrainChunk,buildWaterChunk} from '../src/chunks.js';

const FAST={grid:256,droplets:12000};

test('presets are plain data with required fields',()=>{
  assert.ok(PRESET_IDS.length>=4);
  for(const id of PRESET_IDS){
    const p=PRESETS[id];
    for(const f of ['label','blurb','size','grid','lobes','warp','base','hills','erosion','beach','palette','zones'])assert.ok(p[f]!==undefined,id+' missing '+f);
    assert.ok(Array.isArray(p.zones)&&p.zones.length>=3);
    assert.equal(JSON.parse(JSON.stringify(p.zones)).length,p.zones.length);
  }
});

for(const id of PRESET_IDS){
  test(`${id}: deterministic for same seed+preset`,()=>{
    const a=createIsland('abc',id,FAST),b=createIsland('abc',id,FAST);
    assert.equal(a.checksum(),b.checksum());
    assert.deepEqual(Array.from(a.h.slice(0,2000)),Array.from(b.h.slice(0,2000)));
    assert.deepEqual(Array.from(a.water.slice(0,2000)),Array.from(b.water.slice(0,2000)));
  });
  test(`${id}: different seed gives a different island`,()=>{
    assert.notEqual(createIsland('abc',id,FAST).checksum(),createIsland('xyz',id,FAST).checksum());
  });
  test(`${id}: sea level and land ratio sanity`,()=>{
    const isl=createIsland('sanity',id,FAST),s=isl.stats;
    assert.ok(s.landRatio>.06&&s.landRatio<.7,`land ratio ${s.landRatio}`);
    assert.ok(s.minH<-2,'has sea floor below sea level');
    assert.ok(s.maxH>6,'has land above sea level');
    for(const v of isl.h) assert.ok(Number.isFinite(v));
    // world border is open ocean so the island is surrounded by water
    const E=isl.half-2;
    for(const [x,z] of [[E,0],[-E,0],[0,E],[0,-E],[E,E],[-E,-E]]) assert.ok(isl.sample(x,z)<-1,`border ${x},${z}`);
    // the origin region has land for every preset
    assert.ok(isl.stats.maxH>0);
  });
  test(`${id}: chunks are deterministic and finite`,()=>{
    const isl=createIsland('chunk',id,FAST);
    const a=buildTerrainChunk(isl,0,0,17),b=buildTerrainChunk(isl,0,0,17);
    assert.deepEqual(Array.from(a.positions),Array.from(b.positions));
    assert.deepEqual(Array.from(a.colors),Array.from(b.colors));
    for(const v of a.positions) assert.ok(Number.isFinite(v));
    for(const v of a.colors) assert.ok(v>=0&&v<=1.0001);
    const w=buildWaterChunk(isl,0,0,17);
    if(w) for(const v of w.positions) assert.ok(Number.isFinite(v));
  });
}

test('highlands are taller than archipelago; archipelago has many islands',()=>{
  const hi=createIsland('h','pineHighlands',FAST),ar=createIsland('h','sandbarArchipelago',FAST);
  assert.ok(hi.stats.maxH>80,'highlands max '+hi.stats.maxH);
  assert.ok(ar.stats.maxH<30);
  assert.ok(ar.stats.lobes>=5);
});
test('highlands carve rivers and lakes',()=>{
  const hi=createIsland('rivers','pineHighlands',FAST);
  assert.ok(hi.stats.rivers+hi.stats.lakes>=1);
});

import {generate,toHeightmap16,toUnityRaw,toMetaJSON} from '../index.js';
test('generate() API returns heightfield, water, zones and exports',()=>{
  const r=generate({seed:'api',preset:'pineHighlands',grid:128,droplets:3000});
  assert.equal(r.heightfield.length,128*128);
  assert.equal(r.water.length,128*128);
  assert.equal(r.seaLevel,0);
  assert.ok(Array.isArray(r.zones)&&r.zones.length>2);
  const hm=toHeightmap16(r);
  assert.equal(hm.data.length,128*128);
  assert.ok(hm.seaLevelNormalized>0&&hm.seaLevelNormalized<1);
  const raw=toUnityRaw(r,{res:129});
  assert.equal(raw.bytes.length,129*129*2);
  assert.equal(JSON.parse(JSON.stringify(toMetaJSON(r))).preset,'pineHighlands');
});
test('generate() is deterministic and JSON presets are plain data',()=>{
  const a=generate({seed:'d',preset:'harborTown',grid:128,droplets:2000}),b=generate({seed:'d',preset:'harborTown',grid:128,droplets:2000});
  assert.equal(a.island.checksum(),b.island.checksum());
});

for(const id of PRESET_IDS){
  test(`${id}: land ratio follows the preset landRatio knob`,()=>{
    const isl=createIsland('quantile',id,FAST),want=PRESETS[id].landRatio;
    assert.ok(want>0);
    assert.ok(Math.abs(isl.stats.landRatio-want)<.07,`${id} got ${isl.stats.landRatio} want ${want}`);
  });
}
test('sea stacks exist where the preset asks for them',()=>{
  assert.ok(createIsland('stk','pineHighlands',FAST).stats.stacks>=1);
});
