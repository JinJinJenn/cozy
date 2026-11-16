import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, buildContext, NPC_PEER } from '../index.js';
import { Replica } from '../../objects/index.js';

const PRESETS = ['harborTown', 'meadowCove', 'pineHighlands', 'sandbarArchipelago'];
const CFG = { seed: 'sim-test', preset: 'harborTown', npcCount: 8 };
const ctxFor = (preset) => buildContext({ seed: 'sim-test', preset });
const TPD = 2880; // ticks per sim day at defaults
const ticksAt = (h) => Math.round(((h - 5) * 1440) / 24 / 0.5); // tick when the clock reads hour h on day 1

test('same seed and same steps give identical snapshot hash', () => {
  const ctx = ctxFor('harborTown');
  const a = Sim.create(CFG, { ctx }).advance(TPD + 500);
  const b = Sim.create(CFG, { ctx }).advance(TPD + 500);
  assert.equal(a.hash(), b.hash());
  const c = Sim.create({ ...CFG, seed: 'other' }).advance(TPD);
  assert.notEqual(a.hash(), c.hash());
});

test('tickDt accumulates frame time into whole fixed steps', () => {
  const ctx = ctxFor('harborTown');
  const a = Sim.create(CFG, { ctx });
  const b = Sim.create(CFG, { ctx });
  for (let i = 0; i < 600; i++) a.tickDt(1 / 2);
  b.advance(600);
  assert.equal(a.hash(), b.hash());
  const c = Sim.create(CFG, { ctx });
  for (let i = 0; i < 300; i++) c.tickDt(1); // two steps per call
  assert.equal(c.hash(), b.hash());
});

test('snapshot restore continues identically (through JSON text)', () => {
  const ctx = ctxFor('harborTown');
  const a = Sim.create(CFG, { ctx }).advance(1500);
  a.submit({ type: 'music', id: 'm1', x: 0, z: 0 });
  a.advance(50);
  const text = JSON.stringify(a.toJSON());
  const b = Sim.fromJSON(JSON.parse(text), { ctx });
  assert.equal(b.hash(), a.hash());
  a.advance(TPD);
  b.advance(TPD);
  assert.equal(a.hash(), b.hash());
});

test('state is replayable from config + input log', () => {
  const ctx = ctxFor('harborTown');
  const a = Sim.create(CFG, { ctx });
  a.advance(ticksAt(9));
  const npc = a.npcs[0];
  a.submit({ type: 'player', id: 'p1', x: npc.pos[0], z: npc.pos[1] });
  a.advance(200);
  a.submit({ type: 'music', id: 'm1', x: npc.pos[0], z: npc.pos[1], radius: 30 });
  a.submit({ type: 'weather', state: 'rain' });
  a.advance(400);
  a.submit({ type: 'music', id: 'm1', on: false });
  a.advance(TPD);
  const b = Sim.replay(CFG, a.inputLog, a.tick, { ctx });
  assert.equal(b.hash(), a.hash());
  assert.equal(b.weather().state, 'rain');
});

test('all NPCs are home and asleep at night, on every preset', () => {
  for (const preset of PRESETS) {
    const sim = Sim.create({ ...CFG, preset }, { ctx: ctxFor(preset) });
    for (let i = 0; i < TPD * 3; i += 20) {
      sim.advance(20);
      const h = sim.clock().hour;
      if (h >= 22.5 || h < 5.5) {
        for (const n of sim.npcs) {
          const d = Math.hypot(n.pos[0] - n.home.x, n.pos[1] - n.home.z);
          assert.ok(d < 3.5 && n.sleeping, `${preset} ${n.id} at ${sim.clock().label}: ${d.toFixed(1)} m from home, sleeping=${n.sleeping}`);
        }
      }
    }
    assert.equal(sim.stats.teleports, 0, `${preset}: NPCs should walk home, not be teleported`);
  }
});

test('no NPC is stuck, and none enters the sea', () => {
  for (const preset of PRESETS) {
    const ctx = ctxFor(preset);
    const sim = Sim.create({ ...CFG, preset }, { ctx });
    const N = 60;
    for (let i = 0; i < TPD * 3; i++) {
      sim.step();
      if (i % 5 === 0) {
        for (const p of sim.positions()) assert.ok(ctx.nav.height(p.x, p.z) > -0.3, `${preset} ${p.id} in the sea at ${sim.clock().label}`);
      }
    }
    assert.ok(sim.stats.maxStuck <= N, `${preset}: maxStuck ${sim.stats.maxStuck}`);
    assert.ok(sim.log.some((e) => e.kind === 'wander'), `${preset}: nobody wandered`);
    assert.ok(sim.log.some((e) => e.kind === 'sitAndRest'), `${preset}: nobody sat`);
  }
});

test('NPCs use objects through a distinct peer and the occupancy rules hold', () => {
  const sim = Sim.create(CFG, { ctx: ctxFor('harborTown') }).advance(TPD * 2);
  const acts = sim.objects.log.filter((o) => o.kind === 'act');
  assert.ok(acts.length > 20);
  assert.ok(acts.every((o) => o.peer === NPC_PEER && o.peer !== 'host'));
  const kinds = new Set(acts.map((o) => `${o.layerId}.${o.action}`));
  for (const k of ['npc.claim', 'npc.release', 'toggle.set']) assert.ok(kinds.has(k), k);
  assert.ok(kinds.has('sit.sit') || kinds.has('social.join'));
  // every op was accepted (a refused seat would show up as an inert op)
  assert.ok(sim.objects.log.every((o) => sim.objects.results.get(o.id).ok));
  // nobody holds a seat that is not theirs: occupants match sim bookkeeping
  const holders = new Set(sim.npcs.filter((n) => n.seat).map((n) => `npc:${n.id}`));
  for (const o of sim.objects.world.list()) {
    for (const l of o.layers) {
      const users = l.type === 'sit' ? [l.state.occupant].filter(Boolean) : l.type === 'socialSeat' ? l.state.occupants : [];
      for (const u of users) assert.ok(holders.has(u), `${o.id} held by ${u} but no NPC claims to sit there`);
    }
  }
  // a player replica fed with the ops sees the NPC seats and lamps
  const player = new Replica({ worldId: 'island', owner: 'host', peerId: 'alice' });
  for (const op of sim.objectOps()) player.receive(op);
  assert.equal(player.world.list().length, sim.objects.world.list().length);
  const lamp = player.world.list().find((o) => o.defId === 'lamp');
  assert.ok(lamp);
});

test('lamps follow the day: on after dusk, off after dawn', () => {
  const sim = Sim.create(CFG, { ctx: ctxFor('harborTown') });
  sim.advance(ticksAt(23));
  const lamps = () => sim.objects.world.list().filter((o) => o.defId === 'lamp');
  const on = lamps().filter((o) => o.layers.find((l) => l.id === 'toggle').state.on).length;
  assert.ok(on >= lamps().length * 0.5, `${on}/${lamps().length} lamps on at 23:00`);
  sim.advance(TPD - ticksAt(23) + ticksAt(11)); // next day 11:00
  const on2 = lamps().filter((o) => o.layers.find((l) => l.id === 'toggle').state.on).length;
  assert.ok(on2 <= lamps().length * 0.5, `${on2}/${lamps().length} lamps on at 11:00`);
});

test('music event gathers NPCs, the end of it releases them', () => {
  const ctx = ctxFor('harborTown');
  const sim = Sim.create(CFG, { ctx }).advance(ticksAt(9));
  const src = sim.npcs[0].home;
  sim.submit({ type: 'music', id: 'band', x: src.door[0], z: src.door[1], radius: 40 });
  sim.advance(600);
  const listened = new Set(sim.log.filter((e) => e.kind === 'listen' && e.music === 'band').map((e) => e.who));
  assert.ok(listened.size >= 2, `only ${listened.size} NPCs came to the music`);
  const near = sim.npcs.filter((n) => Math.hypot(n.pos[0] - src.door[0], n.pos[1] - src.door[1]) < 30).length;
  assert.ok(near >= 2, `${near} NPCs near the band`);
  sim.submit({ type: 'music', id: 'band', on: false });
  sim.advance(4);
  assert.ok(sim.npcs.every((n) => !n.action || n.action.kind !== 'listen'));
});

test('player nearby event makes an NPC walk over and greet', () => {
  const sim = Sim.create(CFG, { ctx: ctxFor('harborTown') }).advance(ticksAt(9));
  const target = sim.npcs.find((n) => sim.ctx.nav.land(n.pos[0], n.pos[1]) && !n.sleeping);
  assert.ok(target);
  sim.submit({ type: 'player', id: 'alice', x: target.pos[0] + 6, z: target.pos[1] });
  sim.advance(600);
  const greets = sim.log.filter((e) => e.kind === 'greet');
  assert.ok(greets.length >= 1, 'nobody greeted the player');
  assert.equal(greets[0].with, 'player:alice');
  assert.ok(sim.stats.greets >= 1);
});

test('weather hook is exposed and overridable', () => {
  const sim = Sim.create(CFG, { ctx: ctxFor('harborTown') });
  assert.ok(['clear', 'overcast', 'rain', 'fog'].includes(sim.weather().state));
  sim.submit({ type: 'weather', state: 'fog' });
  sim.step();
  assert.deepEqual(sim.weather(), { state: 'fog', source: 'event' });
  sim.submit({ type: 'weather', state: 'auto' });
  sim.step();
  assert.equal(sim.weather().source, 'auto');
});

test('NPC count and homes: 5..12 NPCs, each on a buildable lot', () => {
  const ctx = ctxFor('harborTown');
  assert.equal(Sim.create({ ...CFG, npcCount: 2 }, { ctx }).npcs.length, 5);
  assert.equal(Sim.create({ ...CFG, npcCount: 50 }, { ctx }).npcs.length, 12);
  const sim = Sim.create(CFG, { ctx });
  for (const n of sim.npcs) assert.ok(ctx.lotsById.get(n.home.lotId).buildable);
});
