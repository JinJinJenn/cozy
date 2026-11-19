import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSidewalkNetwork} from '../src/sidewalk-network.js';

const point = (x,z) => ({x,z});
const road = (id,pts,extra={}) => ({id,pts,width:8,class:'street',...extra});
function router(roads,canStand=()=>true) {
  return buildSidewalkNetwork({plan:{roads}},canStand);
}
function samples(from,path) {
  const result = [];
  for (const to of path) {
    const count = Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.25);
    for (let i=1; i<=count; i++) {
      result.push(point(from.x+(to.x-from.x)*i/count,from.z+(to.z-from.z)*i/count));
    }
    from = to;
  }
  return result;
}

test('pedestrians follow either kerb through a four-way junction and take the inside corner',()=>{
  const route = router([road('east',[[-90,0],[90,0]]),road('north',[[0,-90],[0,90]])]);
  for (const side of [-1,1]) {
    const from=point(-55,5*side), to=point(50,5*side);
    assert.ok(samples(from,route(from,to)).every(p=>Math.abs(p.z-5*side)<.001));
  }
  const from=point(-55,5),to=point(-5,50);
  for (const p of samples(from,route(from,to))) {
    assert.ok(p.x<=-4.99 && p.z>=4.99,'corner stays on the inner pavement');
  }
});

test('a short gap between generated streets joins their pavements where it is walkable',()=>{
  const roads=[road('east',[[-60,0],[0,0]]),road('north',[[6,-45],[6,45]])];
  const start=point(-45,5),end=point(1,35);
  const path=router(roads)(start,end);
  assert.ok(path);
  assert.ok(samples(start,path).every(p=>p.z>=4.99 && p.x<=1.01));
  const waterBetween=p=>p.x<=.25 || p.x>=.75;
  assert.equal(router(roads,waterBetween)(start,end),null);
});

test('a paved bridge uses its narrow footway and an unpaved trail stays on its center',()=>{
  for (const [props,offset] of [[{bridge:true},4.48],[{class:'path',width:3},0]]) {
    const route=router([road('across',[[0,-55],[0,55]],props)]);
    const from=point(offset,-40),to=point(offset,40);
    assert.ok(samples(from,route(from,to)).every(p=>Math.abs(p.x-offset)<.001));
  }
});

test('both directions around a flooded section can reach the dry pavement opposite',()=>{
  const roads=[road('shore',[[-25,0],[0,0],[25,0],[50,0],[75,0]])];
  const flooded=p=>p.x>10 && p.x<18 && p.z>3;
  const route=router(roads,p=>!flooded(p));
  for(const [a,b] of [[-10,52],[52,-10]]){
    const from=point(a,5),to=point(b,5);
    const walked=samples(from,route(from,to));
    assert.ok(walked.every(p=>!flooded(p)));
    assert.ok(walked.some(p=>p.z< -4.9 && p.x>10 && p.x<18));
    assert.deepEqual(walked.at(-1),to);
  }
});
