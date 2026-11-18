import test from 'node:test';
import assert from 'node:assert/strict';
import {engineFeedback,RoadsterSound} from '../src/roadster-sound.js';
import {stepRoadster} from '../packages/sim/src/roadster.js';

test('engine rises from idle, drops on an upshift and holds its gear around the threshold',()=>{
  const run=(v,g=1,p=1)=>engineFeedback({speed:v},g,p);
  assert.equal(run(0,1,0).rpm,820);
  assert.ok(run(6).rpm>3000);
  const shifted=run(8);
  assert.equal(shifted.gear,2);
  assert.ok(shifted.rpm<run(7.6).rpm);
  assert.equal(run(7.2,2).gear,2);
  assert.equal(run(2,2).gear,1);
  assert.equal(run(16,2).gear,3);
  assert.equal(run(-2,2,-1).gear,-1);
  assert.ok(run(7,1,0).load<run(7,1,1).load);
});

test('tire feedback uses axle velocity, including oversteer with the steering centered',()=>{
  assert.equal(engineFeedback({speed:10,steer:0}).scrub,0);
  assert.equal(engineFeedback({speed:1,steer:1,sideSpeed:2}).scrub,0);
  const car={speed:13};
  for(let i=0;i<25;i++)stepRoadster(car,{x:1,z:0},1/60);
  assert.ok(engineFeedback(car).scrub>.4);
  assert.ok(engineFeedback({speed:12,steer:0,sideSpeed:1.8,yawRate:-.9}).scrub>.8);
});

test('only the nearest passing motor is heard and its speed tracks positions outside the camera',()=>{
  const sound=new RoadsterSound(),reports=[];
  sound.ctx={state:'running'};sound.muted=false;
  sound.play=(channel,id,drive,gain,pan)=>reports.push({channel,id,drive,gain,pan});
  const person=(x,z)=>({position:{x,z},visible:false,userData:{driving:true}});
  const close=person(3,0),far=person(-19,0),out=person(29,0),me={id:'me',x:0,z:0};
  const camera={matrixWorld:{elements:[1,0,0]}};
  const update=t=>sound.update(t,me,{},0,[far,out,close],[],camera);
  update(100);assert.equal(reports.at(-1).id,close);assert.ok(reports.at(-1).pan>.9);
  close.position.x+=1;update(200);assert.ok(reports.at(-1).drive.speed>4);
  close.userData.driving=false;update(300);assert.equal(reports.at(-1).id,far);
  assert.equal(reports.at(-1).drive.speed,0);
  far.userData.driving=false;update(400);assert.equal(reports.at(-1).drive,null);
});
