import test from 'node:test';
import assert from 'node:assert/strict';
import {PrivateRoutes} from '../src/private-routes.js';
import {StreetSession} from '../src/street-session.js';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup(owner=false,delayPrimary){
  const events=[],local={};
  const session={owner,connections:[local],attachPrivate:async()=>{}};
  const routes=new PrivateRoutes(session,async strategy=>{
    events.push('join '+strategy);
    if(strategy==='nostr')await delayPrimary;
    return {strategy,leave:async()=>events.push('leave '+strategy)};
  });
  routes.start(0);
  return {routes,session,events,local};
}

test('a host listens on both private strategies and a healthy guest uses only the primary',async()=>{
  const host=setup(true),guest=setup();
  await settle();
  host.routes.tick(100000);
  guest.session.connected=true;guest.routes.confirmed('trystero-nostr',40);guest.routes.tick(100000);
  assert.deepEqual(host.events,['join nostr','join torrent']);
  assert.deepEqual(guest.events,['join nostr']);
});

test('a stalled primary never blocks fallback and a late primary closes after signed admission',async()=>{
  let release;
  const {routes,session,events,local}=setup(false,new Promise(resolve=>release=resolve));
  routes.tick(8999);assert.deepEqual(events,['join nostr']);
  routes.tick(9000);routes.tick(9001);await settle();
  session.connected=true;routes.confirmed('trystero-torrent',10000);
  release();await settle();
  assert.deepEqual(events,['join nostr','join torrent','leave nostr']);
  assert.equal(session.connections[0],local);
  assert.deepEqual(session.connections.slice(1).map(c=>c.strategy),['torrent']);
  session.connected=false;routes.tick(19000);await settle();
  routes.confirmed('trystero-nostr',19200);await settle();
  assert.deepEqual(events.slice(-2),['join nostr','leave torrent']);
});

test('unanswered joins renew with backoff and stop on dispose or local admission',async()=>{
  const {routes,events,session,local}=setup();
  routes.tick(9000);await settle();routes.tick(26999);assert.equal(events.length,2);
  routes.tick(27000);await settle();
  assert.deepEqual(events,['join nostr','join torrent','leave nostr','leave torrent','join nostr','join torrent']);
  routes.tick(62999);assert.equal(events.length,6);
  routes.confirmed('broadcast',63000);await settle();
  assert.deepEqual(session.connections,[local]);
  session.closed=true;routes.tick(200000);assert.equal(events.length,8);
});

test('leaving the page during an outstanding private join releases the arriving connection',async()=>{
  let release;
  const {session,events,local}=setup(false,new Promise(resolve=>release=resolve));
  session.closed=true;release();await settle();
  assert.deepEqual(session.connections,[local]);assert.deepEqual(events,['join nostr','leave nostr']);
});

test('a host sends one signed city snapshot per occupied route and skips idle discovery links',async()=>{
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  const sent=[],hostCards=new Map();
  for(const kind of ['broadcast','trystero-nostr','trystero-torrent']){
    hostCards.set(kind,{connection:{send:packet=>sent.push([kind,packet])}});
  }
  const session={privateKey:keys.privateKey,hostCards,connections:[...hostCards.values()].map(v=>v.connection),
    peers:new Map([['trystero-nostr/a','a'],['trystero-nostr/b','b']]),town:{people:[]},actors:new Map(),seq:0};
  await StreetSession.prototype.broadcast.call(session);
  assert.deepEqual(sent.map(([kind])=>kind),['trystero-nostr']);
  session.peers.set('trystero-torrent/c','c');sent.length=0;
  await StreetSession.prototype.broadcast.call(session);
  assert.deepEqual(sent.map(([kind])=>kind),['trystero-nostr','trystero-torrent']);
  assert.equal(sent[0][1],sent[1][1]);assert.equal(sent[0][1].kind,'frame');
});
