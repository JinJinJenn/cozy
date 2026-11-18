import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvite, parseInvite, roomIdFor, sanitizeRoom } from '../src/invite.js';
import { Interpolator, lerpAngle } from '../src/interp.js';
import { NetSession } from '../src/net-session.js';

test('roomIdFor is deterministic and sensitive to seed and preset', () => {
  assert.equal(roomIdFor('petalwood', 'meadowCove'), roomIdFor('petalwood', 'meadowCove'));
  assert.notEqual(roomIdFor('petalwood', 'meadowCove'), roomIdFor('petalwood2', 'meadowCove'));
  assert.notEqual(roomIdFor('petalwood', 'meadowCove'), roomIdFor('petalwood', 'harborTown'));
  assert.match(roomIdFor(1, 'x'), /^island-[0-9a-f]{16}$/);
});

test('buildInvite / parseInvite round trip, incl. odd seeds', () => {
  const seed = 'clover 123&x=1';
  const url = buildInvite('http://127.0.0.1:4180/index.html?view=shore#frag', { seed, preset: 'pineHighlands' });
  assert.ok(!url.includes('view=') && !url.includes('#'));
  const p = parseInvite(url);
  assert.equal(p.seed, seed);
  assert.equal(p.preset, 'pineHighlands');
  assert.equal(p.room, roomIdFor(seed, 'pineHighlands'));
  assert.equal(p.derivedRoom, false); // buildInvite writes the room explicitly
});

test('parseInvite derives room when absent, rejects missing seed/preset, sanitizes room', () => {
  const p = parseInvite('http://h/?seed=a&preset=b');
  assert.equal(p.room, roomIdFor('a', 'b'));
  assert.equal(p.derivedRoom, true);
  assert.equal(parseInvite('http://h/?seed=a'), null);
  assert.equal(parseInvite('not a url'), null);
  assert.equal(parseInvite('http://h/?seed=a&preset=b&room=%3Cscript%3Ex').room, 'scriptx');
  assert.equal(sanitizeRoom('x'.repeat(200)).length, 64);
  const own = buildInvite('http://h/', { seed: 1, preset: 'p', room: 'friends-night' });
  assert.equal(parseInvite(own).room, 'friends-night');
});

test('Interpolator lerps between samples and handles yaw wrap', () => {
  const it = new Interpolator({ delayMs: 100 });
  it.push(1000, [0, 0, 0], [3.0, 0]);
  it.push(1100, [10, 0, 0], [-3.0, 0]);
  const s = it.sample(1150); // render time 1050 -> halfway
  assert.ok(Math.abs(s.p[0] - 5) < 1e-9);
  // 3.0 -> -3.0 is a short hop across PI (about 0.283 rad), not a 6 rad swing
  assert.ok(Math.abs(Math.abs(s.r[0]) - Math.PI) < 0.01, `yaw ${s.r[0]}`);
  assert.ok(Math.abs(lerpAngle(0.1, 6.2, 0.5)) < 0.1);
});

test('Interpolator extrapolation is capped and empty returns null', () => {
  const it = new Interpolator({ delayMs: 0, maxExtrapMs: 100 });
  assert.equal(it.sample(0), null);
  it.push(0, [0, 0, 0], [0, 0]);
  it.push(100, [10, 0, 0], [0, 0]);
  assert.ok(Math.abs(it.sample(150).p[0] - 15) < 1e-9);
  assert.ok(Math.abs(it.sample(10000).p[0] - 20) < 1e-9); // capped at +100ms
});

// A fake in-process transport hub proves NetSession logic (join/leave events, validation, send rate).
function hub() {
  const rooms = new Map();
  return {
    transport() {
      return {
        kind: 'fake',
        async join(room, h) {
          const id = 'f' + Math.random().toString(36).slice(2, 7);
          const set = rooms.get(room) || rooms.set(room, new Map()).get(room);
          for (const [oid, oh] of set) { oh.onPeerJoin(id); h.onPeerJoin(oid); }
          set.set(id, h);
          return {
            selfId: id,
            send: d => { for (const [oid, oh] of set) if (oid !== id) oh.onMessage(id, JSON.parse(JSON.stringify(d))); },
            leave: () => { set.delete(id); for (const oh of set.values()) oh.onPeerLeave(id); },
          };
        },
      };
    },
  };
}

test('NetSession: peers see each other, ~10Hz send, bad packets ignored, leave event', async t => {
  const hb = hub();
  const a = new NetSession({ transport: hb.transport(), room: 'r', name: 'A' });
  const b = new NetSession({ transport: hb.transport(), room: 'r', name: 'B' });
  t.after(() => { b.leave(); a.leave(); });
  const joins = [], leaves = [];
  a.on('peerjoin', p => joins.push(p.id));
  a.on('peerleave', p => leaves.push(p.id));
  await a.join(); await b.join();
  assert.equal(joins.length, 1);
  let x = 0;
  const mover = setInterval(() => b.setLocal([x++, 2, 3], [0.5, 0]), 16); // ~60Hz game loop
  t.after(() => clearInterval(mover));
  await new Promise(r => setTimeout(r, 1050));
  clearInterval(mover);
  const sent = b.stats.sent;
  assert.ok(sent >= 8 && sent <= 12, `sent ${sent}`); // throttled to ~10Hz despite 60Hz updates
  const before = b.stats.sent;
  await new Promise(r => setTimeout(r, 500)); // idle: only the 1s heartbeat may fire
  assert.ok(b.stats.sent - before <= 1, 'idle pose is not spammed');
  b.setLocal([9, 2, 3], [0.5, 0]);
  await new Promise(r => setTimeout(r, 250));
  const raw = a.getLatestRaw()[0];
  assert.deepEqual(raw.p, [9, 2, 3]);
  a._recv('x', { p: [NaN, 0, 0], r: [0, 0] }); a._recv('x', { p: [1, 2], r: [0, 0] }); a._recv('x', null);
  assert.equal(a.peers.has('x'), false);
  b.leave();
  assert.equal(leaves.length, 1);
  a.leave();
});
