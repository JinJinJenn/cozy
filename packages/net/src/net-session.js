// NetSession: join a room, broadcast our pose at ~10 Hz, track peers, interpolate them.
// Transport-agnostic (see transport-*.js). Browser ES module, no bundler.
import { Interpolator } from './interp.js';

const r3 = v => Math.round(v * 1000) / 1000;

export class NetSession {
  /**
   * @param {object} o
   * @param {object} o.transport   {join(roomId, handlers)}
   * @param {string} o.room        room id (see roomIdFor / parseInvite)
   * @param {string} [o.name]      display name sent with every packet (max 24 chars)
   * @param {number} [o.sendHz=10]
   * @param {number} [o.interpDelayMs=120]
   * @param {number} [o.idleHeartbeatMs=1000] resend an unchanged pose this often
   * @param {number} [o.staleMs=8000] drop a peer silent this long (transport leave events are primary)
   */
  constructor({ transport, room, name = '', sendHz = 10, interpDelayMs = 120, idleHeartbeatMs = 1000, staleMs = 8000 }) {
    Object.assign(this, { transport, room, name: String(name).slice(0, 24), sendHz, interpDelayMs, idleHeartbeatMs, staleMs });
    this.peers = new Map(); // id -> {id,name,interp,lastHeard,lastSeq}
    this.listeners = { peerjoin: new Set(), peerleave: new Set(), state: new Set(), error: new Set() };
    this.local = { p: [0, 0, 0], r: [0, 0] };
    this.selfId = null; this.conn = null; this.timer = null;
    this.seq = 0; this.lastSentJson = ''; this.lastSentAt = 0;
    this.stats = { sent: 0, received: 0 };
  }

  /** Events: peerjoin(peer), peerleave(peer), state(peer, isFirst), error(err). Returns unsubscribe. */
  on(evt, fn) { this.listeners[evt].add(fn); return () => this.listeners[evt].delete(fn); }
  _emit(evt, ...a) { for (const f of this.listeners[evt]) { try { f(...a); } catch (e) { console.error(e); } } }

  async join() {
    this.conn = await this.transport.join(this.room, {
      onPeerJoin: id => this._peer(id),
      onPeerLeave: id => this._drop(id),
      onMessage: (id, d) => this._recv(id, d),
      onError: e => this._emit('error', e),
    });
    this.selfId = this.conn.selfId;
    this.timer = setInterval(() => this._tick(), 1000 / this.sendHz);
    return this;
  }

  /** Call every frame (cheap): p=[x,y,z] metres, r=[yaw,pitch] radians. Sent at sendHz. */
  setLocal(p, r) { this.local.p = p; this.local.r = r; }

  _tick() {
    if (!this.conn) return;
    const now = performance.now();
    this._sweep(now);
    const msg = { n: this.name, p: this.local.p.map(r3), r: this.local.r.map(r3) };
    const json = JSON.stringify(msg);
    if (json === this.lastSentJson && now - this.lastSentAt < this.idleHeartbeatMs) return;
    msg.s = ++this.seq;
    this.conn.send(msg);
    this.lastSentJson = json; this.lastSentAt = now; this.stats.sent++;
  }

  _sweep(now) {
    for (const [id, p] of this.peers) if (now - p.lastHeard > this.staleMs) this._drop(id);
  }

  _peer(id) {
    let p = this.peers.get(id);
    if (!p) {
      p = { id, name: '', interp: new Interpolator({ delayMs: this.interpDelayMs }), lastHeard: performance.now(), lastSeq: -1 };
      this.peers.set(id, p);
      this._emit('peerjoin', p);
    }
    return p;
  }

  _drop(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    this._emit('peerleave', p);
  }

  _recv(id, d) {
    // untrusted input: validate shape, numbers, and sequence
    if (!d || !Array.isArray(d.p) || d.p.length !== 3 || !Array.isArray(d.r) || d.r.length < 2) return;
    if (!d.p.every(Number.isFinite) || !d.r.every(Number.isFinite)) return;
    const now = performance.now();
    const fresh = !this.peers.has(id);
    const p = this._peer(id);
    if (typeof d.s === 'number') { if (d.s <= p.lastSeq && p.lastSeq - d.s < 1000) return; p.lastSeq = d.s; }
    p.lastHeard = now;
    if (typeof d.n === 'string') p.name = d.n.slice(0, 24);
    p.interp.push(now, d.p, [d.r[0], d.r[1]]);
    this.stats.received++;
    this._emit('state', p, fresh);
  }

  /** Interpolated pose of every peer at `now` (performance.now() ms): [{id,name,p,r}]. */
  getPeerStates(now = performance.now()) {
    const out = [];
    for (const p of this.peers.values()) {
      const s = p.interp.sample(now);
      if (s) out.push({ id: p.id, name: p.name, p: s.p, r: s.r });
    }
    return out;
  }

  /** Newest raw (uninterpolated) pose per peer, for debugging and tests. */
  getLatestRaw() {
    return [...this.peers.values()].filter(p => p.interp.latest).map(p => ({ id: p.id, p: p.interp.latest.p, r: p.interp.latest.r }));
  }

  leave() {
    clearInterval(this.timer); this.timer = null;
    try { this.conn?.leave(); } catch {}
    this.conn = null;
    for (const id of [...this.peers.keys()]) this._drop(id);
  }
}
