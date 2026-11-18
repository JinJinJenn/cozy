// Only the canonical world participates. Changing a world or wire format
// requires a new room name so old clients cannot exchange incompatible poses.
export const publicWorld = 'harbor-petalwood-world2-wire3';
export function streetSpace(island, params) {
  if (params.has('visit')) return 'visit';
  if (params.get('space') === 'personal' || island.presetId !== 'harborTown' || island.seed !== 'petalwood') return 'personal';
  return 'public';
}

const keyPattern = /^[A-Za-z0-9_-]{87}$/;
const actorPattern = /^[a-f0-9-]{36}$/i;
const algorithm = {name:'ECDSA', namedCurve:'P-256'};
const signature = {name:'ECDSA', hash:'SHA-256'};
const utf8 = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode = text => Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
function actorFor(pub) {
  // The raw P-256 point starts with 04, followed by the X coordinate.
  const hex = Array.from(decode(pub).subarray(1,17), b => b.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

export async function lobbyIdentity() {
  const pair = await crypto.subtle.generateKey(algorithm, false, ['sign','verify']);
  const pub=encode(await crypto.subtle.exportKey('raw',pair.publicKey));
  return {pub,actor:actorFor(pub),privateKey:pair.privateKey};
}

// Each tab signs one introduction per transport, bound to the actual sender
// on that transport. Heartbeats reuse it. An RTC and a same-profile broadcast
// link to one player count as a single candidate.
export class PublicTown {
  constructor(room, identity, onLeader, joined = Date.now()) {
    this.room = room;
    this.self = {...identity, joined};
    this.onLeader = onLeader;
    this.members = new Map();
    this.pending = new Map();
    this.links = new Map();
    this.leader = null;
  }
  async attach(kind, connection) {
    const {pub, actor, joined, privateKey} = this.self;
    const sender = kind+'/'+connection.selfId;
    const body = JSON.stringify([this.room, sender, pub, actor, joined]);
    const sig = encode(await crypto.subtle.sign(signature, privateKey, utf8.encode(body)));
    if (this.closed) return;
    const packet = {kind:'presence', body, sig};
    this.links.set(kind,{connection,packet});
    connection.send(packet);
  }
  announce(kind) {
    const link = this.links.get(kind);
    if (link) link.connection.send(link.packet);
  }
  tick(now) {
    if (now < (this.nextPulse ?? 0)) return;
    this.nextPulse = now + 2000;
    for (const [sender, member] of this.members) {
      if (now-member.seen > 15000) this.members.delete(sender);
    }
    this.elect();
    for (const kind of this.links.keys()) this.announce(kind);
  }
  async receive(sender, message) {
    const old = this.members.get(sender);
    if (old) {
      if (message.sig === old.sig && message.body === old.body) old.seen = performance.now();
      return;
    }
    if (this.closed || this.pending.has(sender) || this.members.size+this.pending.size >= 128 ||
        typeof message.body !== 'string' || message.body.length > 750 ||
        typeof message.sig !== 'string' || message.sig.length !== 86) return;
    const attempt = {};
    this.pending.set(sender,attempt);
    try {
      const [room, source, pub, actor, joined] = JSON.parse(message.body);
      if (room !== this.room || source !== sender || !keyPattern.test(pub) || !actorPattern.test(actor) || actor !== actorFor(pub) ||
          !Number.isSafeInteger(joined) || joined <= 0 || pub === this.self.pub) return;
      const publicKey = await crypto.subtle.importKey('raw',decode(pub),algorithm,false,['verify']);
      if (!await crypto.subtle.verify(signature,publicKey,decode(message.sig),utf8.encode(message.body))) return;
      if (this.pending.get(sender) !== attempt || this.closed) return;
      this.members.set(sender,{pub,actor,joined,publicKey,body:message.body,sig:message.sig,seen:performance.now()});
      this.elect();
    } catch {
      // Ignore malformed introductions on the open channel.
    } finally {
      if (this.pending.get(sender) === attempt) this.pending.delete(sender);
    }
  }
  leave(sender) {
    this.pending.delete(sender);
    if (this.members.delete(sender)) this.elect();
  }
  elect() {
    if (this.closed) return;
    let leader = this.self;
    for (const member of this.members.values()) {
      if (member.joined < leader.joined || (member.joined === leader.joined && member.pub < leader.pub)) leader = member;
    }
    if (this.leader === leader.pub) return;
    this.leader = leader.pub;
    this.onLeader(leader);
  }
  dispose() {
    this.closed = true;
    this.members.clear();
    this.pending.clear();
    this.links.clear();
  }
}
