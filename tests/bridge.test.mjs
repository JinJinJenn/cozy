import assert from 'node:assert/strict';
import test from 'node:test';
import {generate} from '../packages/island-gen/index.js';
import {generateSettlement, createFlattenHook} from '../packages/settlement/index.js';
import {bridgeDecks} from '../src/bridge-decks.js';
import {bridgeHeightAt, bridgeProfile} from '../src/bridge-profile.js';

test('both Harbor bridge lanes stay above the water and meet their banks at a drivable grade', () => {
  const generated = generate({preset: 'harborTown', seed: 'petalwood'}), island = generated.island;
  const plan = generateSettlement(generated);
  generated.heightfield.set(createFlattenHook(plan)(generated));
  const deck = bridgeDecks(island, plan.roads);
  const workerHeight = bridgeHeightAt(island.sample, structuredClone(deck.spans));
  const x = -56.84519528065321, z = -309.78347702380717;
  assert.ok(deck.heightAt(x, z) > island.waterAt(x, z) + .2, 'previously submerged outbound tire track');
  for (const {a, b, radius} of deck.spans) {
    assert.ok(Math.abs(b[2] - a[2]) <= .12001 * (b[5] - a[5]));
    const dx = b[0] - a[0], dz = b[1] - a[1];
    for (const side of [-radius, radius]) {
      const ex = dx + side * (b[3] - a[3]), ez = dz + side * (b[4] - a[4]);
      assert.ok(dx * ex + dz * ez > 0, 'inside parapet reverses into the previous span');
    }
    for (const t of [0, .5, 1]) {
      for (const side of [-.98, -.52, 0, .52, .98]) {
        const x = (1 - t) * (a[0] + a[3] * radius * side) + t * (b[0] + b[3] * radius * side);
        const z = (1 - t) * (a[1] + a[4] * radius * side) + t * (b[1] + b[4] * radius * side);
        const y = deck.heightAt(x, z);
        assert.ok(y >= island.waterAt(x, z) + .19, 'a lane or footway intersects the river');
        assert.equal(y, workerHeight(x, z));
      }
    }
  }
  for (const bank of [deck.spans[0].a, deck.spans.at(-1).b]) {
    assert.ok(bank[2] - island.sample(bank[0], bank[1]) < .20, 'step at a bridge entrance');
  }
  const mid = deck.spans[Math.floor(deck.spans.length / 2)].a;
  const outsideX = mid[0] + 9 * mid[3], outsideZ = mid[1] + 9 * mid[4];
  assert.equal(deck.heightAt(outsideX, outsideZ), island.sample(outsideX, outsideZ));
});

test('a short sharp bend keeps both footways in order and the approaches join the hillside', () => {
  const bridge = {width: 7, bridge: true, pts: [[0, 0], [0, 10], [1, 10], [1, 17]]};
  const roads = [bridge, {pts: [[0, -30], [0, 0]]}, {pts: [[1, 17], [1, 50]]}];
  const terrain = {sample: (x, z) => .3 * z, waterAt: () => -15};
  const radius = 4.55, rows = bridgeProfile(terrain, bridge, 2 * radius, roads);
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i], dx = b[0] - a[0], dz = b[1] - a[1];
    for (const side of [-radius, radius]) {
      const ex = dx + side * (b[3] - a[3]), ez = dz + side * (b[4] - a[4]);
      assert.ok(dx * ex + dz * ez > 0);
    }
  }
  for (const row of [rows[0], rows.at(-1)]) assert.ok(Math.abs(row[2] - terrain.sample(row[0], row[1])) < .04);
});
