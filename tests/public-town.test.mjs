import assert from 'node:assert/strict';
import test from 'node:test';
import {lobbyIdentity,PublicTown,streetSpace} from '../src/public-town.js';

const world={presetId:'harborTown',seed:'petalwood'};
test('the ordinary town URL is public and an explicit invitation always wins',()=>{
  const at=(query,options=world)=>streetSpace(options,new URLSearchParams(query));
  assert.equal(at('v=new'),'public');
  assert.equal(at('space=personal'),'personal');
  assert.equal(at('space=personal&visit=guest'),'visit');
  assert.equal(at('visit='),'visit');
  assert.equal(at('',{...world,seed:'other'}),'personal');
});

test('simultaneous founders converge, retain the incumbent, and count duplicate transports once',async()=>{
  const make=async joined=>new PublicTown('world',await lobbyIdentity(),()=>{},joined);
  const [a,b,c]=await Promise.all([make(100),make(100),make(200)]);
  const candidates=[a,b,c],messages=[];
  for(const [i,town] of candidates.entries()){
    town.elect();
    for(const kind of ['rtc','bc'])await town.attach(kind,{selfId:String(i),send:packet=>messages.push([town,kind+'/'+i,packet])});
  }
  for(const town of candidates)for(const [source,sender,m] of messages.toReversed()){
    if(source!==town)await town.receive(sender,m);
  }
  const winner=a.self.pub<b.self.pub?a:b,remaining=winner===a?b:a;
  assert.ok(candidates.every(t=>t.leader===winner.self.pub));
  const i=candidates.indexOf(winner);
  c.leave('rtc/'+i);assert.equal(c.leader,winner.self.pub);
  c.leave('bc/'+i);assert.equal(c.leader,remaining.self.pub);
  c.tick(performance.now()+16000);assert.equal(c.leader,c.self.pub);
});

test('presence must prove the world, transport sender, actor and arrival rank',async()=>{
  const sender=new PublicTown('world',await lobbyIdentity(),()=>{},100);
  const other=new PublicTown('world',await lobbyIdentity(),()=>{},200);
  let packet;await sender.attach('rtc',{selfId:'a',send:m=>packet=m});
  await other.receive('rtc/b',packet);
  await other.receive('rtc/a',{...packet,body:packet.body.replace('100]','1]')});
  assert.equal(other.members.size,0);
  const foreign=new PublicTown('other',other.self,()=>{});
  await foreign.receive('rtc/a',packet);assert.equal(foreign.members.size,0);
  const pending=other.receive('rtc/a',packet);other.leave('rtc/a');await pending;
  assert.equal(other.members.size,0);
  await other.receive('rtc/a',packet);assert.equal(other.leader,sender.self.pub);
  assert.equal(sender.self.privateKey.extractable,false);
});
