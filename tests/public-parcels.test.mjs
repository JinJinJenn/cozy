import test from 'node:test';
import assert from 'node:assert/strict';
import {StreetSession} from '../src/street-session.js';
import {ParcelBook,absenceGrace} from '../src/public-parcels.js';

const homes=new Map([['l1',6,6,0],['l2',5,7,1],['l3',7,7,10],['l4',8,8,20]].map(([id,w,d,x])=>[id,{id,w,d,x,z:0}]));
const actor=crypto.randomUUID(),other=crypto.randomUUID(),replacement=crypto.randomUUID();
const key='A'.repeat(87),second='B'.repeat(87);
const claim=(key,lot='l1',action='claim')=>({key,home:'l1',lot,action});
test('contended lots offer the nearest free footprint and require explicit acceptance',()=>{
  const book=new ParcelBook(homes),present=()=>true;
  assert.equal(book.decide(claim(key),actor,present).code,'owned');
  assert.deepEqual(book.decide(claim(second),other,present),{code:'taken',lot:'l3'});
  assert.equal(book.entries.length,1);
  assert.deepEqual(book.decide(claim(second,'l2'),other,present),{code:'small',lot:'l3'});
  assert.equal(book.decide(claim(second,'l3'),other,present).code,'owned');
  assert.equal(book.decide(claim(second,'l4','release'),other,present).code,'invalid');
  assert.equal(book.decide(claim(key,'l1','release'),replacement,present).code,'other-device');
  assert.equal(book.decide(claim('C'.repeat(87),'l4'),other,present).code,'other-save');
});
test('a successor carries grace deadlines, requires the original credential and expires vacant lots',()=>{
  const book=new ParcelBook(homes);
  book.decide(claim(key),actor,()=>true);book.sweep(()=>false,3000);
  const successor=new ParcelBook(homes);
  assert.ok(successor.hydrate(book.revision,book.entries));
  successor.sweep(()=>false,3000+absenceGrace-1);assert.equal(successor.entries.length,1);
  assert.equal(successor.decide(claim(second,'l1','resume'),other,()=>false).code,'expired');
  assert.equal(successor.decide(claim(key,'l1','resume'),replacement,()=>false).code,'owned');
  assert.equal(successor.byLot('l1').actor,replacement);
  successor.sweep(()=>false,200000);successor.sweep(()=>false,200000+absenceGrace);
  assert.equal(successor.entries.length,0);assert.equal(successor.decide(claim(second),other,()=>true).code,'owned');
  assert.equal(book.byLot('l1').actor,actor);
  assert.equal(successor.hydrate(10,[...book.entries,...book.entries]),false);
  assert.equal(successor.byLot('l1').actor,other);
});

test('a returning public driver can request a fresh parcel snapshot from the same host',async()=>{
  const peer='rtc/driver',pub='current host',boot='current boot';
  const session={owner:true,id:'host',pub,boot,peers:new Map([[peer,actor]]),
    lobby:{members:new Map([[peer,{actor}]])},controls:new Map([[actor,{seq:1,parcelRevision:7}]]),
    actors:new Map([[actor,{id:actor,vehicle:'car',carModel:'wagon'}]])};
  const input={kind:'input',id:actor,authority:pub,seq:2,action:0,x:0,z:0};
  await StreetSession.prototype.receive.call(session,peer,input);
  assert.equal(session.controls.get(actor).parcelRevision,undefined);
  await StreetSession.prototype.receive.call(session,peer,{...input,seq:3,parcelBoot:boot,parcelRevision:7});
  assert.equal(session.controls.get(actor).parcelRevision,7);
  await StreetSession.prototype.receive.call(session,peer,input);
  assert.equal(session.controls.get(actor).parcelRevision,7);
  assert.equal(session.actors.get(actor).carModel,'wagon');
});
