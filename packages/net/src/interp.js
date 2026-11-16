// Snapshot interpolation for a remote entity. Samples are {t(ms, local clock), p:[x,y,z], r:[yaw,pitch]}.
// Render time = now - delay; we lerp between the two samples around it, extrapolate briefly
// (capped) when the buffer runs dry, then hold.
const TAU = Math.PI * 2;

export function lerpAngle(a, b, k) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return a + d * k;
}

export class Interpolator {
  constructor({ delayMs = 120, maxExtrapMs = 150, maxSamples = 32 } = {}) {
    this.delayMs = delayMs; this.maxExtrapMs = maxExtrapMs; this.maxSamples = maxSamples;
    this.buf = [];
  }
  push(t, p, r) {
    const b = this.buf;
    if (b.length && t <= b[b.length - 1].t) t = b[b.length - 1].t + 0.001; // strictly monotonic
    b.push({ t, p, r });
    if (b.length > this.maxSamples) b.shift();
  }
  get latest() { return this.buf[this.buf.length - 1] || null; }
  /** Returns {p:[x,y,z], r:[yaw,pitch]} or null if no samples. */
  sample(now) {
    const b = this.buf;
    if (!b.length) return null;
    const rt = now - this.delayMs;
    if (rt <= b[0].t || b.length === 1) return { p: b[0].p.slice(), r: b[0].r.slice() };
    for (let i = b.length - 1; i > 0; i--) {
      const a = b[i - 1], c = b[i];
      if (rt >= a.t) {
        if (rt <= c.t) return mix(a, c, (rt - a.t) / (c.t - a.t));
        // past the newest sample: extrapolate on last velocity, capped
        const over = Math.min(rt - c.t, this.maxExtrapMs);
        const k = 1 + over / (c.t - a.t);
        return { p: [0, 1, 2].map(j => a.p[j] + (c.p[j] - a.p[j]) * k), r: c.r.slice() };
      }
    }
    return { p: b[0].p.slice(), r: b[0].r.slice() };
  }
}

function mix(a, c, k) {
  return {
    p: [a.p[0] + (c.p[0] - a.p[0]) * k, a.p[1] + (c.p[1] - a.p[1]) * k, a.p[2] + (c.p[2] - a.p[2]) * k],
    r: [lerpAngle(a.r[0], c.r[0], k), a.r[1] + (c.r[1] - a.r[1]) * k],
  };
}
