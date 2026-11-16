// Headless town sim debug (pure node, no browser): runs N sim days on each preset, prints a timeline summary and
// writes a top-down PNG with NPC trails to docs/shots/<UTC date>/sim-<preset>.png (+ -zoom).
//   node tools/sim-debug.mjs [days=3] [seed=cozy-1] [outDir]
// On day 2 it injects a music event (10:00-12:00) and a player nearby event (14:00) to show the reactions.
import { writeFile, mkdir } from 'node:fs/promises';
import zlib from 'node:zlib';
import path from 'node:path';
import { PRESET_IDS } from '../packages/island-gen/index.js';
import { Sim, buildContext } from '../packages/sim/index.js';

const days = Number(process.argv[2] || 3);
const seed = process.argv[3] || 'cozy-1';
const date = new Date().toISOString().slice(0, 10);
const out = process.argv[4] || path.resolve('docs/shots', date);
await mkdir(out, { recursive: true });

const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(W, H, rgba) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) { const s = (y * W + x) * 4, d = y * (W * 3 + 1) + 1 + x * 3; raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2]; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const COLORS = [[230, 60, 60], [40, 110, 230], [240, 150, 20], [150, 60, 200], [20, 170, 120], [220, 60, 170], [90, 90, 90], [0, 160, 200], [180, 130, 20], [100, 200, 40], [200, 40, 120], [60, 60, 200]];

function render(ctx, sim, trails, cx, cz, span, px) {
  const isl = ctx.island, plan = ctx.plan;
  const W = px, H = px, scale = px / span, x0 = cx - span / 2, z0 = cz - span / 2, q = isl.island;
  const buf = new Uint8ClampedArray(W * H * 4);
  const hAt = (x, z) => q.sample(x, z);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = x0 + (x + 0.5) / scale, wz = z0 + (y + 0.5) / scale, hh = hAt(wx, wz), d = 4, o = (y * W + x) * 4;
    const sh = Math.max(-0.5, Math.min(0.5, ((hAt(wx - d, wz) - hAt(wx + d, wz)) + (hAt(wx, wz - d) - hAt(wx, wz + d))) * 0.05));
    let r, g, b;
    if (hh < 0) { const t = Math.min(1, -hh / 30); r = 70 - 40 * t; g = 130 - 60 * t; b = 190 - 60 * t; }
    else if (q.waterAt(wx, wz) > 0.02) { r = 80; g = 140; b = 200; }
    else { const t = Math.min(1, hh / 90); r = hh < 1.5 ? 226 : 120 + 70 * t; g = hh < 1.5 ? 210 : 160 - 20 * t; b = hh < 1.5 ? 160 : 90 + 60 * t; r += sh * 70; g += sh * 70; b += sh * 70; }
    buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
  }
  const px2 = (X, Y, c, a) => { if (X < 0 || Y < 0 || X >= W || Y >= H) return; const o = (Y * W + X) * 4; buf[o] += (c[0] - buf[o]) * a; buf[o + 1] += (c[1] - buf[o + 1]) * a; buf[o + 2] += (c[2] - buf[o + 2]) * a; };
  const toS = (p) => [(p[0] - x0) * scale, (p[1] - z0) * scale];
  const disc = (p, rad, c, a = 1) => { const s = toS(p); for (let dy = -Math.ceil(rad); dy <= Math.ceil(rad); dy++) for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) if (dx * dx + dy * dy <= rad * rad) px2(Math.round(s[0] + dx), Math.round(s[1] + dy), c, a); };
  const line = (pts, wpx, c, a = 1) => {
    const r = Math.max(0.5, wpx / 2);
    for (let i = 0; i < pts.length - 1; i++) {
      const A = toS(pts[i]), B = toS(pts[i + 1]), n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) * 2));
      for (let t = 0; t <= n; t++) { const X = A[0] + (B[0] - A[0]) * t / n, Y = A[1] + (B[1] - A[1]) * t / n; for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (dx * dx + dy * dy <= r * r) px2(Math.round(X + dx), Math.round(Y + dy), c, a); }
    }
  };
  const fillPoly = (poly, c, a) => {
    const s = poly.map(toS); let mn = 1e9, mx = -1e9; for (const p of s) { mn = Math.min(mn, p[1]); mx = Math.max(mx, p[1]); }
    for (let y = Math.max(0, Math.floor(mn)); y <= Math.min(H - 1, Math.ceil(mx)); y++) {
      const xs = [], yy = y + 0.5;
      for (let i = 0; i < s.length; i++) { const A = s[i], B = s[(i + 1) % s.length]; if ((A[1] > yy) !== (B[1] > yy)) xs.push(A[0] + (yy - A[1]) * (B[0] - A[0]) / (B[1] - A[1])); }
      xs.sort((p, q2) => p - q2);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.max(0, Math.ceil(xs[i] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[i + 1] - 0.5)); x++) px2(x, y, c, a);
    }
  };
  for (const l of plan.lots) fillPoly(l.poly, l.buildable ? [150, 205, 120] : [200, 120, 110], 0.35);
  const homes = new Set(sim.npcs.map((n) => n.home.lotId));
  for (const l of plan.lots) if (homes.has(l.id)) fillPoly(l.poly, [255, 255, 255], 0.55);
  for (const r of plan.roads) line(r.pts, Math.max(1.2, r.width * scale), r.bridge ? [190, 150, 100] : [245, 240, 225], 0.9);
  sim.npcs.forEach((n, i) => line(trails[i], Math.max(1.4, 1.6 * Math.min(2, scale * 2)), COLORS[i % COLORS.length], 0.8));
  for (const o of sim.objects.world.list()) {
    const p = [o.pos[0], o.pos[2]];
    disc(p, Math.max(1.6, 1.4 * scale), o.defId === 'lamp' ? [255, 230, 60] : o.defId === 'bench' ? [120, 80, 40] : [160, 110, 60], 1);
  }
  sim.npcs.forEach((n, i) => { disc([n.home.x, n.home.z], Math.max(2.2, 2 * scale), [255, 255, 255], 1); disc([n.home.x, n.home.z], Math.max(1.4, 1.2 * scale), COLORS[i % COLORS.length], 1); disc(n.pos, Math.max(2.5, 2.2 * scale), [20, 20, 20], 1); });
  return png(W, H, buf);
}

const fmt = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
let failed = false;
for (const preset of PRESET_IDS) {
  const t0 = Date.now();
  const ctx = buildContext({ seed, preset });
  const sim = Sim.create({ seed, preset, npcCount: 8 }, { ctx });
  const trails = sim.npcs.map((n) => [n.pos.slice()]);
  const total = Math.round(days * 2880);
  const musicAt = 2880 + Math.round((10 - 5) * 120), playerAt = 2880 + Math.round((14 - 5) * 120);
  const src = sim.npcs[0].home.door;
  for (let i = 0; i < total; i++) {
    if (days >= 2 && i === musicAt) sim.submit({ type: 'music', id: 'band', x: src[0], z: src[1], radius: 40 });
    if (days >= 2 && i === musicAt + 240) sim.submit({ type: 'music', id: 'band', on: false });
    if (days >= 2 && i === playerAt) { const p = sim.npcs[1].pos; sim.submit({ type: 'player', id: 'visitor', x: p[0] + 5, z: p[1] }); }
    sim.step();
    if (i % 4 === 0) sim.npcs.forEach((n, k) => { const t = trails[k], l = t[t.length - 1]; if (Math.hypot(n.pos[0] - l[0], n.pos[1] - l[1]) > 0.5) t.push(n.pos.slice()); });
  }
  console.log(`\n=== ${preset}  seed ${seed}  ${days} days  ${Date.now() - t0} ms  hash ${sim.hash().slice(0, 12)}`);
  console.log(`sites ${ctx.plan.stats.sites}, lots ${ctx.plan.stats.lots}, objects ${sim.objects.world.list().length}, ops ${sim.objects.log.length}, nav nodes ${ctx.nav.nodes.length}`);
  console.log('stats', JSON.stringify(sim.stats), 'weather', sim.weather().state);
  console.log('NPC          home   wake  bed   mood      traits(soc/lazy/cur/owl)');
  for (const n of sim.npcs) console.log(`${(n.name + ' ' + n.id).padEnd(12)} ${n.home.lotId.padEnd(6)} ${fmt(n.wake)} ${fmt(n.bed)} ${n.mood.toFixed(2).padStart(5)}     ${n.traits.sociability}/${n.traits.laziness}/${n.traits.curiosity}/${n.traits.nightOwl}`);
  const nameOf = (id) => sim.npcs.find((n) => n.id === id)?.name || id;
  console.log('timeline day 2 (first 40 non-wander lines):');
  let shown = 0;
  for (const e of sim.log) {
    if (e.day !== 2 || e.kind === 'wander' || (e.kind === 'goTo' && e.purpose === 'home') || e.kind === 'weather') continue;
    const detail = Object.entries(e).filter(([k]) => !['t', 'day', 'hour', 'who', 'kind'].includes(k)).map(([k, v]) => `${k}=${Array.isArray(v) ? v.map(Math.round) : v}`).join(' ');
    console.log(`  D${e.day} ${fmt(e.hour)}  ${nameOf(e.who).padEnd(8)} ${e.kind.padEnd(11)} ${detail}`);
    if (++shown >= 40) break;
  }
  const counts = {}; for (const e of sim.log) counts[e.kind] = (counts[e.kind] || 0) + 1;
  console.log('event counts', JSON.stringify(counts));
  // invariants worth shouting about
  const home = sim.positions().every((p) => p.asleep || p.action !== 'none');
  if (sim.stats.teleports) { failed = true; console.log('!! teleports:', sim.stats.teleports); }
  if (!home) console.log('(note) some NPC has no action at the end tick');
  await writeFile(path.join(out, `sim-${preset}.png`), render(ctx, sim, trails, 0, 0, ctx.island.size, 1024));
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
  for (const t of trails) for (const p of t) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[1]); mxz = Math.max(mxz, p[1]); }
  const span = Math.max(260, Math.max(mxx - mnx, mxz - mnz) * 1.25);
  await writeFile(path.join(out, `sim-${preset}-zoom.png`), render(ctx, sim, trails, (mnx + mxx) / 2, (mnz + mxz) / 2, span, 1140));
}
console.log('\nsim shots in', out);
if (failed) process.exitCode = 1;
