import test from 'node:test';
import assert from 'node:assert/strict';
import {presentWalker} from '../src/street-motion.js';
import {walkingRoute} from '../src/street-route.js';
import {defaultLayout,walkable,toWorld} from '../src/street-world.js';

const ground={half:100,sample:()=>3,slope:()=>0,waterAt:()=>0};
const cafe={id:'c',kind:'cafe',cafe:true,x:0,z:0,c:1,s:0,y:3,w:9.2,d:8.6};
test('a guest moves on the next rendered frame while the host acknowledgement is in flight',()=>{
  const s={owner:false,connected:true,keys:{x:1,z:0},motion:2,verifiedSeq:1,id:'me',layout:defaultLayout(),island:ground,plots:[]};
  const actor={id:'me',x:0,z:0,yaw:0,activity:'',motion:1};
  const state={};presentWalker(s,actor,state,0,.016);
  for(let i=1;i<=5;i++){
    const was=state.x;presentWalker(s,actor,state,i*16,.016);
    assert.ok(state.x>was+.06&&state.x<was+.08);
  }
  assert.equal(actor.x,0);
  Object.assign(actor,{motion:2,x:.36,vx:4.3,vz:0});s.lastFrame=96;
  presentWalker(s,actor,state,96,.016);assert.ok(state.x>.36&&state.x<.43);
});

test('a distant walker advances between snapshots and snaps cleanly into a reserved seat',()=>{
  const s={owner:false,connected:true,id:'me',layout:defaultLayout(),keys:{x:0,z:0},island:ground,plots:[],
    lastFrame:5,verifiedSeq:1};
  const actor={id:'them',x:0,z:0,activity:'',yaw:0},state={};
  presentWalker(s,actor,state,5,.016);
  Object.assign(s,{lastFrame:100,verifiedSeq:2});actor.x=.30;
  presentWalker(s,actor,state,100,.016);presentWalker(s,actor,state,140,.04);
  assert.ok(state.x>0&&state.x<.30);
  actor.activity='sit';actor.x=.55;presentWalker(s,actor,state,145,.005);assert.equal(state.x,.55);
});

test('a click behind the café routes through the open door and leaves all samples walkable',()=>{
  const layout=defaultLayout(),start=toWorld(cafe,4,7),end=toWorld(cafe,0,-2.15);
  const route=walkingRoute(ground,[cafe],layout,start,end);
  assert.ok(route.length>1);let a=start;
  for(const b of route){
    const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.07);
    for(let i=0;i<=n;i++)assert.ok(walkable(ground,[cafe],layout,{x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n}));
    a=b;
  }
  assert.equal(walkingRoute(ground,[cafe],layout,start,toWorld(cafe,0,-3.14)),null);
});

test('home door hints preserve a clear direct walk and recover from a blocked approach',()=>{
  const layout=defaultLayout(),blocked=toWorld(cafe,0,-3.14);
  const start=toWorld(cafe,4,7),alongStreet=toWorld(cafe,-2,7),inside=toWorld(cafe,0,-2.15);
  assert.deepEqual(walkingRoute(ground,[cafe],layout,start,alongStreet,[blocked]),[alongStreet]);
  const ordinary=walkingRoute(ground,[cafe],layout,start,inside);
  assert.ok(ordinary.length>1);
  assert.deepEqual(walkingRoute(ground,[cafe],layout,start,inside,[blocked]),ordinary);
});
