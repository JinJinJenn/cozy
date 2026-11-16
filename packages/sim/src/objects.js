// Bridge to @cozy/objects: default placement, seat/lamp queries, NPC actions with a distinct peer id.
import { Replica } from '../../objects/index.js';

export const HOST_PEER = 'host'; // world owner, only used to place the defaults
export const NPC_PEER = 'npcs'; // every NPC action is an op authored by this peer; the NPC id rides in params.who

export const npcWho = (npcId) => `npc:${npcId}`;
const layerOf = (obj, id) => obj.layers.find((l) => l.id === id);

export function createObjects(worldId = 'island') {
  return new Replica({ worldId, owner: HOST_PEER, peerId: HOST_PEER });
}
// Re-open the host's replica as the NPC peer (keeps the full op log, mints ids under 'npcs').
export function asNpcReplica(hostRep) {
  return Replica.fromJSON(hostRep.toJSON(), { peerId: NPC_PEER });
}

// Place lamps, benches and chairs near town centres and at homes. rng is the sim RNG.
export function placeDefaults(hostRep, ctx, homes, rng) {
  const { plan, nav } = ctx;
  const place = (def, x, z, rot) => hostRep.place(def, { pos: [round(x), round(nav.height(x, z)), round(z)], rot: Math.round(rot) });
  const taken = [];
  const free = (x, z, d) => nav.land(x, z) && taken.every((t) => Math.hypot(t[0] - x, t[1] - z) >= d);
  const offsetPoint = (i, side, off) => {
    const nd = nav.nodes[i];
    const nb = nav.adj[i][0] ? nav.nodes[nav.adj[i][0][0]] : [nd[0] + 1, nd[1]];
    const dx = nb[0] - nd[0], dz = nb[1] - nd[1], l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * side, pz = (dx / l) * side;
    return { x: nd[0] + px * off, z: nd[1] + pz * off, rot: (Math.atan2(-pz, -px) * 180) / Math.PI };
  };
  for (const site of plan.sites.slice(0, 6)) {
    const near = [];
    for (let i = 0; i < nav.nodes.length; i++) {
      const d = Math.hypot(nav.nodes[i][0] - site.x, nav.nodes[i][1] - site.z);
      if (d >= 3 && d <= site.radius * 0.8) near.push(i);
    }
    if (!near.length) continue;
    const want = [['lamp', 3, 14], ['bench', 2, 9], ['chair', 2, 7]];
    for (const [def, count, gap] of want) {
      let made = 0;
      for (let tries = 0; tries < 40 && made < count; tries++) {
        const i = near[rng.int(near.length)];
        const p = offsetPoint(i, rng.chance(0.5) ? 1 : -1, def === 'lamp' ? 2.4 : 2.9);
        if (!free(p.x, p.z, gap)) continue;
        taken.push([p.x, p.z]);
        place(def, p.x, p.z, p.rot);
        made++;
      }
    }
  }
  for (const h of homes) {
    const dx = h.door[0] - h.x, dz = h.door[1] - h.z, l = Math.hypot(dx, dz) || 1;
    const ux = dx / l, uz = dz / l;
    const rot = (Math.atan2(uz, ux) * 180) / Math.PI;
    const lamp = [h.x + ux * Math.min(l, 4) - uz * 2, h.z + uz * Math.min(l, 4) + ux * 2];
    const chair = [h.x + ux * Math.min(l, 3) + uz * 2, h.z + uz * Math.min(l, 3) - ux * 2];
    if (free(lamp[0], lamp[1], 3)) { taken.push(lamp); place('lamp', lamp[0], lamp[1], rot); }
    if (free(chair[0], chair[1], 3)) { taken.push(chair); place('chair', chair[0], chair[1], rot); }
  }
}
const round = (v) => Math.round(v * 100) / 100;

// ---- queries -----------------------------------------------------------------------------------------

export function seatInfo(obj) {
  if (obj.defId === 'chair') {
    const l = layerOf(obj, 'sit');
    return l ? { layerId: 'sit', join: 'sit', leave: 'stand', cap: 1, users: l.state.occupant ? [l.state.occupant] : [] } : null;
  }
  if (obj.defId === 'bench') {
    const l = layerOf(obj, 'social');
    return l ? { layerId: 'social', join: 'join', leave: 'leave', cap: l.state.capacity, users: l.state.occupants.slice() } : null;
  }
  return null;
}
export const lampOn = (obj) => !!layerOf(obj, 'toggle')?.state.on;
export const lampUser = (obj) => layerOf(obj, 'npc')?.state.user || null;

// Safe live action: returns {ok:true} or {ok:false, code}. Refusals never throw into the sim.
export function tryAct(rep, objectId, layerId, action, params) {
  try {
    rep.act(objectId, layerId, action, params);
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e.code || String(e.message) };
  }
}
