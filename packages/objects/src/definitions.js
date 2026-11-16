// Object definitions as data. Every definition is a list of >= 2 layers.
// Layer `key` is the stable layer id inside objects made from the definition.
import { clone } from './util.js';

const DEF_ID = /^[a-z][a-z0-9-]{0,31}$/;

function deepFreeze(o) {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

export class DefinitionRegistry {
  constructor(layers) {
    this.layers = layers;
    this.defs = new Map();
  }

  define(spec) {
    if (!DEF_ID.test(spec.id || '')) throw new Error(`bad definition id: ${spec.id}`);
    if (this.defs.has(spec.id)) throw new Error(`definition exists: ${spec.id}`);
    if (!Array.isArray(spec.layers) || spec.layers.length < 2) throw new Error(`${spec.id}: needs at least 2 layers`);
    const keys = new Set();
    const layers = spec.layers.map((l) => {
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(l.key || '') || keys.has(l.key)) throw new Error(`${spec.id}: bad/duplicate layer key ${l.key}`);
      keys.add(l.key);
      if (!this.layers.has(l.type)) throw new Error(`${spec.id}: unknown layer type ${l.type}`);
      // throws on invalid default state
      const state = this.layers.normalizeState(l.type, l.state || {});
      return { key: l.key, type: l.type, state };
    });
    const def = deepFreeze({
      id: spec.id,
      name: spec.name || spec.id,
      size: spec.size || [1, 1, 1],
      layers,
    });
    this.defs.set(def.id, def);
    return def;
  }

  get(id) {
    return this.defs.get(id) || null;
  }
  list() {
    return [...this.defs.keys()].sort();
  }

  // fresh layer instances for a new object (independent state per object)
  instantiate(id) {
    const def = this.get(id);
    return def.layers.map((l) => ({ id: l.key, type: l.type, state: clone(l.state) }));
  }
}

export function registerBuiltinDefinitions(reg) {
  reg.define({
    id: 'lamp',
    name: 'Lamp',
    size: [0.4, 1.4, 0.4],
    layers: [
      { key: 'toggle', type: 'toggle', state: { on: true } },
      { key: 'dim', type: 'dim' },
      { key: 'tint', type: 'tint' },
      { key: 'flicker', type: 'flicker' },
      { key: 'schedule', type: 'schedule' },
      { key: 'music', type: 'musicReactive' },
      { key: 'npc', type: 'npcUse' },
      { key: 'link', type: 'linkedSwitch' },
    ],
  });
  reg.define({
    id: 'chair',
    name: 'Chair',
    size: [0.7, 1, 0.7],
    layers: [
      { key: 'sit', type: 'sit' },
      { key: 'lounge', type: 'lounge' },
      { key: 'move', type: 'movable' },
      { key: 'decorate', type: 'decorate' },
      { key: 'npc', type: 'npcUse' },
      { key: 'social', type: 'socialSeat' },
    ],
  });
  reg.define({
    id: 'bench',
    name: 'Bench',
    size: [1.8, 0.9, 0.6],
    layers: [
      { key: 'social', type: 'socialSeat', state: { capacity: 3 } },
      { key: 'decorate', type: 'decorate' },
      { key: 'npc', type: 'npcUse' },
    ],
  });
  return reg;
}

export function createDefinitionRegistry(layers) {
  return registerBuiltinDefinitions(new DefinitionRegistry(layers));
}
