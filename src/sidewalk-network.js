import {buildRoadGraph, mergeJunctions, Heap} from '../packages/sim/src/nav.js';
import {distSeg} from '../packages/settlement/src/geom.js';
import {carriagewayAt} from './street-road-index.js';

const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const searchRadius = 24;
const cell = value => Math.floor(value / 32);

// Each road end has two kerbs. Neighboring ends meet around the same corner.
// Walking across the mouth of a street connects its two separate kerbs.
export function buildSidewalkNetwork(island, canStand) {
  const roads = island.plan.roads;
  const byId = new Map(roads.map(road => [road.id, road]));
  const graph = mergeJunctions(buildRoadGraph(roads, .25, true), .25);
  const nodes = [], links = [], pavements = [], cells = new Map();
  function vertex(x, z) {
    let p = {x, z};
    // A kerb on a sloping shore can graze the waterline. Keep its corner on
    // the nearest usable patch of ground within the width of the pavement.
    if (!canStand(p)) {
      outer: for (const radius of [.35, .7, 1.05]) {
        for (let i = 0; i < 12; i++) {
          const angle = i * Math.PI / 6;
          const q = {x:x + Math.cos(angle)*radius, z:z + Math.sin(angle)*radius};
          if (canStand(q)) { p = q; break outer; }
        }
      }
    }
    links.push([]);
    return nodes.push(p) - 1;
  }
  function link(a, b, extra = 0) {
    const cost = distance(nodes[a], nodes[b]) + extra;
    links[a].push([b, cost]);
    links[b].push([a, cost]);
  }
  const rays = graph.adj.map((edges, i) => edges.map(([to, length, roadId]) => {
    const [x, z] = graph.nodes[i], [ex, ez] = graph.nodes[to];
    const road = byId.get(roadId);
    const width = road.class === 'path' ? 0 : road.width / 2 + (road.bridge ? .48 : 1);
    return {to, length, width, dx:(ex-x)/length, dz:(ez-z)/length, angle:Math.atan2(ez-z, ex-x)};
  }).sort((a, b) => a.angle - b.angle));

  for (let i = 0; i < rays.length; i++) {
    const ends = rays[i], [x, z] = graph.nodes[i];
    for (let j = 0; j < ends.length; j++) {
      const a = ends[j], b = ends[(j + 1) % ends.length];
      const ax = -a.dz * a.width, az = a.dx * a.width;
      const bx = b.dz * b.width, bz = -b.dx * b.width;
      const cross = a.dx * b.dz - a.dz * b.dx;
      // Intersect the two offset edges. Limit the miter independently on
      // short or nearly parallel streets so consecutive corners stay ordered.
      const limit = (t, ray) => {
        const reach = Math.min(ray.length * .45, Math.max(a.width, b.width) * 2);
        return Math.max(-reach, Math.min(reach, t));
      };
      const ta = Math.abs(cross) < .001 ? 0 : limit(((bx-ax)*b.dz - (bz-az)*b.dx)/cross, a);
      const tb = Math.abs(cross) < .001 ? 0 : limit(((bx-ax)*a.dz - (bz-az)*a.dx)/cross, b);
      a.left = vertex(x + ax + a.dx * ta, z + az + a.dz * ta);
      b.right = vertex(x + bx + b.dx * tb, z + bz + b.dz * tb);
      if (a !== b) link(a.left, b.right);
    }
    for (const ray of ends) link(ray.left, ray.right, ray.width ? 5 : 0);
  }

  function indexPavement(a, b) {
    const p = nodes[a], q = nodes[b], edge = {a, b};
    pavements.push(edge);
    for (let x = cell(Math.min(p.x, q.x) - searchRadius); x <= cell(Math.max(p.x, q.x) + searchRadius); x++) {
      for (let z = cell(Math.min(p.z, q.z) - searchRadius); z <= cell(Math.max(p.z, q.z) + searchRadius); z++) {
        const key = x + ',' + z;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(edge);
      }
    }
  }
  for (let i = 0; i < rays.length; i++) for (const ray of rays[i]) {
    if (ray.to <= i) continue;
    const reverse = rays[ray.to].find(r => r.to === i);
    indexPavement(ray.left, reverse.right);
    indexPavement(ray.right, reverse.left);
  }

  function closest(p, radius = searchRadius, exclude = null) {
    let best;
    for (const edge of cells.get(cell(p.x) + ',' + cell(p.z)) || []) {
      if (exclude?.(edge)) continue;
      const a = nodes[edge.a], b = nodes[edge.b];
      const hit = distSeg(p.x, p.z, a.x, a.z, b.x, b.z);
      if (hit.d < radius) { radius = hit.d; best = {x:hit.x, z:hit.z, t:hit.t, edge}; }
    }
    return best;
  }
  // Generated streets sometimes end a few metres short of the next road.
  // Join the actual pavement edges there. A pedestrian arriving halfway down
  // a block can take that connection without doubling back to its far corner.
  const roadGroup = new Int32Array(rays.length).fill(-1);
  const groupOfKerb = [];
  for (let i = 0; i < rays.length; i++) {
    if (roadGroup[i] !== -1 || !rays[i].length) continue;
    const stack = [i];
    roadGroup[i] = i;
    while (stack.length) {
      const at = stack.pop();
      for (const ray of rays[at]) {
        groupOfKerb[ray.left] = groupOfKerb[ray.right] = i;
        if (roadGroup[ray.to] !== -1) continue;
        roadGroup[ray.to] = i;
        stack.push(ray.to);
      }
    }
  }
  const cuts = new Map();
  for (const ends of rays) {
    if (ends.length !== 1) continue;
    for (const n of [ends[0].left, ends[0].right]) {
      const near = closest(nodes[n], searchRadius, edge => groupOfKerb[edge.a] === groupOfKerb[n]);
      if (!near) continue;
      const origin = nodes[n], steps = Math.max(1, Math.ceil(distance(origin, near) / .5));
      let clear = true;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (!canStand({x:origin.x + (near.x-origin.x)*t, z:origin.z + (near.z-origin.z)*t})) { clear = false; break; }
      }
      if (!clear || (distance(origin, near) > 9 && !localWalk(origin, near))) continue;
      const edge = near.edge;
      let join = near.t < .001 ? edge.a : near.t > .999 ? edge.b : null;
      if (join === null) {
        join = vertex(near.x, near.z);
        if (!cuts.has(edge)) cuts.set(edge, []);
        cuts.get(edge).push({t:near.t, n:join});
      }
      link(n, join);
    }
  }
  const original = pavements.splice(0);
  cells.clear();
  for (const edge of original) {
    const points = [edge.a, ...(cuts.get(edge) || []).sort((a,b) => a.t-b.t).map(p => p.n), edge.b];
    for (let i = 1; i < points.length; i++) {
      link(points[i-1], points[i]);
      indexPavement(points[i-1], points[i]);
    }
  }
  // A nearby garden or a walk directly across the street needs no detour.
  function localWalk(from, to) {
    const length = distance(from, to);
    if (length < 2.5) return true;
    if (length > 24) return false;
    const dx = (to.x-from.x)/length, dz = (to.z-from.z)/length;
    const steps = Math.ceil(length / 1.5);
    for (let i = 0; i <= steps; i++) {
      const t = length * i / steps;
      const road = carriagewayAt(island, from.x + dx*t, from.z + dz*t);
      if (road && Math.abs(dx*road.dx + dz*road.dz) > .4) return false;
    }
    return true;
  }
  // Kerbs follow the road plan even where the outer bank dips underwater.
  // Recheck any affected corners when a new room layout is applied.
  let checkedRevision;
  const valid = new Map(), detours = new Map();
  function detourCost(a, b) {
    const key = Math.min(a,b)*nodes.length + Math.max(a,b);
    if (detours.has(key)) return detours.get(key);
    const cost = groundDetour(nodes[a],nodes[b]);
    detours.set(key,cost);
    return cost;
  }
  // Prefer an unobstructed pavement across the road when a bank or a
  // building would send the local walking solver on a long detour.
  function groundDetour(p,q) {
    const length = distance(p,q);
    const count = Math.ceil(length);
    for (let i = 1; i < count; i++) {
      const t = i/count;
      if (!canStand({x:p.x+(q.x-p.x)*t, z:p.z+(q.z-p.z)*t})) return length + 30;
    }
    return 0;
  }
  return function sidewalkRoute(from, to, revision = 0) {
    if (revision !== checkedRevision) { valid.clear(); detours.clear(); checkedRevision = revision; }
    if (localWalk(from, to)) return [to];
    const anchor = p => {
      const rejected = new Set();
      for (;;) {
        const near = closest(p, searchRadius, edge => rejected.has(edge));
        if (!near || canStand(near)) return near;
        rejected.add(near.edge);
      }
    };
    const start = anchor(from), end = anchor(to);
    if (!start || !end) return null;
    let winner, best = Infinity;
    if (start.edge === end.edge) {
      const detour = groundDetour(start,end);
      if (!detour) return [start,end,to];
      best = distance(start,end) + detour;
    }
    const heap = new Heap(), costs = new Map(), previous = new Map();
    function offer(n, cost, parent) {
      if (cost >= (costs.get(n) ?? Infinity)) return;
      if (!valid.has(n)) valid.set(n, canStand(nodes[n]));
      if (!valid.get(n)) return;
      costs.set(n, cost);
      previous.set(n, parent);
      heap.push({n, cost, f:cost + distance(nodes[n], end)});
    }
    const lastLeg = new Map();
    for (const n of [end.edge.a,end.edge.b]) lastLeg.set(n, distance(nodes[n],end) + groundDetour(nodes[n],end));
    for (const n of [start.edge.a,start.edge.b]) offer(n, distance(start,nodes[n]) + groundDetour(start,nodes[n]), -1);
    while (heap.size) {
      const {n, cost, f} = heap.pop();
      if (f >= best) break;
      if (cost !== costs.get(n)) continue;
      if (lastLeg.has(n) && cost + lastLeg.get(n) < best) {
        best = cost + lastLeg.get(n);
        winner = n;
      }
      for (const [next, length] of links[n]) offer(next, cost + length + detourCost(n,next), n);
    }
    if (!Number.isFinite(best)) return null;
    const middle = [];
    for (let k = winner; k !== undefined && k !== -1; k = previous.get(k)) middle.push(nodes[k]);
    return [start,...middle.reverse(),end,to];
  };
}
