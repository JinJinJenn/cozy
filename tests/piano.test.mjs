import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptNotes,baseNote,keyLabel,keyShape,pressedKeys,setFreePlay,validPiano} from '../src/piano.js';
import {StreetMusic,withinStage} from '../src/street-music.js';
import {toWorld} from '../src/street-world.js';

test('the club audience hears fresh signed attacks exactly once across gaps and returns quietly',()=>{
  const music=new StreetMusic(),notes=[];
  music.sound=n=>notes.push(n);
  const player={id:'performer',activity:'piano',part:'bass'};
  setFreePlay(player,true);
  const play=(t,listening=true,listener='guest')=>music.play(t,[player],listener,listening);
  const strike=(seq,key,t)=>acceptNotes(player,{id:player.piano.id,notes:[[seq,key,0]]},t);
  strike(1,2,10);play(10.1); // New audience members skip earlier notes.
  strike(2,4,10.2);play(10.7);play(10.8);
  assert.equal(music.takeKeyFlash('bass',player.piano),1<<4);
  assert.equal(music.takeKeyFlash('bass',player.piano),0);
  play(11,false);strike(3,5,11.1);play(11.2);
  strike(4,6,12);play(13);strike(5,7,13.1);play(13.2,true,'performer');
  assert.deepEqual(notes,[52]);
  const club={x:-22,z:35,w:8,d:7,c:Math.cos(1),s:Math.sin(1),kind:'club',id:'moon-room'};
  assert.ok(withinStage(club,{},toWorld(club,0,2)));
  assert.ok(withinStage(club,{},toWorld(club,0,5.8)));
  assert.equal(withinStage(club,{},toWorld(club,2,12)),false);
});

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
