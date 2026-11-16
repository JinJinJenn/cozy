// World object store + deterministic op application.
// apply(op) is a pure function of (world state, op): the same ops in the same
// total order always produce the same world (see replica.js for the ordering).
import { OpError, clone, parseId, sortedStringify, PEER_RE } from './util.js';
import { createLayerRegistry } from './layers.js';
import { createDefinitionRegistry } from './definitions.js';

export const BUILD_ROLES = ['owner', 'builder'];

const POS_LIMIT = 100000;
export function normPos(p) {
  if (!Array.isArray(p) || p.length !== 3) return null;
  for (const c of p) if (typeof c !== 'number' || !Number.isFinite(c) || Math.abs(c) > POS_LIMIT) return null;
  return p.slice();
}
export function normRot(r) {
  if (typeof r !== 'number' || !Number.isFinite(r)) return null;
  return ((r % 360) + 360) % 360;
}

export class World {
  constructor({ owner, layers, defs } = {}) {
    if (!PEER_RE.test(owner || '')) throw new Error('world needs an owner peer id');
    this.owner = owner;
    this.layers = layers || createLayerRegistry();
    this.defs = defs || createDefinitionRegistry(this.layers);
    this.objects = new Map(); // id -> {id,defId,creator,pos,rot,alive,layers:[{id,type,state}]}
    this.roles = new Map(); // peer -> 'builder' (visitor is the default, owner is fixed)
  }

  roleOf(peer) {
    if (peer === this.owner) return 'owner';
    return this.roles.get(peer) || 'visitor';
  }

  get(id) {
    return this.objects.get(id) || null;
  }
  list({ includeRemoved = false } = {}) {
    return [...this.objects.values()].filter((o) => includeRemoved || o.alive).sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  // [{layerId, users}] for layers that are currently in use
  occupancy(obj, exceptLayerId = null) {
    const out = [];
    for (const l of obj.layers) {
      if (l.id === exceptLayerId) continue;
      const users = this.layers.occupancy(l.type, l.state);
      if (users.length) out.push({ layerId: l.id, users });
    }
    return out;
  }
  isOccupied(obj) {
    return this.occupancy(obj).length > 0;
  }

  // UI hook descriptors for an object: what a client needs to draw controls.
  describeUI(objectId) {
    const obj = this.get(objectId);
    if (!obj) return [];
    return obj.layers.map((l) => {
      const def = this.layers.get(l.type);
      return {
        objectId: obj.id,
        layerId: l.id,
        layerType: l.type,
        hook: def.ui.hook,
        label: def.ui.label,
        bind: def.ui.bind || null,
        controls: clone(def.ui.controls || []),
        actions: Object.keys(def.actions),
        state: clone(l.state),
        inUse: this.layers.occupancy(l.type, l.state),
      };
    });
  }

  check(op) {
    const p = this.plan(op);
    return p.error || null;
  }
  apply(op) {
    const p = this.plan(op);
    if (p.error) return { ok: false, code: p.error };
    p.commit();
    return { ok: true };
  }

  plan(op) {
    try {
      return this._plan(op);
    } catch (e) {
      if (e instanceof OpError) return { error: e.code };
      return { error: 'bad-op' }; // malformed remote input never crashes replay
    }
  }

  _plan(op) {
    const fail = (error) => ({ error });
    const role = this.roleOf(op.peer);

    if (op.kind === 'setRole') {
      if (op.peer !== this.owner) return fail('owner-only');
      if (!PEER_RE.test(op.target || '') || op.target === this.owner) return fail('bad-target');
      if (op.role !== 'builder' && op.role !== 'visitor') return fail('bad-role');
      return {
        commit: () => {
          if (op.role === 'visitor') this.roles.delete(op.target);
          else this.roles.set(op.target, 'builder');
        },
      };
    }
    if (op.kind === 'act') return this._planAct(op, role);

    if (!BUILD_ROLES.includes(role)) return fail('forbidden');
    const minted = (id) => {
      const p = parseId(id);
      return p && p.peer === op.peer;
    };

    if (op.kind === 'place') {
      const ex = this.objects.get(op.objectId);
      if (op.restore) {
        if (!ex || ex.alive) return fail('not-restorable');
        const pos = op.pos === undefined ? ex.pos : normPos(op.pos);
        const rot = op.rot === undefined ? ex.rot : normRot(op.rot);
        if (!pos || rot === null) return fail('bad-transform');
        return { commit: () => Object.assign(ex, { alive: true, pos, rot }) };
      }
      if (!minted(op.objectId)) return fail('bad-id');
      if (ex) return fail('exists');
      if (!this.defs.get(op.defId)) return fail('unknown-def');
      const pos = normPos(op.pos);
      const rot = normRot(op.rot ?? 0);
      if (!pos || rot === null) return fail('bad-transform');
      return {
        commit: () =>
          this.objects.set(op.objectId, {
            id: op.objectId,
            defId: op.defId,
            creator: op.peer,
            pos,
            rot,
            alive: true,
            layers: this.defs.instantiate(op.defId),
          }),
      };
    }

    const obj = this.objects.get(op.objectId);
    if (!obj) return fail('no-object');
    if (!obj.alive) return fail('removed');

    switch (op.kind) {
      case 'move': {
        const pos = normPos(op.pos);
        if (!pos) return fail('bad-transform');
        if (this.isOccupied(obj)) return fail('in-use');
        return { commit: () => (obj.pos = pos) };
      }
      case 'rotate': {
        const rot = normRot(op.rot);
        if (rot === null) return fail('bad-transform');
        return { commit: () => (obj.rot = rot) };
      }
      case 'remove': {
        if (this.isOccupied(obj)) return fail('in-use');
        return { commit: () => (obj.alive = false) };
      }
      case 'setLayerState': {
        const layer = obj.layers.find((l) => l.id === op.layerId);
        if (!layer) return fail('no-layer');
        const patch = this.layers.validatePatch(layer.type, op.patch);
        return { commit: () => (layer.state = { ...layer.state, ...patch }) };
      }
      case 'addLayer': {
        // fresh ids are peer-minted; definition keys (e.g. 'flicker') may be re-added by undo
        const lp = parseId(op.layerId);
        if (typeof op.layerId !== 'string' || !/^[A-Za-z0-9_:-]{1,65}$/.test(op.layerId) || (lp && lp.peer !== op.peer)) return fail('bad-id');
        if (obj.layers.some((l) => l.id === op.layerId)) return fail('exists');
        if (!this.layers.has(op.type)) return fail('unknown-layer-type');
        const state = this.layers.normalizeState(op.type, op.state || {});
        let index = obj.layers.length;
        if (op.index !== undefined) {
          if (!Number.isInteger(op.index) || op.index < 0 || op.index > obj.layers.length) return fail('bad-index');
          index = op.index;
        }
        return { commit: () => obj.layers.splice(index, 0, { id: op.layerId, type: op.type, state }) };
      }
      case 'removeLayer': {
        const i = obj.layers.findIndex((l) => l.id === op.layerId);
        if (i < 0) return fail('no-layer');
        if (obj.layers.length <= 1) return fail('last-layer');
        const l = obj.layers[i];
        if (this.layers.occupancy(l.type, l.state).length) return fail('in-use');
        return { commit: () => obj.layers.splice(i, 1) };
      }
      default:
        return fail('unknown-kind');
    }
  }

  // Live action on a layer. Allowed for every role, on any live object, and
  // never blocked by build ops (only a removed object refuses it).
  _planAct(op, role) {
    const fail = (error) => ({ error });
    const obj = this.objects.get(op.objectId);
    if (!obj) return fail('no-object');
    if (!obj.alive) return fail('removed');
    const layer = obj.layers.find((l) => l.id === op.layerId);
    if (!layer) return fail('no-layer');
    const def = this.layers.get(layer.type);
    const action = Object.prototype.hasOwnProperty.call(def.actions, op.action) ? def.actions[op.action] : null;
    if (!action) return fail('no-action');
    const params = op.params && typeof op.params === 'object' && !Array.isArray(op.params) ? op.params : {};
    const ctx = { actor: op.peer, tick: op.t, role };

    if (def.claims.includes(op.action)) {
      const others = this.occupancy(obj, layer.id);
      if (others.length) return fail('seat-in-use');
    }
    const res = action.run(clone(layer.state), clone(params), ctx);
    const writes = [{ layer, state: this.layers.normalizeState(layer.type, res.state, { allowRuntime: true }) }];
    let newPos = null;

    for (const e of res.effects || []) {
      if (e.type === 'nudge') {
        if (this.isOccupied(obj)) return fail('in-use');
        newPos = normPos([obj.pos[0] + e.dx, obj.pos[1], obj.pos[2] + e.dz]);
        if (!newPos) return fail('bad-transform');
      } else if (e.type === 'remote') {
        for (const id of e.targets) {
          const t = this.objects.get(id);
          if (!t || !t.alive || t === obj) continue;
          const tl = t.layers.find((l) => l.type === e.layerType);
          if (!tl) continue;
          const tdef = this.layers.get(tl.type);
          const ta = tdef.actions[e.action];
          if (!ta) continue;
          try {
            const r = ta.run(clone(tl.state), clone(e.params), ctx);
            writes.push({ layer: tl, state: this.layers.normalizeState(tl.type, r.state, { allowRuntime: true }) });
          } catch (err) {
            if (!(err instanceof OpError)) throw err; // a bad target never fails the primary action
          }
        }
      }
    }
    return {
      commit: () => {
        for (const w of writes) w.layer.state = w.state;
        if (newPos) obj.pos = newPos;
      },
    };
  }

  toJSON() {
    const roles = {};
    for (const k of [...this.roles.keys()].sort()) roles[k] = this.roles.get(k);
    return {
      v: 1,
      owner: this.owner,
      roles,
      objects: [...this.objects.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map((o) => clone(o)),
    };
  }

  static fromJSON(data, { layers, defs } = {}) {
    if (!data || data.v !== 1) throw new Error('unsupported world snapshot');
    const w = new World({ owner: data.owner, layers, defs });
    for (const [k, v] of Object.entries(data.roles || {})) if (v === 'builder' && PEER_RE.test(k)) w.roles.set(k, v);
    for (const o of data.objects || []) {
      if (!parseId(o.id) || !w.defs.get(o.defId)) throw new Error(`bad object in snapshot: ${o.id}`);
      const layersOut = o.layers.map((l) => ({ id: l.id, type: l.type, state: w.layers.normalizeState(l.type, l.state, { allowRuntime: true }) }));
      w.objects.set(o.id, { id: o.id, defId: o.defId, creator: o.creator, pos: normPos(o.pos), rot: normRot(o.rot), alive: !!o.alive, layers: layersOut });
    }
    return w;
  }
}

export const serializeWorld = (world) => sortedStringify(world.toJSON());
export const deserializeWorld = (text, opts) => World.fromJSON(JSON.parse(text), opts);
