// Shared helpers: errors, stable JSON, id parsing, op ordering.

export class OpError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'OpError';
    this.code = code;
  }
}

export const PEER_RE = /^[A-Za-z0-9_-]{1,32}$/;
const ID_RE = /^([A-Za-z0-9_-]{1,32}):(\d{1,15})$/;

export function parseId(id) {
  if (typeof id !== 'string') return null;
  const m = ID_RE.exec(id);
  return m ? { peer: m[1], n: Number(m[2]) } : null;
}

export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// JSON with sorted keys: byte-identical for equal data, used for hashing/compare.
export function sortedStringify(v) {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const out = {};
      for (const k of Object.keys(val).sort()) out[k] = val[k];
      return out;
    }
    return val;
  });
}

// Total order over ops: Lamport time, then peer id, then per-peer counter.
export function compareOps(a, b) {
  if (a.t !== b.t) return a.t - b.t;
  if (a.peer !== b.peer) return a.peer < b.peer ? -1 : 1;
  return parseId(a.id).n - parseId(b.id).n;
}

export function deepEqual(a, b) {
  return sortedStringify(a) === sortedStringify(b);
}
