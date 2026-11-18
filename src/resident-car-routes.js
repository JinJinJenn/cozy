import {buildRoadGraph, roadsWithin} from '../packages/sim/src/nav.js';
import {hashFloat} from '../packages/sim/src/rng.js';
import {distSeg} from '../packages/settlement/src/geom.js';

const joinTolerance = .25; // Settlement control points are rounded to decimetres.
const separation = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Insert the actual pick-up and drop-off points before splitting roads at crossings.
function addressRoads(plan, homes) {
  const roads = plan.roads.filter(r => r.class !== 'path' && r.width >= 4).map((r, id) => ({
    id, frontage: r.id, width: r.width, bridge: r.bridge, pts: r.pts, stops: r.pts.map(() => []), addresses: []
  }));
  const frontages = new Map(roads.map(r => [r.frontage, r]));
  for (const home of homes) {
    const p = home.approach || home.entry;
    let best, distance = 22;
    const frontage = home.road && frontages.get(home.road);
    for (const road of frontage && !frontage.bridge ? [frontage] : roads) {
      if (road.bridge) continue;
      for (let i = 1; i < road.pts.length; i++) {
        const hit = distSeg(p.x, p.z, ...road.pts[i - 1], ...road.pts[i]);
        if (hit.d >= distance) continue;
        best = {home, road, segment: i, hit};
        distance = hit.d;
      }
    }
    if (best) {
      best.road.stops[best.segment].push(best);
      best.road.addresses.push(best);
    }
  }
  let offset = 0;
  for (const road of roads) {
    const points = [];
    for (let i = 0; i < road.pts.length; i++) {
      for (const stop of road.stops[i].sort((a, b) => a.hit.t - b.hit.t)) {
        const point = [stop.hit.x, stop.hit.z];
        if (separation(points.at(-1), point) > .01) points.push(point);
        stop.node = offset + points.length - 1;
      }
      if (!points.length || separation(points.at(-1), road.pts[i]) > .01) points.push(road.pts[i]);
    }
    road.pts = points;
    offset += points.length;
  }
  return roads;
}

// A rounded T or a shared endpoint can have several node IDs at one crossing.
// Give the entire junction one reservation, including cars on different roads.
function mergeJunctions(graph) {
  const {nodes, adj} = graph;
  const roots = nodes.map((_, i) => i);
  function root(i) {
    while (roots[i] !== i) i = roots[i] = roots[roots[i]];
    return i;
  }
  adj.forEach((edges, i) => {
    for (const [j, length] of edges) if (length <= joinTolerance) roots[root(j)] = root(i);
  });
  const merged = nodes.map(() => []);
  adj.forEach((edges, i) => {
    const a = root(i);
    for (const [j, , road] of edges) {
      const b = root(j);
      if (a === b || road === null || merged[a].some(e => e[0] === b)) continue;
      merged[a].push([b, separation(nodes[a], nodes[b]), road]);
    }
  });
  return {nodes, adj: merged, root};
}

function laneRoute(ids, graph, roads) {
  const {nodes, adj} = graph;
  const legs = [], junctions = [];
  for (let i = 1; i < ids.length; i++) {
    const a = nodes[ids[i - 1]], b = nodes[ids[i]];
    const [, length, road] = adj[ids[i - 1]].find(edge => edge[0] === ids[i]);
    const dx = (b[0] - a[0]) / length, dz = (b[1] - a[1]) / length;
    const lane = Math.min(1.55, roads[road].width * .24);
    legs.push({dx, dz, length, start: [a[0] - dz * lane, a[1] + dx * lane],
      end: [b[0] - dz * lane, b[1] + dx * lane]});
  }
  const first = legs[0], start = nodes[ids[0]];
  const pickupRoad = adj[ids[0]].find(edge => edge[0] === ids[1])[2];
  const curbOffset = roads[pickupRoad].width / 2 + .7;
  const curb = [start[0] - first.dz * curbOffset, start[1] + first.dx * curbOffset];
  const points = [first.start];
  for (let i = 1; i < legs.length; i++) {
    const before = legs[i - 1], after = legs[i], id = ids[i];
    if (adj[id].length >= 3) junctions.push({id, x: nodes[id][0], z: nodes[id][1]});
    const dot = before.dx * after.dx + before.dz * after.dz;
    if (dot > .99999999 && separation(before.end, after.start) < .01) continue;
    // Intersect the two offset lane lines, then round off the corner with a
    // quadratic. Bound the trim by both adjoining lengths on short streets.
    const cross = before.dx * after.dz - before.dz * after.dx;
    const ex = after.start[0] - before.end[0], ez = after.start[1] - before.end[1];
    const miter = Math.abs(cross) > .001 ? (ex * after.dz - ez * after.dx) / cross : 0;
    const trim = Math.min(4.6, before.length * .45, after.length * .45);
    const bend = [before.end[0] + before.dx * Math.max(-trim, Math.min(trim, miter)),
      before.end[1] + before.dz * Math.max(-trim, Math.min(trim, miter))];
    const entry = [before.end[0] - before.dx * trim, before.end[1] - before.dz * trim];
    const exit = [after.start[0] + after.dx * trim, after.start[1] + after.dz * trim];
    points.push(entry);
    for (let step = 1; step <= 5; step++) {
      const t = step / 5, u = 1 - t;
      points.push([u*u*entry[0] + 2*u*t*bend[0] + t*t*exit[0], u*u*entry[1] + 2*u*t*bend[1] + t*t*exit[1]]);
    }
  }
  points.push(legs.at(-1).end);
  return {points, junctions, curb};
}

export function planResidentVisits(plan, homes, seed) {
  const roads = addressRoads(plan, homes);
  const graph = mergeJunctions(buildRoadGraph(roads, joinTolerance, true));
  const addresses = roads.flatMap(r => r.addresses);
  for (const a of addresses) a.node = graph.root(a.node);
  const visits = new Map();
  for (const road of roads) {
    const ranked = road.addresses.sort((a, b) => hashFloat(seed, a.home.id) - hashFloat(seed, b.home.id));
    for (const source of ranked.slice(0, Math.ceil(ranked.length / 9))) {
      const {distance, previous} = roadsWithin(graph.adj, source.node, 230);
      const candidates = [];
      for (const a of addresses) {
        if (distance[a.node] < 42 || !Number.isFinite(distance[a.node])) continue;
        const score = Number(a.road !== source.road) + hashFloat(seed, source.home.id, a.home.id);
        candidates.push({dest: a, score});
      }
      if (!candidates.length) continue;
      const circle = candidates.sort((a, b) => b.score - a.score).slice(0, 3).map(({dest}) => {
        const ids = [];
        for (let i = dest.node; i !== -1; i = previous[i]) ids.push(i);
        const inbound = laneRoute(ids, graph, roads);
        const outbound = laneRoute(ids.reverse(), graph, roads);
        return {source: source.home, dest: dest.home, outbound, inbound};
      });
      visits.set(source.home.id, circle);
    }
  }
  return visits;
}
