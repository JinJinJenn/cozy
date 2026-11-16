import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultLayout,legalWall,moveWalker,plotsForStreet,readLayout,toWorld,toRoom,walkable} from '../src/street-world.js';
import {generate} from '../packages/island-gen/index.js';
import {createFlattenHook,generateSettlement} from '../packages/settlement/index.js';
import {pointInPoly} from '../packages/settlement/src/geom.js';
import {StreetSession} from '../src/street-session.js';
const b={kind:'cafe',cafe:true,x:12,z:-16,y:4,c:Math.cos(.7),s:Math.sin(.7),w:9.2,d:8.6};
const island={half:100,sample:()=>3,slope:()=>0,waterAt:()=>0};
test('a moving partition sweeps occupants and its open door leaf',()=>{
  assert.equal(legalWall(-1.5,1.5,[toWorld(b,2,.3)],b),-.5);
  assert.equal(legalWall(1.5,-1.5,[toWorld(b,1.02,-.6)],b),1);
  assert.equal(legalWall(-1.5,1.5,[toWorld(b,0,0)],b),1.5);
});
test('movement crosses both door thresholds and stops at a solid wall',()=>{
  const layout=defaultLayout();
  for(const [x,limit] of [[0,-2],[1.8,4.3]]){
    const a=toWorld(b,x,6.3);
    for(let i=0;i<20;i++)moveWalker(island,[b],layout,a,{x:-b.s,z:-b.c},.15);
    const p=toRoom(b,a);
    if(x===0)assert.ok(p.z<limit);else assert.ok(p.z>=limit);
    assert.ok(walkable(island,[b],layout,a));
  }
});
test('saved layouts reject corrupt wall and undo values',()=>{
  const s=defaultLayout();assert.deepEqual(readLayout(s),s);
  for(const v of [null,'1',.25,2]){assert.equal(readLayout({...s,wall:v}),null);assert.equal(readLayout({...s,undo:[v]}),null);}
});
test('all waterfront front doors can be reached from their shared road on the graded island',()=>{
  const result=generate({seed:'petalwood',preset:'harborTown'}),world=result.island;
  world.plan=generateSettlement(result);result.heightfield.set(createFlattenHook(world.plan)(result));
  const plots=plotsForStreet(world),layout=defaultLayout();assert.equal(plots.length,7);
  for(const p of plots){
    const lot=world.plan.lots.find(l=>l.id===p.id);assert.ok(lot.buildable,p.kind);assert.equal(p.road,plots[0].road);
    for(const x of [-1,1])for(const z of [-1,1]){
      const q=toWorld(p,x*p.w/2,z*p.d/2);assert.ok(pointInPoly(q.x,q.z,lot.poly),p.kind+' footprint');
    }
    const walker=toWorld(p,0,13);
    for(let i=0;i<36;i++)moveWalker(world,plots,layout,walker,{x:-p.s,z:-p.c},.08);
    assert.ok(toRoom(p,walker).z<1.5,p.kind+' doorway');
  }
});
test('the club reserves two different keyboard parts and the restaurant seats diners at tables',()=>{
  const club={...b,kind:'club',cafe:false},kitchen={...club,x:35,kind:'restaurant'};
  const session=Object.create(StreetSession.prototype);
  session.plots=[club,kitchen];session.actors=new Map();
  for(const [id,place,x,z] of [['A',club,-1.7,-1],['B',club,1.7,-1],['C',kitchen,-1.65,.65]]){
    session.actors.set(id,{id,...toWorld(place,x,z)});session.interact(id);
  }
  assert.equal(session.actors.get('A').part,'melody');assert.equal(session.actors.get('B').part,'bass');
  assert.equal(session.actors.get('C').activity,'dine');
  session.interact('A');assert.equal(session.actors.get('A').part,'');
});
