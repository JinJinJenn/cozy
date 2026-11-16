// Static world context derived only from (seed, preset): island, settlement plan, walk network.
// Memoised per process; it is regenerated, never snapshotted.
import { generate } from '../../island-gen/index.js';
import { generateSettlement } from '../../settlement/index.js';
import { buildNav } from './nav.js';

const cache = new Map();

export function buildContext({ seed = 'cozy-1', preset = 'harborTown' } = {}, { useCache = true } = {}) {
  const key = `${seed}|${preset}`;
  if (useCache && cache.has(key)) return cache.get(key);
  const island = generate({ seed, preset });
  const plan = generateSettlement(island, { seed, style: preset });
  const ctx = contextFromPlan(island, plan);
  if (useCache) cache.set(key, ctx);
  return ctx;
}

export function contextFromPlan(island, plan) {
  const nav = buildNav(plan, island);
  const lotsById = new Map(plan.lots.map((l) => [l.id, l]));
  return { seed: island.seed, preset: island.presetId, island, plan, nav, lotsById };
}
