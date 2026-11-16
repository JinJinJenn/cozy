import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../packages/island-gen/index.js';
import { createFlattenHook } from '../packages/settlement/index.js';

test('the viewer worker grades the field shared by chunk meshes and client queries', async () => {
  let reply;
  globalThis.self = { postMessage: message => { reply = message; } };
  try {
    await import('../src/gen-worker.js');
    const opts = { grid: 129, droplets: 100 };
    const config = { seed: 'cozy-1', preset: 'harborTown' };
    self.onmessage({ data: { type: 'load', id: 1, ...config, opts } });
    assert.equal(reply.type, 'loaded', reply.message);
    const { h, water, plan, meta } = reply;
    const raw = generate({ ...config, ...opts });
    const graded = createFlattenHook(plan)(raw);
    assert.deepEqual(h, graded);
    assert.deepEqual(water, raw.water);
    // Pick a changed interior vertex on this seed to catch a stale sampler closure.
    const index = h.findIndex((y, k) => Math.abs(y - raw.heightfield[k]) > 0.3);
    assert.ok(index >= 0);
    const x = (index % meta.grid) * meta.cell - meta.half;
    const z = Math.floor(index / meta.grid) * meta.cell - meta.half;
    const cx = Math.floor(x / meta.chunkSize), cz = Math.floor(z / meta.chunkSize);
    const res = Math.round(meta.chunkSize / meta.cell) + 1;
    self.onmessage({ data: { type: 'chunk', id: 2, cx, cz, res, wres: res } });
    assert.equal(reply.type, 'chunk', reply.message);
    const i = Math.round((x - cx * meta.chunkSize) / meta.cell);
    const j = Math.round((z - cz * meta.chunkSize) / meta.cell);
    assert.ok(Math.abs(reply.terrain.positions[(j * res + i) * 3 + 1] - graded[index]) < 1e-4);
  } finally {
    delete globalThis.self;
  }
});
