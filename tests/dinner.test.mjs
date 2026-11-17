import test from 'node:test';
import assert from 'node:assert/strict';
import {StreetSession} from '../src/street-session.js';
import {StreetActivities} from '../src/street-activities.js';
import {defaultLayout,readLayout,toWorld} from '../src/street-world.js';

function kitchen(){
  const room={id:'l104',kind:'restaurant',w:6.6,d:6.9,x:0,z:0,y:3,yaw:0,c:1,s:0};
  const cafe={...room,id:'l107',x:18,kind:'cafe',cafe:true};
  const s=Object.assign(Object.create(StreetSession.prototype),{ready:true,owner:true,time:0,layout:defaultLayout(),
    island:{half:100,sample:()=>3,slope:()=>0,waterAt:()=>0},plots:[room,cafe],cafe,town:{people:[]},actors:new Map(),persist(){},notice(){}});
  const service=s.activities=new StreetActivities(s);
  const [first,second,cook]=['guest1','guest2','resident0'].map((id,i)=>{
    const a={id,...toWorld(room,i-1,6),activity:''};s.actors.set(id,a);return a;
  });
  const until=condition=>{
    for(let i=0;i<1600&&!condition();i++){s.time+=.04;for(const a of s.actors.values())service.advance(a,.04);}
    assert.ok(condition(),JSON.stringify([...s.actors.values()]));
  };
  return {s,service,first,second,cook,until};
}

test('two meals use separate seats, survive renovation and get served in order',()=>{
  const {s,service,first,second,cook,until}=kitchen();
  for(const guest of [first,second])service.command(guest,{type:'book-dinner'});
  assert.notEqual(first.dinnerSeat,second.dinnerSeat);
  until(()=>first.outing==='menu'&&second.outing==='menu');
  service.command(second,{type:'order-meal',dish:'bad'});assert.equal(second.outing,'menu');
  service.command(first,{type:'order-meal',dish:'fish'});
  service.command(first,{type:'order-meal',dish:'chowder'});assert.equal(first.dish,'fish');
  service.command(second,{type:'order-meal',dish:'chowder'});
  until(()=>cook.tray==='fish');assert.equal(second.outing,'ordered');
  assert.ok(s.edit(.5,false,'l104'));s.layout=readLayout(s.layout);
  assert.equal(s.layout.restaurant.wall,.5);
  until(()=>first.outing==='eating');assert.equal(first.activity,'dine');
  until(()=>second.outing==='eating');assert.equal(second.activity,'dine');
  assert.ok(s.edit(0,true,'l104'));assert.equal(s.layout.restaurant.wall,0);
  assert.equal(readLayout({...s.layout,restaurant:{wall:9,undo:[]}}),null);
});

test('a cancelled meal releases its chair and cook and the next order is delivered',()=>{
  const {service,first,second,cook,until}=kitchen();
  for(const guest of [first,second])service.command(guest,{type:'book-dinner'});
  until(()=>first.outing==='menu'&&second.outing==='menu');
  for(const guest of [first,second])service.command(guest,{type:'order-meal',dish:'chowder'});
  until(()=>cook.cookUntil!==undefined);
  const firstSeat=first.dinnerSeat;service.finish(first);
  assert.equal(cook.invitedBy,undefined);assert.equal(cook.cookUntil,undefined);
  assert.equal(service.stationClaimed('l104',firstSeat),false);
  until(()=>second.outing==='eating');assert.equal(second.dish,'chowder');
});
