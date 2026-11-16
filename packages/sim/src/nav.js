// Walkable network: graph over settlement road points, land test, straight-line fallback.
// Never enters the sea: every free-standing leg is sampled every ~2 m against the heightfield.

export function makeLand(island) {
  const q = island.island;
  const sea = island.seaLevel || 0;
  const land = (x, z) => q.sample(x, z) > sea + 0.35 && q.waterAt(x, z) <= 0.02;
  // skipEnd: ignore the last few metres (a road node may sit on a ford or bridge deck)
  const clearLine = (a, b, skipEnd = 0) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(d / 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (skipEnd > 0 && d * (1 - t) < skipEnd) break;
      if (!land(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
    }
    return true;
  };
  const dryLine = (a, b, skipEnd = 0) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(d / 1.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (skipEnd > 0 && d * (1 - t) < skipEnd) break;
      if (q.sample(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) <= sea + 0.05) return false;
    }
    return true;
  };
  return { land, clearLine, dryLine, height: (x, z) => q.sample(x, z) };
}

class Heap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  less(i, j) {
    const x = this.a[i], y = this.a[j];
    return x.f < y.f || (x.f === y.f && x.n < y.n); // explicit tie-break: deterministic
  }
  push(v) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

export function buildNav(plan, island, { joinDist = 10 } = {}) {
  const lnd = makeLand(island);
  const nodes = [];
  const adj = [];
  const roadOf = [];
  const add = (x, z, rid) => {
    nodes.push([x, z]);
    adj.push([]);
    roadOf.push(rid);
    return nodes.length - 1;
  };
  const link = (i, j) => {
    if (i === j) return;
    const w = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
    adj[i].push([j, w]);
    adj[j].push([i, w]);
  };
  // 1. road points become nodes, consecutive points become segments (linked later, once crossings are known)
  const segs = [];
  for (const r of plan.roads) {
    let prev = -1;
    for (const p of r.pts) {
      const k = add(p[0], p[1], r.id);
      if (prev >= 0) segs.push({ a: prev, b: k, road: r.id, extra: [] });
      prev = k;
    }
  }
  // 2. crossings and T-junctions: roads that touch mid-segment share a node, so the graph is connected like the streets
  const SC = 24;
  const sgrid = new Map();
  const skey = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  segs.forEach((sg, i) => {
    const A = nodes[sg.a], B = nodes[sg.b];
    const x0 = Math.floor((Math.min(A[0], B[0]) - joinDist) / SC), x1 = Math.floor((Math.max(A[0], B[0]) + joinDist) / SC);
    const z0 = Math.floor((Math.min(A[1], B[1]) - joinDist) / SC), z1 = Math.floor((Math.max(A[1], B[1]) + joinDist) / SC);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = skey(cx, cz);
      if (!sgrid.has(k)) sgrid.set(k, []);
      sgrid.get(k).push(i);
    }
  });
  const seen = new Set();
  const project = (P, sg) => {
    const A = nodes[sg.a], B = nodes[sg.b], dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz || 1;
    const t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dz) / l2;
    const tc = Math.max(0, Math.min(1, t));
    return { t, d: Math.hypot(A[0] + dx * tc - P[0], A[1] + dz * tc - P[1]) };
  };
  for (const list of sgrid.values()) {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const i = Math.min(list[x], list[y]), j = Math.max(list[x], list[y]);
      const pk = i * 1000003 + j;
      if (seen.has(pk)) continue;
      seen.add(pk);
      const S1 = segs[i], S2 = segs[j];
      if (S1.road === S2.road) continue;
      const A = nodes[S1.a], B = nodes[S1.b], C = nodes[S2.a], D = nodes[S2.b];
      const r1x = B[0] - A[0], r1z = B[1] - A[1], r2x = D[0] - C[0], r2z = D[1] - C[1];
      const den = r1x * r2z - r1z * r2x;
      let done = false;
      if (Math.abs(den) > 1e-9) {
        const t = ((C[0] - A[0]) * r2z - (C[1] - A[1]) * r2x) / den;
        const u = ((C[0] - A[0]) * r1z - (C[1] - A[1]) * r1x) / den;
        if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) {
          const X = add(A[0] + r1x * t, A[1] + r1z * t, -1);
          S1.extra.push({ t, node: X });
          S2.extra.push({ t: u, node: X });
          done = true;
        }
      }
      if (done) continue;
      // T-junction: an endpoint of one segment lies within joinDist of the other's interior
      for (const [sa, sb] of [[S1, S2], [S2, S1]]) for (const e of [sa.a, sa.b]) {
        const pr = project(nodes[e], sb);
        if (pr.d <= joinDist && pr.t > 0.001 && pr.t < 0.999) sb.extra.push({ t: pr.t, node: e });
      }
    }
  }
  for (const sg of segs) {
    const chain = [{ t: 0, node: sg.a }, ...sg.extra.sort((p, q) => p.t - q.t || p.node - q.node), { t: 1, node: sg.b }];
    for (let k = 0; k + 1 < chain.length; k++) link(chain[k].node, chain[k + 1].node);
  }
  // 3. endpoint-to-endpoint joins within joinDist
  const CELL = 4;
  const grid = new Map();
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  nodes.forEach((p, i) => {
    const cx = Math.floor(p[0] / CELL), cz = Math.floor(p[1] / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const lst = grid.get(key(cx + dx, cz + dz));
      if (!lst) continue;
      for (const j of lst) if (roadOf[j] !== roadOf[i] && Math.hypot(nodes[j][0] - p[0], nodes[j][1] - p[1]) <= joinDist) link(i, j);
    }
    const k = key(cx, cz);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  // components
  const comp = new Int32Array(nodes.length).fill(-1);
  const compSize = [];
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const id = compSize.length;
    let n = 0;
    const st = [s];
    comp[s] = id;
    while (st.length) {
      const u = st.pop();
      n++;
      for (const [v] of adj[u]) if (comp[v] < 0) { comp[v] = id; st.push(v); }
    }
    compSize.push(n);
  }
  let bigComp = 0;
  compSize.forEach((n, i) => { if (n > compSize[bigComp]) bigComp = i; });

  // nearest node reachable by a clear straight line (within maxD)
  function nearestNode(x, z, maxD = 60, compId = null) {
    const c = [];
    for (let i = 0; i < nodes.length; i++) {
      if (compId !== null && comp[i] !== compId) continue;
      const d = Math.hypot(nodes[i][0] - x, nodes[i][1] - z);
      if (d <= maxD) c.push([d, i]);
    }
    c.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    // standing on a ford or bridge (not land): the nearest road node is the way off
    const onWay = !lnd.land(x, z);
    for (let k = 0; k < Math.min(c.length, 8); k++) {
      const n = nodes[c[k][1]];
      if (onWay || c[k][0] < 1 || lnd.clearLine([x, z], n, 3)) return c[k][1];
    }
    // last resort for short hops: wade through shallow inland water, but never cross the sea
    for (let k = 0; k < Math.min(c.length, 8); k++) {
      if (c[k][0] <= 30 && lnd.dryLine([x, z], nodes[c[k][1]], 3)) return c[k][1];
    }
    return -1;
  }

  function astar(a, b) {
    const g = new Float64Array(nodes.length).fill(Infinity);
    const prev = new Int32Array(nodes.length).fill(-1);
    const h = (i) => Math.hypot(nodes[i][0] - nodes[b][0], nodes[i][1] - nodes[b][1]);
    const heap = new Heap();
    g[a] = 0;
    heap.push({ f: h(a), n: a });
    while (heap.size) {
      const { n } = heap.pop();
      if (n === b) break;
      for (const [v, w] of adj[n]) {
        const ng = g[n] + w;
        if (ng < g[v]) { g[v] = ng; prev[v] = n; heap.push({ f: ng + h(v), n: v }); }
      }
    }
    if (!Number.isFinite(g[b])) return null;
    const out = [];
    for (let i = b; i >= 0; i = prev[i]) out.push(i);
    return out.reverse();
  }

  // Route from a world position to another. Returns {pts:[[x,z]...], len} or null.
  function findPath(from, to, compId = null) {
    const direct = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (direct < 0.5) return { pts: [to.slice()], len: direct };
    if (direct <= 24 && lnd.clearLine(from, to)) return { pts: [to.slice()], len: direct };
    const a = nearestNode(from[0], from[1], 85, compId);
    if (a < 0) return null;
    const b = nearestNode(to[0], to[1], 85, comp[a]);
    if (b < 0) return null;
    const ids = astar(a, b);
    if (!ids) return null;
    const pts = ids.map((i) => nodes[i].slice());
    pts.push(to.slice());
    let len = 0, c = from;
    for (const p of pts) { len += Math.hypot(p[0] - c[0], p[1] - c[1]); c = p; }
    return { pts: simplify(pts), len };
  }

  // drop collinear-ish interior points to keep paths short (never drop junction turns)
  function simplify(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
      const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      if (cross > 0.4) out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  return { nodes, adj, comp, compSize, bigComp, roadOf, land: lnd.land, clearLine: lnd.clearLine, height: lnd.height, nearestNode, findPath };
}
