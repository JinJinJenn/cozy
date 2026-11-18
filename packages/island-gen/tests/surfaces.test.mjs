import assert from 'node:assert/strict';
import test from 'node:test';
import {buildTerrainChunk,buildWaterChunk} from '../src/chunks.js';

test('neighboring graded tiles share surface normals and albedo along their seam',()=>{
  const island={chunkSize:64,cell:2,sample:(x,z)=>3+.12*x+.31*z+.001*x*z,
    paint:()=>[.5,.25,.125],wetAt:()=>0};
  const res=17,west=buildTerrainChunk(island,-1,0,res,{skirts:false}),east=buildTerrainChunk(island,0,0,res,{skirts:false});
  const triple=(arr,i)=>Array.from(arr.subarray(i*3,i*3+3));
  for(let row=0;row<res;row++){
    const a=(row+1)*res-1,b=row*res;
    assert.deepEqual(triple(west.positions,a),triple(east.positions,b));
    const normal=triple(east.normals,b).map(n=>n/32767);
    assert.deepEqual(triple(west.normals,a),triple(east.normals,b));
    assert.ok(Math.abs(Math.hypot(...normal)-1)<.00004);
    assert.ok(Math.abs(-normal[0]/normal[1]-(.12+.001*row*4))<.00004);
    assert.ok(Math.abs(-normal[2]/normal[1]-.31)<.00004);
    assert.deepEqual(triple(east.colors,b),[.5,.25,.125]);
  }
  assert.equal(east.indices.length,6*(res-1)**2);
});

test('open sea covers the tile once and keeps boundary samples while shores retain their grid',()=>{
  const res=17,base={chunkSize:64,waterAt:()=>0,sample:()=>-10};
  const sea=buildWaterChunk(base,0,0,res);
  const used=new Set(sea.indices);
  assert.equal(sea.indices.length/3,4*(res-1));
  for(let i=0;i<res;i++)for(const edge of [i,(res-1)*res+i,i*res,i*res+res-1])assert.ok(used.has(edge));
  let area=0;
  for(let i=0;i<sea.indices.length;i+=3){
    const [a,b,c]=sea.indices.slice(i,i+3).map(v=>v*3),p=sea.positions;
    const twice=(p[b+2]-p[a+2])*(p[c]-p[a])-(p[b]-p[a])*(p[c+2]-p[a+2]);
    assert.ok(twice>0);area+=twice/2;
  }
  assert.equal(area,64*64);
  for(const island of [{...base,sample:()=>-.2},{...base,waterAt:()=>3}])
    assert.equal(buildWaterChunk(island,0,0,res).indices.length,6*(res-1)**2);
  assert.equal(buildWaterChunk({...base,sample:()=>2},0,0,res),null);
});
