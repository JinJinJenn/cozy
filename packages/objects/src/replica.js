// Replica: one peer's view of a shared world.
//
// Convergence model: every op carries a Lamport time `t` and its author peer.
// Ops are totally ordered by (t, peer, counter) and the world is the fold of
// that ordered log (last writer wins by construction). Receiving an op that
// sorts before ones already applied triggers a replay from the log, so any two
// replicas that hold the same set of ops hold the same world, whatever the
// delivery order. Rejections (no permission, seat in use, ...) are decided at
// the op's position in the total order, so they converge too.
import { OpError, clone, compareOps, parseId, PEER_RE, sortedStringify } from './util.js';
import { IdGen } from './ids.js';
import { createLayerRegistry } from './layers.js';
import { createDefinitionRegistry } from './definitions.js';
import { World } from './world.js';
import { colorForPeer } from './highlight.js';

export const OP_KINDS = ['place', 'move', 'rotate', 'remove', 'setLayerState', 'addLayer', 'removeLayer', 'act', 'setRole'];
const UNDO_LIMIT = 100;

function checkEnvelope(op) {
  if (!op || typeof op !== 'object' || Array.isArray(op)) return 'bad-envelope';
  if (!OP_KINDS.includes(op.kind)) return 'unknown-kind';
  if (typeof op.peer !== 'string' || !PEER_RE.test(op.peer)) return 'bad-envelope';
  const p = parseId(op.id);
  if (!p || p.peer !== op.peer) return 'bad-envelope';
  if (!Number.isInteger(op.t) || op.t < 1 || op.t > 2 ** 45) return 'bad-envelope';
  return null;
}

export class Replica {
  constructor({ worldId, owner, peerId, layers, defs } = {}) {
    this.worldId = worldId || 'world';
    this.owner = owner;
    this.peerId = peerId;
    this.layers = layers || createLayerRegistry();
    this.defs = defs || createDefinitionRegistry(this.layers);
    this.ids = new IdGen(peerId);
    this.clock = 0;
    this.log = [];
    this.seen = new Set();
    this.results = new Map(); // opId -> {ok, code?}
    this.world = this._fresh();
    this.undoStack = [];
    this.redoStack = [];
    this.presence = new Map(); // peer -> {objectId, layerId, t}
  }

  _fresh() {
    return new World({ owner: this.owner, layers: this.layers, defs: this.defs });
  }

  get role() {
    return this.world.roleOf(this.peerId);
  }

  // ---- receiving -----------------------------------------------------------

  // Idempotent. Returns {ok, code?, duplicate?}; malformed ops never enter the log.
  receive(rawOp) {
    const bad = checkEnvelope(rawOp);
    if (bad) return { ok: false, code: bad };
    const op = clone(rawOp);
    const dup = this._insert(op);
    if (dup) return { ok: true, duplicate: true };
    this._observe(op);
    return { ...this.results.get(op.id) };
  }

  _observe(op) {
    this.ids.observe(op.id);
    for (const k of ['objectId', 'layerId']) if (typeof op[k] === 'string') this.ids.observe(op[k]);
  }

  _insert(op, { rebuild = true } = {}) {
    if (this.seen.has(op.id)) return true;
    this.seen.add(op.id);
    this.clock = Math.max(this.clock, op.t);
    const last = this.log[this.log.length - 1];
    if (!last || compareOps(last, op) < 0) {
      this.log.push(op);
      if (rebuild) this.results.set(op.id, this.world.apply(op));
    } else {
      let lo = 0;
      let hi = this.log.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (compareOps(this.log[mid], op) < 0) lo = mid + 1;
        else hi = mid;
      }
      this.log.splice(lo, 0, op);
      if (rebuild) this._rebuild();
    }
    return false;
  }

  _rebuild() {
    this.world = this._fresh();
    this.results.clear();
    for (const op of this.log) this.results.set(op.id, this.world.apply(op));
  }

  // ---- emitting local ops --------------------------------------------------

  _emit(spec, { track = true } = {}) {
    const op = { id: this.ids.next(), t: this.clock + 1, peer: this.peerId, ...spec };
    const err = this.world.check(op);
    if (err) throw new OpError(err, spec.kind);
    const inv = track ? this._inverse(op) : null;
    this._insert(op);
    this._observe(op);
    if (track && inv) {
      this.undoStack.push({ spec: inv, opId: op.id });
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    return op;
  }

  // Inverse op spec computed against the state before the op applies.
  _inverse(op) {
    const obj = op.objectId ? this.world.get(op.objectId) : null;
    switch (op.kind) {
      case 'place':
        return { kind: 'remove', objectId: op.objectId };
      case 'remove':
        return { kind: 'place', objectId: op.objectId, restore: true, pos: obj.pos.slice(), rot: obj.rot };
      case 'move':
        return { kind: 'move', objectId: op.objectId, pos: obj.pos.slice() };
      case 'rotate':
        return { kind: 'rotate', objectId: op.objectId, rot: obj.rot };
      case 'setLayerState': {
        const layer = obj.layers.find((l) => l.id === op.layerId);
        const patch = {};
        for (const k of Object.keys(op.patch)) patch[k] = clone(layer.state[k]);
        return { kind: 'setLayerState', objectId: op.objectId, layerId: op.layerId, patch };
      }
      case 'addLayer':
        return { kind: 'removeLayer', objectId: op.objectId, layerId: op.layerId };
      case 'removeLayer': {
        const index = obj.layers.findIndex((l) => l.id === op.layerId);
        const layer = obj.layers[index];
        return { kind: 'addLayer', objectId: op.objectId, layerId: op.layerId, type: layer.type, state: clone(layer.state), index };
      }
      default:
        return null; // act / setRole are not undoable
    }
  }

  place(defId, { pos = [0, 0, 0], rot = 0 } = {}) {
    const objectId = this.ids.next();
    const op = this._emit({ kind: 'place', objectId, defId, pos, rot });
    return { opId: op.id, objectId };
  }
  move(objectId, pos) {
    return { opId: this._emit({ kind: 'move', objectId, pos }).id, objectId };
  }
  rotate(objectId, rot) {
    return { opId: this._emit({ kind: 'rotate', objectId, rot }).id, objectId };
  }
  remove(objectId) {
    return { opId: this._emit({ kind: 'remove', objectId }).id, objectId };
  }
  setLayerState(objectId, layerId, patch) {
    return { opId: this._emit({ kind: 'setLayerState', objectId, layerId, patch }).id, objectId, layerId };
  }
  addLayer(objectId, type, { state = {}, index } = {}) {
    const layerId = this.ids.next();
    const spec = { kind: 'addLayer', objectId, layerId, type, state };
    if (index !== undefined) spec.index = index;
    return { opId: this._emit(spec).id, objectId, layerId };
  }
  removeLayer(objectId, layerId) {
    return { opId: this._emit({ kind: 'removeLayer', objectId, layerId }).id, objectId, layerId };
  }
  // Live action: any role, works while others are building.
  act(objectId, layerId, action, params = {}) {
    return { opId: this._emit({ kind: 'act', objectId, layerId, action, params }, { track: false }).id, objectId, layerId };
  }
  setRole(target, role) {
    return { opId: this._emit({ kind: 'setRole', target, role }, { track: false }).id, target, role };
  }

  // ---- per-builder undo / redo --------------------------------------------

  canUndo() {
    return this.undoStack.length > 0;
  }
  canRedo() {
    return this.redoStack.length > 0;
  }

  // Undo this peer's most recent edit by emitting its inverse as a new op, so
  // it replicates like any other. Only the local peer's own ops are on the
  // stack. If the inverse is refused (seat now in use, no longer a builder, ...)
  // the entry stays on the stack and the error is thrown.
  undo() {
    return this._step(this.undoStack, this.redoStack);
  }
  redo() {
    return this._step(this.redoStack, this.undoStack);
  }
  _step(from, to) {
    const entry = from[from.length - 1];
    if (!entry) return null;
    const probe = { id: 'probe:1', t: this.clock + 1, peer: this.peerId, ...entry.spec };
    const err = this.world.check(probe);
    if (err) throw new OpError(err, `${entry.spec.kind} (undo)`);
    const inverse = this._inverse({ ...probe });
    from.pop();
    const op = this._emit(entry.spec, { track: false });
    if (inverse) to.push({ spec: inverse, opId: op.id });
    return { opId: op.id, kind: op.kind };
  }

  // ---- soft highlights -----------------------------------------------------

  // Presence message for "I am looking at / editing this". Broadcast to peers,
  // who feed it to receivePresence(). Ephemeral: never enters the op log.
  focus(objectId, layerId = null) {
    this.clock += 1;
    const msg = { kind: 'focus', peer: this.peerId, objectId, layerId, t: this.clock };
    this.presence.set(this.peerId, msg);
    return msg;
  }
  clearFocus() {
    return this.focus(null, null);
  }
  receivePresence(msg) {
    if (!msg || msg.kind !== 'focus' || typeof msg.peer !== 'string' || !PEER_RE.test(msg.peer) || !Number.isInteger(msg.t)) return false;
    const cur = this.presence.get(msg.peer);
    if (cur && cur.t >= msg.t) return false;
    this.clock = Math.max(this.clock, msg.t);
    this.presence.set(msg.peer, { kind: 'focus', peer: msg.peer, objectId: msg.objectId ?? null, layerId: msg.layerId ?? null, t: msg.t });
    return true;
  }

  // Descriptors for rendering a soft glow: who is editing what. Derived from
  // explicit focus plus recent applied build ops (within `window` ticks).
  highlights({ window = 64, excludeSelf = false } = {}) {
    const out = new Map(); // `${peer}|${objectId}` -> descriptor
    const live = (id) => {
      const o = id ? this.world.get(id) : null;
      return o && o.alive;
    };
    for (let i = this.log.length - 1; i >= 0; i--) {
      const op = this.log[i];
      if (op.t < this.clock - window) break;
      if (op.kind === 'act' || op.kind === 'setRole' || !this.results.get(op.id)?.ok) continue;
      if (excludeSelf && op.peer === this.peerId) continue;
      const key = `${op.peer}|${op.objectId}`;
      if (out.has(key) || !live(op.objectId)) continue;
      out.set(key, { type: 'soft-highlight', intent: 'editing', objectId: op.objectId, layerId: op.layerId ?? null, peerId: op.peer, color: colorForPeer(op.peer), op: op.kind, t: op.t });
    }
    for (const m of this.presence.values()) {
      if (m.t < this.clock - window || !live(m.objectId)) continue;
      if (excludeSelf && m.peer === this.peerId) continue;
      out.set(`${m.peer}|${m.objectId}`, { type: 'soft-highlight', intent: 'focus', objectId: m.objectId, layerId: m.layerId, peerId: m.peer, color: colorForPeer(m.peer), op: null, t: m.t });
    }
    return [...out.values()].sort((a, b) => (a.peerId + a.objectId < b.peerId + b.objectId ? -1 : 1));
  }

  // ---- serialisation -------------------------------------------------------

  toJSON() {
    return { v: 1, worldId: this.worldId, owner: this.owner, ops: this.log.map((o) => clone(o)) };
  }
  serialize() {
    return sortedStringify(this.toJSON());
  }
  static fromJSON(snap, { peerId, layers, defs } = {}) {
    if (!snap || snap.v !== 1) throw new Error('unsupported replica snapshot');
    const r = new Replica({ worldId: snap.worldId, owner: snap.owner, peerId, layers, defs });
    for (const raw of snap.ops) {
      if (checkEnvelope(raw)) throw new Error(`bad op in snapshot: ${raw && raw.id}`);
      const op = clone(raw);
      r._insert(op, { rebuild: false });
      r._observe(op);
    }
    r._rebuild();
    return r;
  }
}
