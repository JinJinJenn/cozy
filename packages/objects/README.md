# @cozy/objects

Interactive objects for the cozy island: every object is a list of composable
interaction layers, edited co-op with small replicated ops. ES modules, no
dependencies, deterministic (no clocks, no randomness).

```
npm test            # node --test tests/*.test.mjs
```

```js
import { Replica } from '@cozy/objects';
const me = new Replica({ worldId: 'island', owner: 'alice', peerId: 'alice' });
const lamp = me.place('lamp', { pos: [2, 0, 3] });
me.act(lamp.objectId, 'dim', 'set', { level: 0.4 });   // live action
me.setRole('bob', 'builder');                           // owner grants build
// ship ops to peers: for (const op of me.log) peer.receive(op)
```

## Pieces

| File | What |
|---|---|
| `src/ids.js` | `IdGen`: ids are `peerId:counter` (collision free across peers, no coordination). Same counter mints object, layer and op ids. |
| `src/layers.js` | Layer registry. A layer type = state schema, named actions, UI hook descriptor, optional occupancy. 13 built-ins (below). |
| `src/definitions.js` | Object definitions as data (`lamp`, `chair`, `bench`). Stable string ids, at least 2 layers each. |
| `src/world.js` | World object store, role table, deterministic `plan/apply(op)`, `describeUI(objectId)`, JSON (de)serialisation. |
| `src/replica.js` | One peer: op log, Lamport clock, convergence, local emit, per-builder undo/redo, soft highlights, snapshots. |
| `src/highlight.js` | Stable per-peer highlight colour. |

## Layers

Schema field types: `bool number int enum string nstring color stringList`.
A field marked `runtime` (occupants, npc user) can only change through a
layer action, never through `setLayerState`, so builders cannot forge seats.

| Layer | State | Actions | UI hook |
|---|---|---|---|
| `toggle` | on | toggle, set | switch |
| `dim` | level 0..1 | set, step | slider |
| `tint` | color | set | color |
| `flicker` | enabled, rate, amount | set | switch+sliders |
| `schedule` | enabled, onHour, offHour | set | time-range (`isScheduledOn(state, hour)`) |
| `musicReactive` | enabled, sensitivity, mode | set | switch+select |
| `npcUse` | allowed, user* | claim, release, evict | badge |
| `linkedSwitch` | on, targets[] | flip, set (mirrors `toggle` on targets) | switch+links |
| `sit` | occupant* | sit, stand, evict | seat |
| `lounge` | occupant*, pose | lounge, rise, setPose, evict | seat+select |
| `movable` | enabled, maxStep | nudge (moves the object, never while in use) | dpad |
| `decorate` | items[] | add, remove, clear | item-list |
| `socialSeat` | occupants*, capacity | join, leave, evict | seat-group |

`*` runtime field. An action is `run(state, params, ctx) -> { state, effects? }`
with `ctx = { actor, tick, role }`. It must be pure. Effects: `nudge`, `remote`.
`def.claims` names actions that take a seat: they are refused when any other
layer of the object is occupied (so you cannot sit and lounge on one chair).

`world.describeUI(objectId)` returns one descriptor per layer:
`{ objectId, layerId, layerType, hook, label, bind, controls, actions, state, inUse }`.

Objects made from a definition get layer ids equal to the definition layer
`key` (`toggle`, `dim`, ...). Layers added later get a minted id.

## Op format

Every op is plain JSON:

```
{ id: "bob:17", t: 42, peer: "bob", kind: "...", ...fields }
```

`id` is `peer:counter` and its peer must equal `peer`. `t` is a Lamport time
(max seen + 1). Ordering is `(t, peer, counter)`.

| kind | fields | who |
|---|---|---|
| `place` | `objectId, defId, pos:[x,y,z], rot` (or `objectId, restore:true, pos?, rot?` to revive a removed object) | builder |
| `move` | `objectId, pos` | builder; refused if in use |
| `rotate` | `objectId, rot` (degrees, normalised to 0..360) | builder |
| `remove` | `objectId` (tombstone, id is never reused) | builder; refused if in use |
| `setLayerState` | `objectId, layerId, patch` (schema validated, no runtime fields) | builder |
| `addLayer` | `objectId, layerId, type, state?, index?` | builder |
| `removeLayer` | `objectId, layerId` (an object keeps at least 1 layer) | builder; refused if in use |
| `act` | `objectId, layerId, action, params?` (live action) | everyone |
| `setRole` | `target, role: "builder" \| "visitor"` | owner only |

`act` and `setRole` are additions to the build ops: `act` is how live
interaction is replicated (it carries the action, not a state diff, so two
people toggling really toggle twice, and a second sitter is refused). A new
object id or layer id in `place`/`addLayer` must be minted by the author.

## Convergence

Last-writer-wins by construction: the world is the fold of the op log in
total order `(t, peer, counter)`. Receiving an op that sorts before applied
ones replays the log (cheap: the log is small, ops are tiny). Any two replicas
holding the same op set hold the same world, in any delivery order, with
duplicates ignored. Permission, occupancy and "object removed" verdicts are
taken at the op's position in the total order, so rejections converge too. For
example a concurrent `sit` and `remove` of one chair resolves identically
everywhere (whichever sorts first wins).

There are no hard per-object locks. Concurrent edits to one field resolve to
the later op; the soft highlight tells builders who is touching what so they
avoid it. Rejected ops stay in the log (inert) so every replica agrees.

## Roles

`owner` (the world owner, fixed), `builder` (granted by the owner with
`setRole`, revocable), `visitor` (default). Visitors can use objects (`act`),
builders and the owner can edit. The role of an op's author is evaluated at the
op's position in the order, so an op that arrives before its grant is judged
correctly once the grant arrives. Transport must authenticate `peer`.

## Non-modal build

There is no build mode in the state. Edits apply while everyone else stays in
live mode, and `act` ops are never blocked by build ops. The only edit that
stops a live action is removing the object (`removed`). Edits that would pull
something out from under a user are refused instead: `remove`, `move` and
`removeLayer` on anything in use (`in-use`). Rotating, retinting, adding
layers and so on stay allowed. Builders can free a stuck seat with the layer
`evict` action.

## Undo / redo

Per builder, local only. Every undoable local op pushes its inverse (computed
from the state just before it applied) on that replica stack; `undo()` emits the
inverse as a normal new op so it replicates, `redo()` mirrors it. Inverses:
place->remove, remove->place `restore`, move/rotate->previous value,
setLayerState->previous values of the patched keys, addLayer->removeLayer,
removeLayer->addLayer at its old index with its old state. `act` and `setRole`
are not undoable. If the inverse is refused (seat now occupied, role revoked)
`undo()` throws and the entry stays. Undo restores the recorded previous value,
it does not try to merge with edits other builders made since.

## Soft highlight descriptor

```
replica.focus(objectId, layerId?)  // returns an ephemeral message to broadcast
replica.receivePresence(msg)
replica.highlights({ window = 64, excludeSelf = false })
  -> [{ type: 'soft-highlight', intent: 'editing' | 'focus', objectId, layerId,
        peerId, color, op, t }]
```

Built from explicit focus plus applied build ops in the last `window` logical
ticks. Live actions are not highlighted. Colour is stable per peer.

## Serialisation

`world.toJSON()` / `serializeWorld(world)` (sorted keys, byte-stable) and
`deserializeWorld(text)`. `replica.toJSON()` is `{ v:1, worldId, owner, ops }`;
`Replica.fromJSON(snap, { peerId })` replays it and re-seeds the id counter.
