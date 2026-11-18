import test from 'node:test';
import assert from 'node:assert/strict';
import sample from '../packages/settlement/src/petalwood-plan.json' with {type:'json'};
import {planCivicCentre} from '../packages/settlement/src/civic.js';
import {pointInPoly} from '../packages/settlement/src/geom.js';
import {stationsFor} from '../src/street-session.js';
import {finishStreetEnds} from '../packages/settlement/src/street-ends.js';
import {finishFlowers,flowerAction,flowerFor} from '../src/roadside-flowers.js';
import {defaultLayout,readLayout} from '../src/street-world.js';
import {readProfile} from '../src/player-profile.js';

test('Petalwood reserves whole civic blocks, keeps historic venues and fits every corner',()=>{
  const plan=structuredClone(sample),venues=['l102','l104','l105','l106','l107','l108','l109'];
  const result=planCivicCentre(plan,venues);
  for(const [use,b] of Object.entries(result)){
    const block=plan.blocks.find(block=>block.id===b.id);
    assert.ok(plan.lots.filter(l=>l.blockId===b.id).every(l=>l.use===use));
    for(const x of [-b.half,b.half])for(const z of [-b.half,b.half]){
      assert.ok(pointInPoly(b.x+x*Math.cos(b.yaw)+z*Math.sin(b.yaw),b.z-x*Math.sin(b.yaw)+z*Math.cos(b.yaw),block.poly));
    }
  }
  assert.notEqual(result.square.id,result.hall.id);
  assert.ok(plan.lots.filter(l=>venues.includes(l.id)).every(l=>!l.use));
  assert.equal(plan.lots.filter(l=>l.use==='shop').length,8);
  assert.ok(plan.lots.some(l=>l.use==='orchard'&&l.district==='outskirts'));
  assert.deepEqual(planCivicCentre(structuredClone(sample),venues),result);
  assert.equal(planCivicCentre({sites:[],blocks:[],lots:[]}),null);
});

test('a redundant street tail ends at the junction and a served frontage stays open',()=>{
  const road=(id,pts)=>({id,pts,width:5,class:'street'});
  const plan={roads:[road('a',[[0,0],[60,0]]),road('b',[[10,-30],[10,30]])],lots:[]};
  const occupied=structuredClone(plan);
  occupied.lots.push({frontageRoadId:'a',poly:[[1,4],[7,4],[7,9],[1,9]]});
  finishStreetEnds(plan);finishStreetEnds(occupied);
  assert.deepEqual(plan.roads[0].pts,[[10,0],[60,0]]);
  assert.deepEqual(occupied.roads[0].pts,[[0,0],[60,0]]);
});

test('both roadside bench seats face the road and can be claimed separately',()=>{
  const b={x:3,z:-6,yaw:Math.PI/2,c:0,s:1,kind:'wayside'};
  const [one,two]=stationsFor(b);
  assert.equal(one.action,'sit');assert.equal(two.yaw,b.yaw);
  assert.ok(Math.hypot(one.x-two.x,one.z-two.z)>.9);
});

test('a cut flower bed is saved independently of its seats, while the clipped flower belongs to the visitor',()=>{
  const id='bench-r12-3',species=flowerFor(id),bed={id,species,x:3,y:1,z:4,yaw:0,c:1,s:0,kind:'wayside'};
  const session={layout:defaultLayout(),id:'owner',island:{streetBenches:new Map([[id,bed]])},persist(){}};
  const actor={id:'guest',activity:'clip',using:{lot:id},profile:{name:'Bea',shirt:'plum'}};
  const [one,two,flowers]=stationsFor(bed);
  assert.equal(one.action,'sit');assert.equal(two.action,'sit');assert.equal(flowers.index,2);
  assert.equal(flowerAction(session.layout,id,flowers,{bowlFrom:'l10'}),null);
  assert.equal(flowerAction(session.layout,id,flowers,actor).action,'clip');
  finishFlowers(session,actor);const receipt=actor.pickedFlower.id;
  assert.equal(readProfile(actor.profile).flower,species);
  assert.deepEqual(readLayout(JSON.parse(JSON.stringify(session.layout))).cutFlowerBeds,[id]);
  assert.equal(finishFlowers(session,actor),'');assert.equal(actor.pickedFlower.id,receipt);
  assert.equal(flowerAction(session.layout,id,flowers,actor).action,'water');
  actor.activity='water';finishFlowers(session,actor);
  assert.equal(session.layout.cutFlowerBeds,undefined);assert.equal(actor.profile.flower,species);
  for(const invalid of [[id,id],['l12'],['__proto__'],[3],{}])assert.equal(readLayout({...session.layout,cutFlowerBeds:invalid}),null);
  assert.deepEqual(readProfile({name:'Bea',shirt:'plum',flower:'unknown'}),{name:'Bea',shirt:'plum'});
});
