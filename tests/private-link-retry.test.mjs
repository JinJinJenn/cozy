import test from 'node:test';
import assert from 'node:assert/strict';
import {StreetSession} from '../src/street-session.js';

test('private guest renews only its wide connection and backs off until a host frame arrives',async()=>{
  const local={},stale={leave:async()=>{throw Error('Already closed');}},events=[];
  const guest={id:'same-visitor',wide:Promise.resolve(),connections:[local,stale],privateWire:stale,retryPrivateAt:18000,
    joinPrivateWire(){events.push('join');this.privateWire={leave:()=>events.push('left')};this.connections.push(this.privateWire);}};
  const retry=t=>StreetSession.prototype.retryPrivateWire.call(guest,t);
  await retry(17000);assert.deepEqual(events,[]);
  await Promise.all([retry(18000),retry(18000)]);assert.deepEqual(events,['join']);
  assert.equal(guest.id,'same-visitor');assert.deepEqual(guest.connections,[local,guest.privateWire]);
  await retry(53999);assert.deepEqual(events,['join']);await retry(54000);assert.deepEqual(events,['join','left','join']);
  guest.connected=true;await retry(120000);assert.deepEqual(events,['join','left','join']);
  guest.connected=false;guest.owner=true;await retry(120000);assert.deepEqual(events,['join','left','join']);
});

test('closing a visitor during reconnection cancels the new join',async()=>{
  let finish;const local={},old={leave:()=>new Promise(resolve=>{finish=resolve;})};
  const s={wide:Promise.resolve(),connections:[local,old],privateWire:old,retryPrivateAt:0,joinPrivateWire(){assert.fail('Joined after closing');}};
  const retry=StreetSession.prototype.retryPrivateWire.call(s,20000);
  await Promise.resolve();s.closed=true;finish();await retry;
  assert.deepEqual(s.connections,[local]);assert.equal(s.retrying,false);
});
