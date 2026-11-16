// Collision-free ids: `${peerId}:${counter}`. Peer ids are unique per session
// (assigned by the room), so ids minted on different peers can never collide
// and no coordination is needed. One counter per peer is shared by object ids,
// layer ids and op ids.
import { PEER_RE, parseId } from './util.js';

export class IdGen {
  constructor(peerId, counter = 0) {
    if (!PEER_RE.test(peerId)) throw new Error(`bad peerId: ${peerId}`);
    this.peerId = peerId;
    this.counter = counter;
  }
  next() {
    return `${this.peerId}:${++this.counter}`;
  }
  // Call with ids seen in a snapshot so a restarted peer never reuses a counter.
  observe(id) {
    const p = parseId(id);
    if (p && p.peer === this.peerId && p.n > this.counter) this.counter = p.n;
  }
  toJSON() {
    return { peerId: this.peerId, counter: this.counter };
  }
  static fromJSON(j) {
    return new IdGen(j.peerId, j.counter);
  }
}
