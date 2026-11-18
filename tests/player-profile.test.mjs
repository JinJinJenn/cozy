import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProfile,gesturePhase,gestureSeconds,readProfile,shirts} from '../src/player-profile.js';
import {StreetSession} from '../src/street-session.js';

test('public player labels normalize Unicode, bound input and accept only catalog shirts',()=>{
  const fallback=defaultProfile('1234');
  assert.ok(Object.hasOwn(shirts,fallback.shirt));
  assert.deepEqual(readProfile(fallback),fallback);
  assert.deepEqual(readProfile({name:'  Rene\u0301e  \u202e  Li  ',shirt:'lagoon',actor:'another-id'}),
    {name:'Renée Li',shirt:'lagoon'});
  for(const value of [null,{name:' ',shirt:'rose'},{name:'A'.repeat(25),shirt:'rose'},
    {name:'River',shirt:'constructor'},{name:5,shirt:'plum'}])assert.equal(readProfile(value),null);
});
test('greetings overlay idle, walking and sitting poses without restarting a route or releasing a seat',()=>{
  const s={time:12},actor={walking:true,goal:[3,4]},send=gesture=>StreetSession.prototype.applyCommand.call(s,actor,{type:'gesture',gesture});
  send('wave');assert.equal(gesturePhase(actor,13),1/gestureSeconds);
  s.time=13;send('cheer');assert.equal(actor.gesture,'wave');assert.equal(actor.walking,true);assert.deepEqual(actor.goal,[3,4]);
  s.time=15;Object.assign(actor,{walking:false,activity:'sit',using:{lot:'l1',index:0}});
  send('cheer');assert.equal(actor.gesture,'cheer');assert.equal(gesturePhase(actor,15),0);
  assert.deepEqual(actor.using,{lot:'l1',index:0});
  assert.equal(gesturePhase(actor,18),null);
  for(const busy of [{activity:'piano'},{vehicle:'bike'},{cup:true},{bowlFrom:'l1'},{outing:'menu'}]){
    const occupied={...busy};
    StreetSession.prototype.applyCommand.call(s,occupied,{type:'gesture',gesture:'wave'});
    assert.deepEqual(occupied,busy);
  }
});
test('a directed wave faces a nearby player and respects distance and seated orientation',()=>{
  const actor={id:'a',x:0,z:0,yaw:0},other={id:'b',x:4,z:0};
  const session={time:10,actors:new Map([['a',actor],['b',other]])};
  const wave=to=>StreetSession.prototype.applyCommand.call(session,actor,{type:'gesture',gesture:'wave',to});
  wave('missing');wave('a');assert.equal(actor.gesture,undefined);
  other.x=25;wave('b');assert.equal(actor.gesture,undefined);
  other.x=4;wave('b');assert.equal(actor.yaw,Math.PI/2);assert.equal(actor.gesture,'wave');
  session.time=20;actor.activity='sit';actor.yaw=0;wave('b');
  assert.equal(actor.gestureAt,20);assert.equal(actor.yaw,0);
});
