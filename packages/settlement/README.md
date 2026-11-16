# settlement

Seeded, deterministic town planner for island-gen heightfields. ES modules, Node >=20, no dependencies, no drawing (data only).

```js
import {generate} from '../island-gen/index.js';
import {generateSettlement,flattenHeightfield,createFlattenHook} from './index.js';
const island=generate({seed:'cozy-1',preset:'harborTown'});
const plan=generateSettlement(island,{seed:'cozy-1',style:'harborTown'});   // style defaults to island.presetId
const graded=flattenHeightfield(island,plan);                               // Float32Array COPY, input untouched
island.flattenHook=createFlattenHook(plan);                                 // hook shape: (island) => graded heightfield copy
```
`generateTown` is an alias of `generateSettlement`. It reads only `heightfield, water, size, grid, cell, seaLevel` (k = j*grid+i, row = z, x = -size/2 + i*cell), so it does not import island-gen.

## Output (plain JSON, world metres, coordinates rounded)
- `sites[]` town centres: `{id,x,z,h,flatFrac,flatArea,coastDist,riverMouth,score,slopeLevel,landFrac,radius}`. Chosen from flat dry land (slope limit, minimum flat fraction in a 65 m window, thresholds relax until enough sites), scored for flatness, distance to the sea (sweet spot about 70 m) and river mouths. All sites sit on the single largest connected landmass (roads never cross the sea), so an archipelago yields sites on its main island only. `landFrac` = dry fraction in a wider window (style `landFrac`/`landRadius`), which rejects thin coastal strips and isthmus sites.
- `roads[]` `{id,class:'main'|'street'|'path',width,bridge,kind?,pts:[[x,z]...]}`. Slope-aware A* on the heightfield. Sea is never crossed. Inland water is crossed only where it is narrow (thickness limit), as separate pieces with `bridge:true` and `kind:'ford'` (<=10 m) or `'bridge'`.
- `blocks[]` `{id,townId,poly,area,lots,roadIds}`: free space enclosed by roads, water and cliffs (1 m raster, flood fill, traced outline).
- `lots[]` (plots) `{id,blockId,townId,poly,frontageRoadId,area,slope,buildable,h,size:'small'|'medium'|'large',district:'centre'|'waterfront'|'residential'|'outskirts',facing,shape:'quad'|'corner'|'irregular'}`. Cut along the street edge of each block (street-first), inside the block, no overlaps. `poly` is no longer always a 4-point rectangle: `quad` follows the local street normal (plots fan along curved frontage), `corner` wraps a sharp block corner (5+ vertices), `irregular` is a convex 3-10 vertex fill of leftover block interior that still reaches a street. Every plot polygon is simple (no self-crossing); frontage must lie within a few metres of a road edge (never a shore or cliff edge). Towns with overlapping windows do not claim the same ground twice. `buildable` = dry, big enough, mean slope <= `params.slopeLimit`.
- `layers` minimap-ready: `roads[{id,class,width,bridge,xz:[x,z,x,z...]}]`, `plots[{id,buildable,district,size,xz}]`, `blocks`, `sites`.
- `stats`: counts, `unconnectedSites`, `failedRoutes`, `relaxedRoutes`, `droppedRoadPieces`, `ms`.

## Styles (`src/styles.js`, data only)
| id | street rule |
|---|---|
| harborTown | rectangular grid aligned to the nearest shore, central avenues are `main` |
| meadowCove | winding spokes (noisy cost) plus ring streets |
| sandbarArchipelago | `path` boardwalks: spokes to the shore plus a shore-hugging ring |
| pineHighlands | hard grade limit so streets switch back, fewer rings |
Unknown ids fall back to meadowCove. Main roads form a coast-hugging loop through the town centres (ordered by angle) plus one shortcut branch when there are 4+ sites. Routes use progressive grade relaxation (limit x1, 1.4, 2, 3, 5) so a route only fails when no grade connects the two points; `stats.relaxedRoutes` counts how many needed it. Components that cannot reach each other are skipped and listed in `stats.unconnectedSites` (empty with the default one-landmass site rule).

Road polylines are smoothed (1-2-1 relax, Chaikin, then simplified back to few points) and re-checked: sea state along the curve, and grade against the route's limit; failing that the gentler smoothing, then the raw path, is used. Blocks use a small gap closing step (roads dilated 2 m for the flood fill, regions regrown) so dead-end streets that stop a few metres short no longer leak.

## Flatten
`flattenHeightfield(island,plan,{shoulder=7,smoothWin=24,pads,roads})` grades road beds to a smoothed longitudinal profile (gentle cut and fill, smoothstep shoulder), then levels buildable plots to their mean height. Bridges, sea and water cells are left alone.

## Determinism
Own seeded RNG, explicit tie-breaks in the heap and sorts. Same island + seed + style gives identical JSON (except `stats.ms`).

## Debug
`node tools/town-debug.mjs [outDir] [seed]` renders `town-<preset>.png` and `town-<preset>-zoom.png` into `docs/shots/<UTC date>/`.

## Tests
`npm test` at the repo root, or `node --test tests/*.test.mjs` here. A synthetic dome island (narrow river, wide lake) covers the bridge and sea rules; four real presets get loose floors only, since terrain may change.

## Known weaknesses
Streets that stop more than about 4 m short of another still leak, so some areas yield no blocks (pine). Pine switchbacks come only from the A* grade limit (no explicit switchback insertion); relaxed fallback routes can wiggle along rivers. Boardwalks never cross open water, so other islands are simply left unsettled. Plots have no alleys; irregular fills are convex hulls, so very concave leftovers are bisected or dropped. Sites are not guaranteed to be on the coast. Shape quality is checked by invariant tests only (simple polygons, under 10% pairwise overlap).
