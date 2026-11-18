import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeResidents,decodeResidents} from '../src/resident-wire.js';
test('a full city round trips within the signed frame budget',()=>{
  const people=Array.from({length:600},(_,i)=>({position:{x:i*3-1000,y:i/20,z:800-i*2},visible:i%3!==0,scale:{y:i%2?.73:1}}));
  const encoded=encodeResidents(people),rows=decodeResidents(encoded,people.length);
  assert.ok(encoded.length<6000);
  for(let i=0;i<people.length;i++){
    for(const [j,k] of ['x','y','z'].entries())assert.ok(Math.abs(rows[i][j]-people[i].position[k])<=.051);
    assert.equal(!!rows[i][3],people[i].visible);assert.equal(rows[i][4],people[i].scale.y);
  }
  assert.equal(decodeResidents(encoded,599),null);assert.equal(decodeResidents('!'.repeat(encoded.length),600),null);
});
