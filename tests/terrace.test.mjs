import test from 'node:test';
import assert from 'node:assert/strict';
import {StreetSession} from '../src/street-session.js';
import {StreetActivities} from '../src/street-activities.js';
import {defaultLayout,gardenForStreet,readLayout,toWorld,walkable} from '../src/street-world.js';
import {readTerrace,tableFit,terraceDefault} from '../src/terrace.js';

const cafe={id:'l107',cafe:true,kind:'cafe',w:9.2,d:8.6,x:11,z:-4,y:3,yaw:.4,c:Math.cos(.4),s:Math.sin(.4)};
const ground={half:100,sample:()=>3,slope:()=>0,waterAt:()=>0};
const added={id:1,x:3.5,z:7.5,turn:1};
test('terrace placement leaves the doorway, street and both chair approaches clear',()=>{
  const defaults=terraceDefault();
  assert.deepEqual(readTerrace(undefined),defaults);
  assert.equal(tableFit(added,defaults.tables),'');
  for(const v of [{...added,x:0},{...added,x:-3,z:6.5},{...added,z:9},{...added,x:2.5,z:6}])assert.ok(tableFit(v,defaults.tables));
  assert.equal(readTerrace({...defaults,tables:[...defaults.tables,{...defaults.tables[0]}]}),null);
  assert.equal(readTerrace({...defaults,undo:[{id:1,before:{...added,turn:9}}]}),null);
});
test('claimed or occupied terrace furniture survives remove, move and undo',()=>{
  const s=Object.assign(Object.create(StreetSession.prototype),{owner:true,ready:true,layout:defaultLayout(),island:ground,cafe,plots:[cafe],town:{people:[]},actors:new Map(),persist(){},notice(){}});
  s.activities=new StreetActivities(s);assert.ok(s.editTable(1,added));
  const seat=s.furnitureAt('terrace-1',0).spot,actor={id:'guest',...toWorld(cafe,0,7),activity:''};
  s.actors.set(actor.id,actor);
  assert.equal(walkable(ground,s.plots,s.layout,toWorld(cafe,added.x,added.z)),false);
  assert.ok(walkable(ground,s.plots,s.layout,seat));
  s.activities.command(actor,{type:'furniture',lot:'terrace-1',index:0});
  assert.ok(actor.walking);assert.equal(s.editTable(1,null),false);
  for(let i=0;i<300&&actor.walking;i++)s.activities.advance(actor,.04);
  assert.equal(actor.activity,'sit');assert.equal(s.editTable(1,{...added,x:3}),false);
  assert.equal(s.editTable(1,null,true),false);assert.equal(s.layout.terrace.undo.length,1);
  s.layout=readLayout(s.layout);Object.assign(actor,toWorld(cafe,0,7));
  assert.ok(s.editTable(1,null,true));assert.ok(walkable(ground,s.plots,s.layout,toWorld(cafe,added.x,added.z)));
});
test('two coffee visits use separate counter spaces and reach four distinct seats',()=>{
  const s=Object.assign(Object.create(StreetSession.prototype),{layout:defaultLayout(),island:ground,cafe,garden:gardenForStreet(cafe),plots:[cafe],actors:new Map(),coffeeVisits:{},time:0});
  const outings=s.activities=new StreetActivities(s);
  const walkers=['guest1','guest2','resident0','resident1'].map((id,i)=>({id,...toWorld(cafe,i*.8,8),activity:''}));
  for(const a of walkers)s.actors.set(a.id,a);
  const [first,second]=walkers;outings.start(first);outings.start(second);
  assert.notEqual(first.counterSlot,second.counterSlot);assert.equal(second.meetingTable,'terrace-0');
  for(let i=0;i<1500;i++){
    s.time+=.04;
    for(const a of walkers){outings.advance(a,.04);if(a.outing==='carry')outings.command(a,{type:'coffee'});}
    if(first.outing==='chat'&&second.outing==='chat')break;
  }
  assert.equal(first.outing,'chat');assert.equal(second.outing,'chat');
  assert.ok(walkers.every(a=>a.activity==='sit'&&a.cup));
  assert.equal(new Set(walkers.map(a=>a.x+','+a.z)).size,4);
});
