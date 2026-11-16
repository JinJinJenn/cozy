// Layer registry: each layer type declares a state schema, named actions
// (pure functions: state -> new state + optional effects) and a UI hook
// descriptor. Objects are lists of layer instances of these types.
import { OpError, deepEqual, clone } from './util.js';

const HEX = /^#[0-9a-f]{6}$/i;

export function coerceField(name, spec, v) {
  const bad = (why) => {
    throw new OpError('bad-value', `${name}: ${why}`);
  };
  switch (spec.type) {
    case 'bool':
      if (typeof v !== 'boolean') bad('expected boolean');
      return v;
    case 'number':
    case 'int':
      if (typeof v !== 'number' || !Number.isFinite(v)) bad('expected finite number');
      if (spec.type === 'int' && !Number.isInteger(v)) bad('expected integer');
      if ((spec.min !== undefined && v < spec.min) || (spec.max !== undefined && v > spec.max)) bad('out of range');
      return v;
    case 'enum':
      if (!spec.values.includes(v)) bad(`expected one of ${spec.values.join(',')}`);
      return v;
    case 'string':
      if (typeof v !== 'string' || v.length > (spec.maxLength ?? 64)) bad('expected short string');
      return v;
    case 'nstring':
      if (v === null) return v;
      if (typeof v !== 'string' || v.length > (spec.maxLength ?? 64)) bad('expected short string or null');
      return v;
    case 'color':
      if (typeof v !== 'string' || !HEX.test(v)) bad('expected #rrggbb');
      return v.toLowerCase();
    case 'stringList': {
      if (!Array.isArray(v) || v.length > (spec.maxItems ?? 16)) bad('expected short list');
      for (const s of v) if (typeof s !== 'string' || s.length > (spec.maxLength ?? 64)) bad('expected strings');
      if (new Set(v).size !== v.length) bad('duplicates');
      return v.slice();
    }
    default:
      throw new Error(`unknown field type ${spec.type}`);
  }
}

export class LayerRegistry {
  constructor() {
    this.types = new Map();
  }

  define(spec) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(spec.type || '')) throw new Error('layer type must be alphanumeric');
    if (this.types.has(spec.type)) throw new Error(`layer type already defined: ${spec.type}`);
    if (!spec.ui || !spec.ui.hook) throw new Error(`layer ${spec.type} needs a ui hook`);
    const def = {
      type: spec.type,
      label: spec.label || spec.type,
      schema: spec.schema || {},
      actions: spec.actions || {},
      ui: spec.ui,
      occupancy: spec.occupancy || null, // state -> string[] of users in use
      claims: spec.claims || [], // actions that take the object's seat
    };
    for (const [k, f] of Object.entries(def.schema)) coerceField(k, f, f.default);
    for (const [a, s] of Object.entries(def.actions)) if (typeof s.run !== 'function') throw new Error(`${spec.type}.${a} needs run()`);
    this.types.set(def.type, def);
    return def;
  }

  has(type) {
    return this.types.has(type);
  }
  get(type) {
    return this.types.get(type) || null;
  }
  list() {
    return [...this.types.keys()].sort();
  }

  defaultState(type) {
    const def = this.get(type);
    const out = {};
    for (const [k, f] of Object.entries(def.schema)) out[k] = clone(f.default);
    return out;
  }

  // Full state from a partial one. runtime fields (occupants etc.) may only be
  // present at their default so build ops cannot forge occupancy.
  normalizeState(type, partial = {}, { allowRuntime = false } = {}) {
    const def = this.get(type);
    if (!def) throw new OpError('unknown-layer-type', type);
    const base = this.defaultState(type);
    for (const [k, v] of Object.entries(partial)) {
      const f = def.schema[k];
      if (!f) throw new OpError('unknown-field', `${type}.${k}`);
      if (f.runtime && !allowRuntime && !deepEqual(v, f.default)) throw new OpError('runtime-field', `${type}.${k}`);
      base[k] = coerceField(k, f, v);
    }
    return base;
  }

  // For setLayerState: validated patch, runtime fields rejected outright.
  validatePatch(type, patch) {
    const def = this.get(type);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) {
      throw new OpError('bad-patch');
    }
    const out = {};
    for (const [k, v] of Object.entries(patch)) {
      const f = def.schema[k];
      if (!f) throw new OpError('unknown-field', `${type}.${k}`);
      if (f.runtime) throw new OpError('runtime-field', `${type}.${k}`);
      out[k] = coerceField(k, f, v);
    }
    return out;
  }

  occupancy(type, state) {
    const def = this.get(type);
    return def && def.occupancy ? def.occupancy(state) : [];
  }
}

// ---- built-in layer types -------------------------------------------------

const isBuilder = (ctx) => ctx.role === 'owner' || ctx.role === 'builder';

function whoOf(p, ctx) {
  const who = p.who ?? ctx.actor;
  if (typeof who !== 'string') throw new OpError('bad-value', 'who');
  if (who !== ctx.actor && !who.startsWith('npc:')) throw new OpError('not-you', who);
  return who;
}

// state-merging action: copies only the listed keys from params
const setKeys = (keys) => ({
  params: Object.fromEntries(keys.map((k) => [k, 'any'])),
  run(state, p) {
    const next = { ...state };
    let any = false;
    for (const k of keys) {
      if (p[k] !== undefined) {
        next[k] = p[k];
        any = true;
      }
    }
    if (!any) throw new OpError('bad-params', keys.join(','));
    return { state: next };
  },
});

const round3 = (x) => Math.round(x * 1000) / 1000;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function isScheduledOn(state, hour) {
  if (!state.enabled) return null;
  const { onHour: a, offHour: b } = state;
  if (a === b) return false;
  return a < b ? hour >= a && hour < b : hour >= a || hour < b;
}

export function registerBuiltinLayers(reg) {
  reg.define({
    type: 'toggle',
    label: 'Power',
    schema: { on: { type: 'bool', default: false } },
    actions: {
      toggle: { run: (s) => ({ state: { ...s, on: !s.on } }) },
      set: { params: { on: 'bool' }, run: (s, p) => ({ state: { ...s, on: p.on } }) },
    },
    ui: { hook: 'switch', label: 'Power', bind: 'on', controls: [{ kind: 'button', action: 'toggle' }] },
  });

  reg.define({
    type: 'dim',
    label: 'Brightness',
    schema: { level: { type: 'number', min: 0, max: 1, default: 1 } },
    actions: {
      set: { params: { level: 'number' }, run: (s, p) => ({ state: { ...s, level: p.level } }) },
      step: {
        params: { delta: 'number' },
        run(s, p) {
          if (typeof p.delta !== 'number' || !Number.isFinite(p.delta)) throw new OpError('bad-params', 'delta');
          return { state: { ...s, level: round3(clamp(s.level + p.delta, 0, 1)) } };
        },
      },
    },
    ui: { hook: 'slider', label: 'Brightness', bind: 'level', min: 0, max: 1, controls: [{ kind: 'slider', action: 'set', param: 'level' }] },
  });

  reg.define({
    type: 'tint',
    label: 'Tint',
    schema: { color: { type: 'color', default: '#ffd9a0' } },
    actions: { set: setKeys(['color']) },
    ui: { hook: 'color', label: 'Tint', bind: 'color', controls: [{ kind: 'color', action: 'set', param: 'color' }] },
  });

  reg.define({
    type: 'flicker',
    label: 'Flicker',
    schema: {
      enabled: { type: 'bool', default: false },
      rate: { type: 'number', min: 0, max: 10, default: 2 },
      amount: { type: 'number', min: 0, max: 1, default: 0.3 },
    },
    actions: { set: setKeys(['enabled', 'rate', 'amount']) },
    ui: { hook: 'switch+sliders', label: 'Flicker', bind: 'enabled', controls: [{ kind: 'slider', action: 'set', param: 'rate' }, { kind: 'slider', action: 'set', param: 'amount' }] },
  });

  reg.define({
    type: 'schedule',
    label: 'Schedule',
    schema: {
      enabled: { type: 'bool', default: false },
      onHour: { type: 'number', min: 0, max: 24, default: 18 },
      offHour: { type: 'number', min: 0, max: 24, default: 23 },
    },
    actions: { set: setKeys(['enabled', 'onHour', 'offHour']) },
    ui: { hook: 'time-range', label: 'Schedule', bind: 'enabled', controls: [{ kind: 'time', action: 'set', param: 'onHour' }, { kind: 'time', action: 'set', param: 'offHour' }] },
  });

  reg.define({
    type: 'musicReactive',
    label: 'Music reactive',
    schema: {
      enabled: { type: 'bool', default: false },
      sensitivity: { type: 'number', min: 0, max: 1, default: 0.5 },
      mode: { type: 'enum', values: ['pulse', 'color', 'brightness'], default: 'pulse' },
    },
    actions: { set: setKeys(['enabled', 'sensitivity', 'mode']) },
    ui: { hook: 'switch+select', label: 'Music reactive', bind: 'enabled', controls: [{ kind: 'select', action: 'set', param: 'mode' }, { kind: 'slider', action: 'set', param: 'sensitivity' }] },
  });

  reg.define({
    type: 'npcUse',
    label: 'NPC use',
    schema: {
      allowed: { type: 'bool', default: true },
      user: { type: 'nstring', default: null, runtime: true },
    },
    occupancy: (s) => (s.user ? [s.user] : []),
    claims: ['claim'],
    actions: {
      claim: {
        params: { who: 'npc id' },
        run(s, p, ctx) {
          const who = whoOf(p, ctx);
          if (!who.startsWith('npc:')) throw new OpError('npc-only');
          if (!s.allowed) throw new OpError('not-allowed');
          if (s.user && s.user !== who) throw new OpError('in-use');
          return { state: { ...s, user: who } };
        },
      },
      release: {
        params: { who: 'npc id' },
        run(s, p, ctx) {
          const who = p.who ?? s.user;
          if (!s.user) return { state: s };
          if (who !== s.user) throw new OpError('not-you');
          if (who !== ctx.actor && !who.startsWith('npc:') && !isBuilder(ctx)) throw new OpError('not-you');
          return { state: { ...s, user: null } };
        },
      },
      evict: { run: (s, _p, ctx) => { if (!isBuilder(ctx)) throw new OpError('forbidden'); return { state: { ...s, user: null } }; } },
    },
    ui: { hook: 'badge', label: 'NPC use', bind: 'user', controls: [{ kind: 'switch', action: 'evict' }] },
  });

  reg.define({
    type: 'linkedSwitch',
    label: 'Linked switch',
    schema: {
      on: { type: 'bool', default: false },
      targets: { type: 'stringList', maxItems: 8, default: [] },
    },
    actions: {
      flip: {
        run: (s) => ({ state: { ...s, on: !s.on }, effects: [{ type: 'remote', targets: s.targets, layerType: 'toggle', action: 'set', params: { on: !s.on } }] }),
      },
      set: {
        params: { on: 'bool' },
        run: (s, p) => ({ state: { ...s, on: p.on }, effects: [{ type: 'remote', targets: s.targets, layerType: 'toggle', action: 'set', params: { on: p.on } }] }),
      },
    },
    ui: { hook: 'switch+links', label: 'Linked switch', bind: 'on', controls: [{ kind: 'button', action: 'flip' }, { kind: 'object-picker', field: 'targets', buildOnly: true }] },
  });

  const seatUi = (label) => ({ hook: 'seat', label, bind: 'occupant', controls: [{ kind: 'button', action: 'sit' }, { kind: 'button', action: 'stand' }] });

  reg.define({
    type: 'sit',
    label: 'Sit',
    schema: { occupant: { type: 'nstring', default: null, runtime: true } },
    occupancy: (s) => (s.occupant ? [s.occupant] : []),
    claims: ['sit'],
    actions: {
      sit: {
        params: { who: 'peer or npc id' },
        run(s, p, ctx) {
          const who = whoOf(p, ctx);
          if (s.occupant && s.occupant !== who) throw new OpError('seat-in-use');
          return { state: { ...s, occupant: who } };
        },
      },
      stand: {
        params: { who: 'peer or npc id' },
        run(s, p, ctx) {
          if (!s.occupant) return { state: s };
          const who = p.who ?? ctx.actor;
          if (who !== s.occupant) throw new OpError('not-you');
          whoOf({ who }, ctx);
          return { state: { ...s, occupant: null } };
        },
      },
      evict: { run: (s, _p, ctx) => { if (!isBuilder(ctx)) throw new OpError('forbidden'); return { state: { ...s, occupant: null } }; } },
    },
    ui: seatUi('Sit'),
  });

  reg.define({
    type: 'lounge',
    label: 'Lounge',
    schema: {
      occupant: { type: 'nstring', default: null, runtime: true },
      pose: { type: 'enum', values: ['recline', 'curl', 'sprawl'], default: 'recline' },
    },
    occupancy: (s) => (s.occupant ? [s.occupant] : []),
    claims: ['lounge'],
    actions: {
      lounge: {
        params: { who: 'peer or npc id', pose: 'enum' },
        run(s, p, ctx) {
          const who = whoOf(p, ctx);
          if (s.occupant && s.occupant !== who) throw new OpError('seat-in-use');
          return { state: { ...s, occupant: who, pose: p.pose ?? s.pose } };
        },
      },
      rise: {
        params: { who: 'peer or npc id' },
        run(s, p, ctx) {
          if (!s.occupant) return { state: s };
          const who = p.who ?? ctx.actor;
          if (who !== s.occupant) throw new OpError('not-you');
          whoOf({ who }, ctx);
          return { state: { ...s, occupant: null } };
        },
      },
      setPose: setKeys(['pose']),
      evict: { run: (s, _p, ctx) => { if (!isBuilder(ctx)) throw new OpError('forbidden'); return { state: { ...s, occupant: null } }; } },
    },
    ui: { hook: 'seat+select', label: 'Lounge', bind: 'occupant', controls: [{ kind: 'button', action: 'lounge' }, { kind: 'button', action: 'rise' }, { kind: 'select', action: 'setPose', param: 'pose' }] },
  });

  reg.define({
    type: 'movable',
    label: 'Move',
    schema: {
      enabled: { type: 'bool', default: true },
      maxStep: { type: 'number', min: 0, max: 2, default: 0.5 },
    },
    actions: {
      nudge: {
        params: { dx: 'number', dz: 'number' },
        run(s, p) {
          if (!s.enabled) throw new OpError('not-allowed');
          for (const k of ['dx', 'dz']) if (p[k] !== undefined && (typeof p[k] !== 'number' || !Number.isFinite(p[k]))) throw new OpError('bad-params', k);
          const dx = clamp(p.dx ?? 0, -s.maxStep, s.maxStep);
          const dz = clamp(p.dz ?? 0, -s.maxStep, s.maxStep);
          return { state: s, effects: [{ type: 'nudge', dx, dz }] };
        },
      },
    },
    ui: { hook: 'dpad', label: 'Nudge', bind: 'enabled', controls: [{ kind: 'dpad', action: 'nudge', params: ['dx', 'dz'] }] },
  });

  reg.define({
    type: 'decorate',
    label: 'Decorate',
    schema: { items: { type: 'stringList', maxItems: 4, maxLength: 24, default: [] } },
    actions: {
      add: {
        params: { item: 'string' },
        run(s, p) {
          if (typeof p.item !== 'string') throw new OpError('bad-params', 'item');
          if (s.items.includes(p.item)) return { state: s };
          return { state: { ...s, items: [...s.items, p.item] } };
        },
      },
      remove: { params: { item: 'string' }, run: (s, p) => ({ state: { ...s, items: s.items.filter((i) => i !== p.item) } }) },
      clear: { run: (s) => ({ state: { ...s, items: [] } }) },
    },
    ui: { hook: 'item-list', label: 'Decorate', bind: 'items', controls: [{ kind: 'item-picker', action: 'add', param: 'item' }, { kind: 'button', action: 'clear' }] },
  });

  reg.define({
    type: 'socialSeat',
    label: 'Social seat',
    schema: {
      occupants: { type: 'stringList', maxItems: 4, default: [], runtime: true },
      capacity: { type: 'int', min: 1, max: 4, default: 2 },
    },
    occupancy: (s) => s.occupants,
    claims: ['join'],
    actions: {
      join: {
        params: { who: 'peer or npc id' },
        run(s, p, ctx) {
          const who = whoOf(p, ctx);
          if (s.occupants.includes(who)) return { state: s };
          if (s.occupants.length >= s.capacity) throw new OpError('seat-in-use');
          return { state: { ...s, occupants: [...s.occupants, who] } };
        },
      },
      leave: {
        params: { who: 'peer or npc id' },
        run(s, p, ctx) {
          const who = p.who ?? ctx.actor;
          whoOf({ who }, ctx);
          return { state: { ...s, occupants: s.occupants.filter((o) => o !== who) } };
        },
      },
      evict: { run: (s, _p, ctx) => { if (!isBuilder(ctx)) throw new OpError('forbidden'); return { state: { ...s, occupants: [] } }; } },
    },
    ui: { hook: 'seat-group', label: 'Share the seat', bind: 'occupants', controls: [{ kind: 'button', action: 'join' }, { kind: 'button', action: 'leave' }] },
  });

  return reg;
}

export function createLayerRegistry() {
  return registerBuiltinLayers(new LayerRegistry());
}
