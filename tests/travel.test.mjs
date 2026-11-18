import test from 'node:test';
import assert from 'node:assert/strict';
import {takeVehicle,moveVehicle,dismount,teleport} from '../src/street-travel.js';
import {cameraClearance,defaultLayout} from '../src/street-world.js';

function street(){
  const a={id:'player',x:0,z:0,yaw:0};
  const island={half:200,sample:x=>x>100?-1:2,waterAt:()=>0,slope:()=>0,
    plan:{roads:[{width:8,pts:[[0,-100],[0,100]]}]}};
  const s={island,actors:new Map([[a.id,a]]),plots:[],town:{people:[]},layout:defaultLayout(),
    activities:{finish(a){a.walking=false;}}};
  return {s,a};
}
test('a facade pick hits the sloped roof and clears the sky beside the ridge',()=>{
  const house={kind:'home',variant:0,x:0,y:0,z:0,c:1,s:0,w:8,d:6,height:3.2,roofHeight:5.9};
  for(const [x,y,hit] of [[0,5.3,true],[3.5,5.3,false],[3.5,2,true]]){
    assert.equal(cameraClearance({x,y,z:12},{x,y,z:-12},house,true)<1,hit);
  }
});
test('cars accelerate, turn, coast, brake and reverse within the carriageway',()=>{
  const {s,a}=street();takeVehicle(s,a,'car');assert.equal(a.vehicle,'car');
  for(let i=0;i<40;i++)moveVehicle(s,a,{x:0,z:1},.05);
  assert.ok(a.speed>9&&a.z>9);
  const speed=a.speed;moveVehicle(s,a,{x:.3,z:0},.1);assert.ok(a.yaw<0&&a.speed<speed);
  a.yaw=0;for(let i=0;i<100;i++)moveVehicle(s,a,{x:0,z:-1},.05);
  assert.ok(a.speed<0);
  Object.assign(a,{x:0,z:0,yaw:Math.PI/2,speed:12});
  for(let i=0;i<20;i++)moveVehicle(s,a,{x:0,z:1},.1);
  assert.ok(a.x<3&&a.speed===0);
});
test('bikes cross grass but stop before water and people',()=>{
  const {s,a}=street();takeVehicle(s,a,'bike');a.yaw=Math.PI/2;
  for(let i=0;i<75;i++)moveVehicle(s,a,{x:0,z:1},.05);
  assert.ok(a.x>12&&a.speed===7.5);
  const z=a.z;s.town.people.push({visible:true,position:{x:a.x+3,z}});
  for(let i=0;i<20;i++)moveVehicle(s,a,{x:0,z:1},.1);
  assert.ok(a.speed===0&&a.x<s.town.people[0].position.x-.8);
  s.town.people=[];a.x=98;
  for(let i=0;i<30;i++)moveVehicle(s,a,{x:0,z:1},.1);
  assert.ok(a.speed===0&&a.x<100);
  dismount(s,a);assert.equal(a.vehicle,undefined);assert.equal(a.travelSeq,1);
});
test('invalid travel preserves activities and named teleport releases the rider at a free landing',()=>{
  const {s,a}=street();takeVehicle(s,a,'train');assert.equal(a.vehicle,undefined);
  takeVehicle(s,a,'car');assert.equal(a.vehicle,'car');
  for(const cmd of [{x:NaN,z:0},{x:130,z:0},{place:'missing'}]){
    teleport(s,a,cmd);assert.equal(a.vehicle,'car');assert.equal(a.travelSeq,undefined);
  }
  const b={id:'home-1',inside:{x:12,z:2}};s.island.homesById=new Map([[b.id,b]]);
  s.actors.set('guest',{id:'guest',...b.inside});
  teleport(s,a,{place:b.id});assert.equal(a.travelSeq,1);assert.equal(a.vehicle,undefined);
  assert.ok(Math.hypot(a.x-12,a.z-2)>=.62);assert.equal(a.walking,false);
});
