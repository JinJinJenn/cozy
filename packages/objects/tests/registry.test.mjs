import test from 'node:test';
import assert from 'node:assert/strict';
import { IdGen, createLayerRegistry, createDefinitionRegistry, World, serializeWorld, deserializeWorld, isScheduledOn } from '../index.js';

test('ids are collision free across peers and survive restart', () => {
  const a = new IdGen('peerA');
  const b = new IdGen('peerB');
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    seen.add(a.next());
    seen.add(b.next());
  }
  assert.equal(seen.size, 1000);
  const a2 = new IdGen('peerA');
  a2.observe('peerA:500');
  a2.observe('peerB:9999');
  assert.equal(a2.next(), 'peerA:501');
  assert.throws(() => new IdGen('bad:id'));
});

test('layer registry has the required layer types with schema, actions and ui hook', () => {
  const reg = createLayerRegistry();
  for (const t of ['toggle', 'dim', 'tint', 'flicker', 'schedule', 'musicReactive', 'npcUse', 'linkedSwitch', 'sit', 'lounge', 'movable', 'decorate', 'socialSeat']) {
    const d = reg.get(t);
    assert.ok(d, t);
    assert.ok(d.ui.hook, `${t} ui hook`);
    assert.ok(Object.keys(d.actions).length > 0, `${t} actions`);
    assert.ok(Object.keys(reg.defaultState(t)).length > 0, `${t} state`);
  }
  assert.throws(() => reg.define({ type: 'toggle', ui: { hook: 'x' } }));
  assert.throws(() => reg.normalizeState('dim', { level: 2 }));
  assert.throws(() => reg.normalizeState('tint', { color: 'red' }));
  assert.throws(() => reg.validatePatch('sit', { occupant: 'x' }), /runtime/);
});

test('definitions: lamp and chair are multi-layer data with stable ids', () => {
  const layers = createLayerRegistry();
  const defs = createDefinitionRegistry(layers);
  const lamp = defs.get('lamp');
  const chair = defs.get('chair');
  assert.deepEqual(lamp.layers.map((l) => l.type), ['toggle', 'dim', 'tint', 'flicker', 'schedule', 'musicReactive', 'npcUse', 'linkedSwitch']);
  assert.deepEqual(chair.layers.map((l) => l.type), ['sit', 'lounge', 'movable', 'decorate', 'npcUse', 'socialSeat']);
  assert.throws(() => defs.define({ id: 'rock', layers: [{ key: 'a', type: 'toggle' }] }), /at least 2/);
  assert.throws(() => defs.define({ id: 'Bad Id', layers: [{ key: 'a', type: 'toggle' }, { key: 'b', type: 'dim' }] }));
  // instances are independent
  const a = defs.instantiate('lamp');
  a[0].state.on = false;
  assert.equal(defs.instantiate('lamp')[0].state.on, true);
});

test('world: actions through layers, linked switch effect, serialisation roundtrip', () => {
  const w = new World({ owner: 'alice' });
  const mkObj = (id, defId, pos) => assert.ok(w.apply({ kind: 'place', id: `alice:${id + 100}`, t: id, peer: 'alice', objectId: `alice:${id}`, defId, pos, rot: 370 }).ok);
  mkObj(1, 'lamp', [0, 0, 0]);
  mkObj(2, 'lamp', [3, 0, 0]);
  assert.equal(w.get('alice:1').rot, 10);
  const act = (o, l, a, p) => w.apply({ kind: 'act', id: 'alice:900', t: 9, peer: 'alice', objectId: o, layerId: l, action: a, params: p });
  assert.ok(act('alice:1', 'dim', 'step', { delta: -0.25 }).ok);
  assert.equal(w.get('alice:1').layers[1].state.level, 0.75);
  assert.ok(act('alice:1', 'tint', 'set', { color: '#AABBCC' }).ok);
  assert.equal(w.get('alice:1').layers[2].state.color, '#aabbcc');
  assert.equal(act('alice:1', 'dim', 'set', { level: 5 }).code, 'bad-value');
  assert.ok(w.apply({ kind: 'setLayerState', id: 'alice:901', t: 10, peer: 'alice', objectId: 'alice:1', layerId: 'link', patch: { targets: ['alice:2'] } }).ok);
  assert.ok(act('alice:2', 'toggle', 'set', { on: false }).ok);
  assert.ok(act('alice:1', 'link', 'flip').ok);
  assert.equal(w.get('alice:1').layers[7].state.on, true);
  assert.equal(w.get('alice:2').layers[0].state.on, true); // mirrored to the linked lamp
  const text = serializeWorld(w);
  assert.equal(serializeWorld(deserializeWorld(text)), text);
  assert.ok(w.describeUI('alice:1').every((d) => d.hook && d.layerId));
});

test('schedule helper handles overnight windows', () => {
  assert.equal(isScheduledOn({ enabled: true, onHour: 18, offHour: 23 }, 20), true);
  assert.equal(isScheduledOn({ enabled: true, onHour: 22, offHour: 6 }, 2), true);
  assert.equal(isScheduledOn({ enabled: true, onHour: 22, offHour: 6 }, 12), false);
  assert.equal(isScheduledOn({ enabled: false, onHour: 1, offHour: 2 }, 1), null);
});
