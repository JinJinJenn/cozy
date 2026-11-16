import test from 'node:test';
import assert from 'node:assert/strict';
import { Replica } from '../index.js';
import { mk, sync, syncAll, layerState } from './helpers.mjs';

const W = (r) => JSON.stringify(r.world.toJSON());

// owner alice grants bob and carol builder; returns synced trio
function trio() {
  const a = mk('alice');
  const b = mk('bob');
  const c = mk('carol');
  a.setRole('bob', 'builder');
  a.setRole('carol', 'builder');
  syncAll(a, b, c);
  return [a, b, c];
}

// ---- convergence -----------------------------------------------------------

test('two replicas converge when concurrent ops arrive in different orders', () => {
  const [a, b] = trio();
  const lamp = a.place('lamp', { pos: [1, 0, 1] });
  sync(b, a);
  // concurrent edits, nobody has seen the other side yet
  a.move(lamp.objectId, [5, 0, 5]);
  a.setLayerState(lamp.objectId, 'tint', { color: '#ff0000' });
  b.move(lamp.objectId, [9, 0, 9]);
  b.setLayerState(lamp.objectId, 'tint', { color: '#0000ff' });
  b.setLayerState(lamp.objectId, 'dim', { level: 0.2 });
  b.act(lamp.objectId, 'toggle', 'toggle');
  a.act(lamp.objectId, 'toggle', 'toggle');
  sync(a, b);
  sync(b, a);
  assert.equal(W(a), W(b));
  assert.equal(layerState(a, lamp.objectId, 'dim').level, 0.2);
});

test('replicas receiving the same ops in many shuffled orders end identical', () => {
  const [a, b, c] = trio();
  const o1 = a.place('lamp');
  const o2 = b.place('chair', { pos: [2, 0, 0] });
  const o3 = c.place('bench', { pos: [4, 0, 0] });
  syncAll(a, b, c);
  a.move(o1.objectId, [1, 1, 1]);
  b.rotate(o1.objectId, 90);
  c.setLayerState(o1.objectId, 'tint', { color: '#123456' });
  b.act(o2.objectId, 'sit', 'sit');
  c.act(o2.objectId, 'sit', 'sit');
  a.remove(o3.objectId);
  c.move(o3.objectId, [7, 0, 7]);
  a.addLayer(o1.objectId, 'decorate');
  const all = [a, b, c].flatMap((r) => r.log.filter((op) => op.peer === r.peerId));
  const ref = mk('ref');
  for (const op of all) ref.receive(op);
  const expected = W(ref);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 25; i++) {
    const shuffled = [...all].sort(() => rnd() - 0.5);
    const r = mk('viewer' + i);
    for (const op of shuffled) r.receive(op);
    r.receive(shuffled[0]); // duplicate delivery is a no-op
    assert.equal(W(r), expected, `shuffle ${i}`);
  }
});

test('ops that arrive before the role grant converge to the same verdict', () => {
  const a = mk('alice');
  const b = mk('bob');
  const grant = a.setRole('bob', 'builder');
  sync(b, a);
  const placed = b.place('lamp');
  const late = mk('late');
  late.receive(b.log.find((o) => o.id === placed.opId)); // before the grant is known
  assert.equal(late.world.get(placed.objectId), null);
  late.receive(a.log.find((o) => o.id === grant.opId));
  assert.ok(late.world.get(placed.objectId));
  sync(a, b);
  assert.equal(W(late), W(a));
});

test('revoking builder takes effect for later ops', () => {
  const [a, b] = trio();
  const o = b.place('lamp');
  sync(a, b);
  a.setRole('bob', 'visitor');
  sync(b, a);
  assert.equal(b.role, 'visitor');
  assert.throws(() => b.move(o.objectId, [1, 0, 0]), /forbidden/);
});

// ---- roles -----------------------------------------------------------------

test('role enforcement: visitor acts but cannot build, only owner grants', () => {
  const a = mk('alice');
  const v = mk('vera');
  const lamp = a.place('lamp');
  sync(v, a);
  assert.throws(() => v.place('lamp'), /forbidden/);
  assert.throws(() => v.move(lamp.objectId, [1, 0, 0]), /forbidden/);
  assert.throws(() => v.setLayerState(lamp.objectId, 'tint', { color: '#000000' }), /forbidden/);
  assert.throws(() => v.setRole('vera', 'builder'), /owner-only/);
  v.act(lamp.objectId, 'toggle', 'toggle'); // visitors may use objects
  sync(a, v);
  assert.equal(layerState(a, lamp.objectId, 'toggle').on, false);
  a.setRole('vera', 'builder');
  sync(v, a);
  assert.equal(v.role, 'builder');
  v.move(lamp.objectId, [3, 0, 0]);
  const b = mk('bob');
  a.setRole('bob', 'builder');
  syncAll(a, b, v);
  assert.throws(() => b.setRole('vera', 'visitor'), /owner-only/);
  assert.throws(() => a.setRole('alice', 'visitor'), /bad-target/);
});

test('forged ops from a visitor are rejected on remote replicas', () => {
  const a = mk('alice');
  const lamp = a.place('lamp');
  const forged = { id: 'evil:50', t: 99, peer: 'evil', kind: 'remove', objectId: lamp.objectId };
  assert.deepEqual(a.receive(forged), { ok: false, code: 'forbidden' });
  assert.ok(a.world.get(lamp.objectId).alive);
  assert.equal(a.receive({ id: 'evil:51', t: 100, peer: 'other', kind: 'remove' }).code, 'bad-envelope');
  // setLayerState cannot forge occupancy even for a builder
  a.setRole('evil', 'builder');
  const chair = a.place('chair');
  const forgedSeat = { id: 'evil:52', t: 120, peer: 'evil', kind: 'setLayerState', objectId: chair.objectId, layerId: 'sit', patch: { occupant: 'x' } };
  assert.equal(a.receive(forgedSeat).code, 'runtime-field');
});

// ---- non-modal build -------------------------------------------------------

test('non-modal: live actions work while others build; removed objects refuse them', () => {
  const [a, b, c] = trio();
  const lamp = a.place('lamp');
  syncAll(a, b, c);
  // builder retunes the lamp while another peer uses it concurrently
  b.setLayerState(lamp.objectId, 'tint', { color: '#00ff00' });
  b.setLayerState(lamp.objectId, 'flicker', { enabled: true });
  c.act(lamp.objectId, 'toggle', 'toggle');
  c.act(lamp.objectId, 'dim', 'set', { level: 0.5 });
  syncAll(a, b, c);
  const s = (id) => layerState(a, lamp.objectId, id);
  assert.equal(s('toggle').on, false);
  assert.equal(s('dim').level, 0.5);
  assert.equal(s('tint').color, '#00ff00');
  assert.equal(s('flicker').enabled, true);
  assert.equal(W(a), W(c));
  // after removal, live actions are refused everywhere
  a.remove(lamp.objectId);
  sync(c, a);
  assert.throws(() => c.act(lamp.objectId, 'toggle', 'toggle'), /removed/);
  syncAll(a, b, c);
  assert.equal(W(a), W(b));
  assert.equal(W(a), W(c));
});

// ---- occupancy -------------------------------------------------------------

test('occupancy: a seat in use cannot be removed, moved or have its layer removed', () => {
  const [a, b, c] = trio();
  const chair = a.place('chair', { pos: [0, 0, 0] });
  syncAll(a, b, c);
  c.act(chair.objectId, 'sit', 'sit');
  sync(a, c);
  assert.throws(() => a.remove(chair.objectId), /in-use/);
  assert.throws(() => a.move(chair.objectId, [1, 0, 0]), /in-use/);
  assert.throws(() => a.removeLayer(chair.objectId, 'sit'), /in-use/);
  a.rotate(chair.objectId, 45); // turning a chair is fine
  sync(b, a);
  assert.throws(() => b.act(chair.objectId, 'sit', 'sit'), /seat-in-use/);
  assert.throws(() => b.act(chair.objectId, 'lounge', 'lounge'), /seat-in-use/);
  assert.throws(() => b.act(chair.objectId, 'move', 'nudge', { dx: 1 }), /in-use/);
  assert.throws(() => b.act(chair.objectId, 'sit', 'stand'), /not-you/);
  c.act(chair.objectId, 'sit', 'stand');
  syncAll(a, b, c);
  a.move(chair.objectId, [2, 0, 0]);
  a.remove(chair.objectId);
});

test('occupancy: npc use and social seats count, builders can evict', () => {
  const a = mk('alice');
  const chair = a.place('chair');
  a.act(chair.objectId, 'npc', 'claim', { who: 'npc:cat1' });
  assert.throws(() => a.remove(chair.objectId), /in-use/);
  a.act(chair.objectId, 'npc', 'evict');
  a.remove(chair.objectId);
  const bench = a.place('bench');
  a.act(bench.objectId, 'social', 'join', { who: 'npc:a' });
  a.act(bench.objectId, 'social', 'join', { who: 'npc:b' });
  a.act(bench.objectId, 'social', 'join', { who: 'npc:c' });
  assert.throws(() => a.act(bench.objectId, 'social', 'join', { who: 'npc:d' }), /seat-in-use/);
  assert.throws(() => a.act(bench.objectId, 'social', 'join', { who: 'bob' }), /not-you/);
  assert.throws(() => a.move(bench.objectId, [1, 0, 0]), /in-use/);
  a.act(bench.objectId, 'social', 'evict');
  a.move(bench.objectId, [1, 0, 0]);
});

test('occupancy: concurrent sit vs remove resolves identically on both replicas', () => {
  for (const sitFirst of [true, false]) {
    const a = mk('alice');
    const c = mk('carol');
    a.setRole('carol', 'builder');
    const chair = a.place('chair');
    sync(c, a);
    // both made without seeing each other
    if (sitFirst) {
      c.act(chair.objectId, 'sit', 'sit');
      a.remove(chair.objectId);
    } else {
      a.remove(chair.objectId);
      c.act(chair.objectId, 'sit', 'sit');
    }
    syncAll(a, c);
    assert.equal(W(a), W(c));
    const obj = a.world.get(chair.objectId);
    // exactly one of: removal won (nobody seated) or sit won (chair alive and occupied)
    const sitWon = obj.alive && obj.layers[0].state.occupant === 'carol';
    const removeWon = !obj.alive && obj.layers[0].state.occupant === null;
    assert.ok(sitWon !== removeWon);
  }
});

// ---- undo ------------------------------------------------------------------

test('per-builder undo and redo over every undoable op', () => {
  const [a, b] = trio();
  const lamp = b.place('lamp', { pos: [1, 0, 1] });
  b.move(lamp.objectId, [4, 0, 4]);
  b.rotate(lamp.objectId, 90);
  b.setLayerState(lamp.objectId, 'tint', { color: '#ff0000' });
  const extra = b.addLayer(lamp.objectId, 'decorate');
  b.removeLayer(lamp.objectId, 'flicker');
  sync(a, b);
  const obj = () => b.world.get(lamp.objectId);

  b.undo(); // removeLayer
  assert.equal(obj().layers[3].id, 'flicker'); // back at its original index
  b.undo(); // addLayer
  assert.ok(!obj().layers.some((l) => l.id === extra.layerId));
  b.undo(); // setLayerState
  assert.equal(layerState(b, lamp.objectId, 'tint').color, '#ffd9a0');
  b.undo(); // rotate
  assert.equal(obj().rot, 0);
  b.undo(); // move
  assert.deepEqual(obj().pos, [1, 0, 1]);
  b.undo(); // place => removed
  assert.equal(obj().alive, false);
  assert.equal(b.canUndo(), false);
  assert.equal(b.undo(), null);

  b.redo(); // place again
  assert.equal(obj().alive, true);
  b.redo();
  assert.deepEqual(obj().pos, [4, 0, 4]);
  sync(a, b);
  assert.equal(W(a), W(b));

  b.rotate(lamp.objectId, 10); // a fresh edit clears redo
  assert.equal(b.canRedo(), false);
});

test('undo is per builder and restore-after-remove keeps layer state', () => {
  const [a, b] = trio();
  const chair = a.place('chair');
  sync(b, a);
  b.move(chair.objectId, [3, 0, 0]);
  const bDepth = b.undoStack.length;
  a.move(chair.objectId, [8, 0, 0]);
  sync(b, a);
  assert.equal(b.undoStack.length, bDepth); // alice move is not on bob stack
  b.undo(); // bob inverse: back to where the chair was when bob moved it
  sync(a, b);
  assert.deepEqual(a.world.get(chair.objectId).pos, [0, 0, 0]);
  a.act(chair.objectId, 'decorate', 'add', { item: 'cushion' });
  a.remove(chair.objectId);
  a.undo();
  assert.equal(a.world.get(chair.objectId).alive, true);
  assert.deepEqual(layerState(a, chair.objectId, 'decorate').items, ['cushion']);
});

test('undo of a placement is refused while the seat is occupied; entry stays', () => {
  const [a, b] = trio();
  const chair = a.place('chair');
  sync(b, a);
  b.act(chair.objectId, 'sit', 'sit');
  sync(a, b);
  assert.throws(() => a.undo(), /in-use/);
  assert.equal(a.canUndo(), true);
  b.act(chair.objectId, 'sit', 'stand');
  sync(a, b);
  a.undo();
  assert.equal(a.world.get(chair.objectId).alive, false);
});

// ---- highlights, serialisation ---------------------------------------------

test('soft highlights: who is editing what, from focus and recent build ops', () => {
  const [a, b] = trio();
  const lamp = a.place('lamp');
  sync(b, a);
  b.setLayerState(lamp.objectId, 'tint', { color: '#00ffff' });
  sync(a, b);
  a.act(lamp.objectId, 'toggle', 'toggle'); // live actions are not highlighted
  const hl = a.highlights();
  const bobs = hl.find((h) => h.peerId === 'bob');
  assert.equal(bobs.type, 'soft-highlight');
  assert.equal(bobs.objectId, lamp.objectId);
  assert.equal(bobs.layerId, 'tint');
  assert.match(bobs.color, /^#[0-9a-f]{6}$/);
  assert.ok(a.highlights({ excludeSelf: true }).every((h) => h.peerId !== 'alice'));
  // explicit focus travels as an ephemeral message
  const msg = b.focus(lamp.objectId, 'dim');
  assert.equal(a.receivePresence(msg), true);
  assert.equal(a.receivePresence(msg), false);
  assert.equal(a.highlights().find((h) => h.peerId === 'bob').layerId, 'dim');
  a.receivePresence(b.clearFocus());
  // stale highlights age out
  for (let i = 0; i < 70; i++) a.act(lamp.objectId, 'toggle', 'toggle');
  assert.equal(a.highlights().length, 0);
});

test('replica snapshot roundtrip rebuilds the same world and keeps counters safe', () => {
  const [a, b] = trio();
  const lamp = b.place('lamp');
  b.setLayerState(lamp.objectId, 'tint', { color: '#112233' });
  const chair = a.place('chair');
  a.act(chair.objectId, 'sit', 'sit');
  syncAll(a, b);
  const text = JSON.stringify(b.toJSON());
  const b2 = Replica.fromJSON(JSON.parse(text), { peerId: 'bob' });
  assert.equal(W(b2), W(b));
  assert.equal(b2.serialize(), b.serialize());
  const next = b2.place('lamp');
  assert.ok(!b.seen.has(next.opId) && !b.world.get(next.objectId));
  assert.equal(Replica.fromJSON(JSON.parse(text), { peerId: 'zed' }).role, 'visitor');
});

test('malformed ops never enter the log', () => {
  const a = mk('alice');
  const bads = [null, 5, {}, { id: 'alice:1', t: 1, peer: 'alice', kind: 'explode' }, { id: 'alice:1', t: 0, peer: 'alice', kind: 'move' }, { id: 'nope', t: 1, peer: 'alice', kind: 'move' }];
  for (const bad of bads) assert.equal(a.receive(bad).ok, false);
  assert.equal(a.log.length, 1 - 1);
  const badPos = { id: 'alice:1', t: 1, peer: 'alice', kind: 'place', objectId: 'alice:2', defId: 'lamp', pos: [0, 'x', 0] };
  assert.equal(a.receive(badPos).code, 'bad-transform');
});
