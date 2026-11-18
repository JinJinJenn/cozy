import test from 'node:test';
import assert from 'node:assert/strict';
import {takeVehicle,moveVehicle,dismount,teleport} from '../src/street-travel.js';
import {cameraClearance,defaultLayout} from '../src/street-world.js';
import {StreetSession} from '../src/street-session.js';
import {bindResidentTraffic} from '../src/resident-traffic.js';
import {Simulation} from '../packages/sim/src/simulation.js';

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
test('a connected public driver keeps the car through an input stall and stale throttle stops',()=>{
  const {s,a}=street(),now=performance.now();
  takeVehicle(s,a,'car');
  const remote={x:0,z:1,at:now-8500};
  Object.assign(s,{owner:true,ready:true,id:'host',time:0,lastSent:Infinity,
    lobby:{tick(){}},controls:new Map([[a.id,remote]]),peers:new Map([['rtc/guest',a.id]])});
  s.town.advance=()=>{};
  const tick=()=>StreetSession.prototype.tick.call(s,.1);
  tick();
  assert.equal(s.actors.get(a.id)?.vehicle,'car');
  assert.equal(a.speed,0);
  remote.at=performance.now();tick();assert.ok(a.speed>0);
  remote.at=now-31000;tick();assert.equal(s.actors.has(a.id),false);
  s.actors.set(a.id,a);s.controls.set(a.id,remote);remote.at=now-8500;
  s.peers.clear();tick();assert.equal(s.actors.has(a.id),false);
});

test('steering ramps and recentres consistently at 20 and 60 Hz and braking reaches a full stop before reverse',()=>{
  const run=hz=>{
    const {s,a}=street();takeVehicle(s,a,'car');
    for(let i=0;i<hz;i++)moveVehicle(s,a,{x:0,z:1},1/hz);
    for(let i=0;i<hz*.2;i++)moveVehicle(s,a,{x:.65,z:1},1/hz);
    assert.ok(a.steer>0&&a.yaw<0);
    for(let i=0;i<hz*.2;i++)moveVehicle(s,a,{x:0,z:0},1/hz);
    assert.equal(a.steer,0);
    const end={x:a.x,z:a.z,yaw:a.yaw};let stopped=0;
    for(let i=0;i<hz*2;i++){
      moveVehicle(s,a,{x:0,z:-1},1/hz);
      if(a.speed===0)stopped+=1/hz;
    }
    assert.ok(stopped>=.15&&a.speed<0);return end;
  };
  const low=run(20),high=run(60);
  for(const k of ['x','z','yaw'])assert.ok(Math.abs(low[k]-high[k])<.003);
});

test('a glancing curb contact scrubs speed and guides the car along the road while a pedestrian still stops it',()=>{
  const {s,a}=street();
  Object.assign(a,{vehicle:'car',x:2.7,z:0,yaw:.22,speed:9});
  for(let i=0;i<35;i++)moveVehicle(s,a,{x:0,z:0},1/60);
  assert.ok(a.z>3&&a.speed>2&&a.yaw<.16&&a.x<3.2);
  s.town.people=[{visible:true,position:{x:a.x,z:a.z+4}}];
  const start=a.z;
  for(let i=0;i<60;i++)moveVehicle(s,a,{x:0,z:1},1/60);
  assert.equal(a.speed,0);assert.ok(a.z<start+2.3);
});

test('a resident walks out, yields to a player, drives to a neighbor, visits the house and drives home',()=>{
  const homes=[0,70].map((x,i)=>({id:'lot'+i,entry:{x,z:4},inside:{x,z:8}}));
  const players=new Map();
  const ctx={seed:'trip',plan:{roads:[{class:'street',width:7,pts:[[-20,0],[40,0],[100,0]]}]},
    nav:{findPath:(_from,to)=>({pts:[to.slice()]}),height:()=>1}};
  bindResidentTraffic(ctx,{island:{homes},session:{actors:players}});
  const home=homes.find(h=>ctx.hasCarVisit(h.id)),other=homes.find(h=>h!==home);
  const n={id:'n0',name:'Pip',traits:{sociability:.5,curiosity:.6},home:{lotId:home.id,comp:0},pace:1,pos:[home.inside.x,8],mood:0};
  const sim=Object.assign(Object.create(Simulation.prototype),{ctx,npcs:[n],tick:0,cfg:{stepDt:.5,walkSpeed:3},_log(){}});
  const trip=returning=>{
    const plan=ctx.carTrip(n,returning);
    n.action={kind:'move',purpose:'visit',...plan,i:0,then:{kind:'endVisit',returning}};
    let started=false,drove=0,walkedIn=false;
    for(let i=0;i<135&&n.action.kind==='move';i++){
      if(sim.positions()[0].driving){
        const [x,z]=n.pos,goal=n.action.pts[n.action.i],dir=Math.sign(goal[0]-x);
        if(!started){
          players.set('guest',{x:x+dir*2,z});sim.tick++;sim._advance(n);
          assert.deepEqual(n.pos,[x,z]);players.clear();started=true;
        }
        sim.tick++;sim._advance(n);drove+=Math.abs(n.pos[0]-x);
      }else{
        if(started)walkedIn=true;
        sim.tick++;sim._advance(n);
      }
    }
    assert.ok(started&&walkedIn&&drove>60);assert.equal(n.action.kind,'idle');
  };
  trip(false);assert.deepEqual(n.pos,[other.inside.x,8]);assert.equal(n.returnVisit,true);
  trip(true);assert.deepEqual(n.pos,[home.inside.x,8]);assert.equal(n.returnVisit,false);
});
test('a private seat survives a 30 second relay outage and is freed when the visit expires',()=>{
  const {s,a}=street(),seat={lot:'l103',object:'chair-front'};
  a.activity='sit';a.using=seat;
  const remote={x:0,z:1,at:performance.now()-30000};
  s.activities.advance=()=>false;s.activities.finish=actor=>{delete actor.using;};
  s.town.advance=()=>{};
  Object.assign(s,{owner:true,ready:true,id:'host',time:0,lastSent:Infinity,
    controls:new Map([[a.id,remote]]),peers:new Map()});
  const tick=()=>StreetSession.prototype.tick.call(s,.1);
  tick();assert.equal(s.actors.get(a.id)?.using,seat);assert.equal(a.z,0);
  remote.at=performance.now();remote.z=0;s.peers.set('trystero-nostr/guest',a.id);
  tick();assert.equal(s.actors.get(a.id)?.using,seat);
  remote.at=performance.now()-61000;tick();
  assert.equal(a.using,undefined);assert.equal(s.actors.has(a.id),false);
  assert.equal(s.controls.size,0);assert.equal(s.peers.size,0);
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
  const b={id:'home-1',kind:'home',x:12,z:2,w:6,d:6,c:1,s:0,walls:[],furniture:[],inside:{x:12,z:4.8}};
  s.island.homesById=new Map([[b.id,b]]);s.island.homeCells=new Map([['0,0',[b]]]);
  s.actors.set('guest',{id:'guest',...b.inside});
  teleport(s,a,{place:b.id});assert.equal(a.travelSeq,1);assert.equal(a.vehicle,undefined);
  assert.ok(Math.hypot(a.x-b.inside.x,a.z-b.inside.z)>=.62);assert.equal(a.walking,false);
  assert.ok(Math.abs(a.x-b.x)<3&&Math.abs(a.z-b.z)<3);
});
