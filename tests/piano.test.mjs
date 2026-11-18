import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptNotes,baseNote,keyLabel,keyShape,pressedKeys,setFreePlay,validPiano} from '../src/piano.js';

test('two octave keyboards have independently pickable white and black keys with distinct pitches',()=>{
  assert.equal(keyShape.length,25);assert.equal(keyShape.filter(k=>!k.black).length,15);
  assert.equal(keyLabel('melody',0),'C4');assert.equal(keyLabel('melody',24),'C6');
  assert.equal(keyLabel('bass',13),'C♯4');assert.equal(baseNote('melody')-baseNote('bass'),12);
  assert.ok(keyShape.every((k,i)=>!i||k.x>keyShape[i-1].x));
});
test('only seated players perform, ordered chords survive retransmission and expire independently',()=>{
  const a={activity:'sit',part:''};setFreePlay(a,true);assert.equal(a.piano,undefined);
  Object.assign(a,{activity:'piano',part:'bass'});setFreePlay(a,true);
  const packet={id:a.piano.id,notes:[[1,0,.18],[2,4,.18],[3,7,.02]]};
  acceptNotes(a,packet,3);acceptNotes(a,packet,3.1);
  assert.equal(pressedKeys(a.piano.notes,3),(1<<0)|(1<<4)|(1<<7));
  assert.equal(pressedKeys(a.piano.notes,3.22),1<<7);assert.deepEqual(a.piano.notes.map(n=>n[0]),[1,2,3]);
  acceptNotes(a,{id:packet.id,notes:[[4,25,0],[5,3,2],[6,4,-1]]},3.24);assert.equal(a.piano.seq,3);
  assert.ok(validPiano(a.piano));assert.equal(validPiano({...a.piano,notes:[[4,-2,0]]}),false);
  setFreePlay(a,false);setFreePlay(a,true);acceptNotes(a,packet,3.3);assert.equal(a.piano.notes.length,0);
  for(let seq=1;seq<=30;seq++)acceptNotes(a,{id:a.piano.id,notes:[[seq,3,0]]},3.4);
  assert.equal(a.piano.notes.length,16);assert.equal(a.piano.seq,30);
});
