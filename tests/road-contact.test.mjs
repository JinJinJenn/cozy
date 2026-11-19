import test from 'node:test';
import assert from 'node:assert/strict';
import {halfTrack,halfWheelbase,roadContact} from '../packages/sim/src/road-contact.js';
import {stepRoadster} from '../packages/sim/src/roadster.js';
import {buildTerrainChunk,renderedTerrainHeight} from '../packages/island-gen/src/chunks.js';

test('tire pavement follows both submitted terrain triangles on either side of a tile seam',()=>{
  const island={chunkSize:8,chunkCells:2,cell:3,sample:(x,z)=>x*z*.12+Math.sin(.3*z),
    paint:()=>[1,1,1],wetAt:()=>false};
  const height=renderedTerrainHeight(island);
  for(const tile of [-1,0]){
    const mesh=buildTerrainChunk(island,tile,0,3,{skirts:false});
    for(let i=0;i<mesh.indices.length;i+=3){
      const p=[0,0,0];
      for(const [j,w] of [.2,.35,.45].entries()){
        const offset=mesh.indices[i+j]*3;
        for(let k=0;k<3;k++)p[k]+=w*mesh.positions[offset+k];
      }
      assert.ok(Math.abs(height(p[0],p[2])-p[1])<1e-6);
    }
  }
});

test('all four tire contact patches share a tilted road for either heading',()=>{
  const h=(x,z)=>3+.47*x-.23*z;
  const state={};
  for(const yaw of [0,Math.PI/3,Math.PI,Math.PI*1.8]){
    const {pitch,roll,y,travel}=roadContact(h,12,8,yaw,state);
    const cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
    for(const u of [-halfTrack,halfTrack])for(const v of [-halfWheelbase,halfWheelbase]){
      const right=cr*u,forward=sp*sr*u+cp*v;
      const x=12+Math.cos(yaw)*right+Math.sin(yaw)*forward;
      const z=8-Math.sin(yaw)*right+Math.cos(yaw)*forward;
      assert.ok(Math.abs(y+cp*sr*u-sp*v-h(x,z))<1e-10);
    }
    assert.ok(travel.every(d=>Math.abs(d)<1e-10));
  }
});

test('changes in camber use opposite suspension travel on the same axle',()=>{
  let samples=0;
  const h=(x,z)=>{samples++;return .08*x*z;},state={};
  const {travel}=roadContact(h,0,0,0,state);
  assert.ok(travel[0]>.05&&travel[1]<-.05&&travel[2]<-.05&&travel[3]>.05);
  const first=samples;roadContact(h,0,0,0,state);
  assert.equal(samples,first);
  roadContact(h,0,2,0,state);assert.ok(samples>first);
});

test('banking loads moving tires downhill while static grip holds a parked car',()=>{
  const run=(bank,speed)=>{
    const car={speed};
    for(let i=0;i<120;i++)stepRoadster(car,{x:0,z:0},1/120,0,bank);
    return car;
  };
  const left=run(.25,9),right=run(-.25,9);
  assert.ok(left.sideSpeed<-.1&&right.sideSpeed>.1);
  assert.ok(Math.abs(left.sideSpeed+right.sideSpeed)<1e-8);
  assert.equal(run(0,9).sideSpeed,0);
  const parked=run(.58,0);assert.equal(parked.speed,0);assert.equal(parked.sideSpeed,0);
});
