# @cozy/sim

Small deterministic headless town simulator for the cozy island: 5 to 12 NPCs who wake, walk the settlement roads,
sit on benches and chairs through the objects package, chat, light lamps at dusk, react to music and nearby
players, and are home asleep by night. Pure ES modules, Node >=20, no dependencies, no wall clock, no `Math.random`.
No needs, jobs or economy: it is a routine, not a life sim.

```js
import { Sim } from './index.js';
const sim = Sim.create({ seed: 'cozy-1', preset: 'harborTown', npcCount: 8 });
sim.tickDt(frameSeconds);          // viewer: accumulate frame time, runs whole fixed steps (default 0.5 sim s)
sim.advanceDays(3);                // headless: or sim.advance(steps) / sim.step()
sim.positions();                   // what a viewer draws each frame
sim.clock();                       // { day, hour, hh, mm, phase: night|dawn|day|dusk, label: 'D2 07:30' }
sim.weather();                     // { state: clear|overcast|rain|fog, source: auto|event }  (hook only, no effects)
sim.hash();                        // sha256 of the full state
```

## Tick API

| call | meaning |
|---|---|
| `Sim.create(config, {ctx})` | New sim. Config: `seed, preset, npcCount (clamped 5..12), stepDt (0.5), dayLength (1440 sim s), startHour (5), walkSpeed (3 m/s), tether (170 m), stuckLimit (60 steps)`. `ctx` is optional: `buildContext({seed,preset})` (island + settlement + walk graph, memoised per process). |
| `sim.step()` | One fixed step of `stepDt` sim seconds. Everything advances only here. |
| `sim.tickDt(dt)` | Adds `dt` to an accumulator (part of the state) and runs `floor(acc/stepDt)` steps. Returns steps run. |
| `sim.advance(n)`, `sim.advanceDays(d)` | Loops of `step()`. |
| `sim.submit(event)` | Host-authoritative input, logged with the tick it applies at (see events). |
| `sim.toJSON()` / `Sim.fromJSON(json, {ctx})` | Whole state as plain JSON; restore continues bit-identically. |
| `Sim.replay(config, inputLog, ticks, {ctx})` | Rebuild a sim from config + input log only; `hash()` equals the original. |
| `sim.log` | Event log, plain JSON: `{t (tick), day, hour, who, kind, ...}`. Kinds: `wake sleep goTo wander sitAndRest chat listen greet lamp arriveHome seatRefused teleport unstick weather event`. Capped (`logCap`, oldest dropped, `logDropped` counts). |

One day is 1440 sim seconds by default (one hour is 60 s), 2880 steps. NPCs walk about 180 m per sim hour, so the
sim is built around short tethers: each NPC stays within `tether` metres of its home.

## Host-authoritative: state = seed + logs

The sim never reads anything but its config, its RNG (one uint32 in the state) and the events you submit. The host
keeps `sim.inputLog` (every submitted event with its tick) and replays it deterministically; clients can run their own
copy fed the same log, or just render the host snapshots.

Events (`sim.submit(...)`, applied at the start of the next step):

| event | effect |
|---|---|
| `{type:'music', id, x, z, radius?, on?}` | Playing music (`on:false` stops it). Awake daytime NPCs within reach score "go listen" highly: they walk to a ring 3 to 8 m around the source, listen 40 to 120 s (mood up), re-check when it stops. |
| `{type:'player', id, x, z, near?}` | A player is nearby (`near:false` clears). The nearest NPC within 45 m that has not greeted them in 400 s walks over and waves (`greet` log line). |
| `{type:'weather', state}` | Override weather (`'auto'` returns to the seeded cycle). Exposed value only. |
| `{type:'objectOp', op}` | An op authored by a player replica, fed to the NPCs' objects replica (so players and NPCs share the same occupancy rules). |

Evening and night override everything: from 19:00 (earlier if the route home is long) NPCs only go home, light a
nearby lamp, rest, then sleep at their bedtime (about 20:45 to 21:45). Music and players cannot pull them out.

## Daily routine

Wake (6:00 to 7:15) then utility-based choice at each decision: `wander`, `sitAndRest`, `chat`, `listen` (music),
`greet` (player), `lamp`. Score = base + trait weight (sociability, laziness, curiosity, night owl) + cooldown since
the last sit/chat + small seeded noise. `goTo` is the movement part of every action (`purpose` in the log). Two NPCs on
one bench chat in place. Mood is a scalar that chats, music, greeting and sitting raise.

## Movement

`src/nav.js` builds a graph over settlement road polylines: points are nodes, road crossings and T-junctions get
shared nodes, road ends within 10 m join. Routes are A* over that graph with straight legs between a position and its
nearest road node (sampled every 2 m against the heightfield, so the sea is never entered). Off-road wandering is a
short straight hop on dry land. Each NPC remembers its home road component and stays in it.

Watchdog: an NPC that makes no progress for `stuckLimit` steps is re-planned; a homeward NPC that cannot find a route,
or is not home well after bedtime, is teleported home and the log gets a `teleport` line (`stats.teleports`, expected 0).

## Objects (uses `@cozy/objects`)

At creation the `host` peer places lamps, benches and chairs near each town centre and a lamp plus chair at each home
(the plot door). The sim then owns a replica with peer id `npcs`; every NPC action is an `act` op from that peer with
`who: 'npc:<id>'`:

- seats: `chair` layer `sit` (`sit`/`stand`), `bench` layer `social` (`join`/`leave`, capacity 3). The seat is reserved
  in `sim.reservations` when the NPC decides, claimed on arrival; a refused claim (a player took it) is logged as
  `seatRefused`.
- lamps: `npc` layer (`claim`/`release`) plus `toggle.set`: NPCs switch lamps on after about 18:30 and off after 6:30.

`sim.objects` is the replica; `sim.objectOps(since)` returns ops to forward. A player replica fed those ops sees NPCs
sitting and lamps lit, and its own `sit`/`join` is refused by the same occupancy rules. Player ops go back through
`submit({type:'objectOp', op})`.

## How a viewer consumes NPC positions

```js
// each frame
sim.tickDt(dt);
for (const p of sim.positions()) {
  // p = { id, who:'npc:n3', name, x, z, y (terrain), heading (rad, atan2(dz,dx)), action, purpose,
  //       asleep, seat (objectId|null), mood, moodLabel, homeLotId }
  // x,z are metres on the island plane. Lerp between two snapshots (keep prev + curr) for smooth motion.
  // action: move | idle | sit | chat | chatWait | listen | wave | lamp | sleep | none
  // asleep: hide or show lying in the home plot; seat: snap to that object's pose
}
for (const op of sim.objectOps(sentSoFar)) playerReplica.receive(op); sentSoFar = sim.objects.log.length;
```
The y value is the terrain height only; sit poses come from the object's own `pos`/`rot`.

## Debug

`node tools/sim-debug.mjs [days=3] [seed=cozy-1] [outDir]` runs every preset headless, injects a music event
(day 2, 10:00 to 12:00) and a visitor (14:00), prints a timeline summary and writes `sim-<preset>.png` (island) and
`sim-<preset>-zoom.png` (trails; white plots are homes, black dots are final positions, yellow lamps, brown seats) to
`docs/shots/<UTC date>/`.

## Tests

`node --test packages/sim/tests/*.test.mjs` (the root `npm test` script does not list it yet). Covers: identical hash
for same seed and steps, `tickDt` equivalence, snapshot restore through JSON text, replay from the input log, all NPCs
home and asleep at night on all four presets with zero teleports, no NPC stuck more than 60 steps and none in the sea,
NPC ops authored by the `npcs` peer with all ops accepted, lamps follow the day, music gathering, player greeting,
weather hook, NPC count and home validity.

## Known weaknesses

- Walk graph joins within 10 m, so paths show small spurs at some junctions. Off-road legs are straight lines, so NPCs
  can cut across lot corners and shallow inland water (never the sea).
- Homes cluster around the best-served town; other towns have no residents, and an NPC never leaves its tether.
- No collision or avoidance between NPCs; two can stand on the same spot. Chat does not move the partner, it waits.
- Moods saturate positive over days (no negative drivers). Trait tuning is rough, and sitting right after waking is common.
- The log is unbounded until `logCap` (40000) then drops the oldest, which changes the snapshot (still deterministic).
- One bench slot per NPC is not positioned: seated NPCs snap to the object origin.
