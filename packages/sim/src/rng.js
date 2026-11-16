// Seeded RNG (mulberry32). The whole state is one uint32 so snapshots can resume it exactly.
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  constructor(state) {
    this.s = state >>> 0;
  }
  float() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.float();
  }
  int(n) {
    return Math.floor(this.float() * n);
  }
  pick(arr) {
    return arr[this.int(arr.length)];
  }
  chance(p) {
    return this.float() < p;
  }
}

// Pure, stateless variant: same inputs, same output (used for weather).
export function hashFloat(...parts) {
  return new Rng(hashSeed(parts.join('|'))).float();
}
