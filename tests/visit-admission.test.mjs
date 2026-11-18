import test from 'node:test';
import assert from 'node:assert/strict';
import {VisitAdmission} from '../src/visit-admission.js';

const input=()=>({id:crypto.randomUUID(),visitTicket:crypto.randomUUID(),profile:{name:'River',shirt:'denim'}});

test('a household admits separate visits, preserves a grant across routes and reports a full house',()=>{
  const door=new VisitAdmission(true),a=input(),b=input(),reports=[];
  const check=(route,guest,t=1,full=false)=>door.check(route,guest,t,v=>reports.push(v),full);
  assert.equal(check('local/a',a),false);assert.equal(check('rtc/a',a),false);
  assert.equal(check('rtc/b',b),false);assert.equal(door.waiting.length,2);
  door.decide(a.visitTicket,true);door.decide(b.visitTicket,false);
  assert.equal(check('local/a',a,2,true),false);assert.equal(reports.at(-1),'full');
  assert.ok(check('local/a',a));door.leave('local/a');
  assert.ok(check('rtc/a',a));assert.ok(check('backup/a',a));
  assert.equal(check('rtc/b',b),false);assert.equal(reports.at(-1),'declined');
  door.required=false;assert.equal(check('rtc/b',b),false);
  assert.equal(check('rtc/c',{...a,visitTicket:crypto.randomUUID()}),false);
  door.sweep(90000);assert.equal(door.visits.size,0);
});

test('closing a waiting tab clears the owner prompt and existing open invites work on old clients',()=>{
  const door=new VisitAdmission(false),a=input(),b=input(),report=()=>{};
  delete a.visitTicket;
  assert.ok(door.check('local/a',a,0,report));assert.ok(door.check('rtc/a',a,1,report));
  door.required=true;assert.ok(door.check('rtc/a',a,2,report));
  assert.equal(door.check('new/a',a,2,report),false);
  assert.equal(door.check('local/b',b,2,report),false);
  assert.equal(door.check('rtc/b',b,3,report),false);
  door.leave('local/b');assert.equal(door.waiting.length,1);
  door.leave('rtc/b');assert.equal(door.waiting.length,0);
});
