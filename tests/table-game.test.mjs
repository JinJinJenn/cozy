import test from 'node:test';
import assert from 'node:assert/strict';
import {boardCommand,finished,leaveBoard,practiceTurn,roundAt,sitAtBoard,validRound,winningLine} from '../src/table-game.js';

function table(){
  const s={actors:new Map(),time:1};
  const sit=id=>{const a={id,activity:'tablegame',using:{lot:'l93'}};s.actors.set(id,a);sitAtBoard(s,a);return a;};
  const round=()=>roundAt(s,'l93');
  const play=(a,choice,cell,extra)=>boardCommand(s,a,{lot:'l93',choice,cell,round:round()?.id??null,ply:round()?.moves.length??0,...extra});
  return {s,sit,round,play};
}
test('Harbor Three validates seat, round, turn and square, detects a line and swaps the opener on replay',()=>{
  const {s,sit,round,play}=table(),a=sit('a'),b=sit('b'),outsider={id:'o',activity:'sit',using:{lot:'l93'}};
  play(outsider,'place',2);play(b,'place',8);play(a,'place',9);play(a,'place',1,{lot:'l12'});
  assert.equal(round().moves,'');
  play(a,'place',2);play(b,'place',2);play(b,'place',1,{ply:0});play(a,'place',0);
  assert.equal(round().moves,'2');
  play(b,'place',0);play(a,'place',4);play(b,'place',1);play(a,'place',6);play(b,'place',3);
  const previous=round();assert.deepEqual(winningLine(previous.moves),[2,4,6]);assert.ok(validRound(previous,a));
  play(b,'together');assert.deepEqual(round().players,['b','a']);play(b,'place',4,{round:previous.id});assert.equal(round().moves,'');
  leaveBoard(s,a);assert.equal(round(),null);
});
test('a practice opponent waits, blocks a line and yields the board to a visiting player on request',()=>{
  const {s,sit,round,play}=table(),a=sit('a');play(a,'solo');play(a,'place',0);
  practiceTurn(s,round());assert.equal(round().moves,'0');
  s.time++;practiceTurn(s,round());assert.equal(round().moves,'04');
  play(a,'place',1);s.time++;practiceTurn(s,round());assert.equal(round().moves,'0412');
  const guest=sit('guest');play(guest,'together');assert.equal(round().players[1],null);
  play(a,'together');assert.deepEqual(round().players,['guest','a']);assert.equal(round().moves,'');
  leaveBoard(s,guest);assert.equal(round(),null);
});
test('a full board can draw and malformed or post-win move sequences cannot replicate',()=>{
  assert.equal(finished('012435768'),true);assert.equal(winningLine('012435768'),null);
  const {sit,round}=table(),a=sit('a');sit('b');
  for(const moves of ['0123x','01231','031425','0123456789'])
    assert.equal(validRound({...round(),moves},a),false);
});
