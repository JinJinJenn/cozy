import { Replica } from '../index.js';

export function mk(peerId, owner = 'alice') {
  return new Replica({ worldId: 'w', owner, peerId });
}
// deliver every op in `from`'s log that `to` has not seen
export function sync(to, from) {
  for (const op of [...from.log]) to.receive(op);
}
export function syncAll(...rs) {
  for (const a of rs) for (const b of rs) if (a !== b) sync(a, b);
}
export function layerState(r, objectId, layerId) {
  return r.world.get(objectId).layers.find((l) => l.id === layerId).state;
}
