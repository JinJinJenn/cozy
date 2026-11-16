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
- `sites[]` town centres: `{id,x,z,h,flatFrac,flatArea,coastDist,riverMouth,score,radius}`. Chosen from flat dry land (slope limit, minimum flat fraction in a 65 m window, thresholds relax until enough sites), scored for flatness, distance to the sea (sweet spot about 70 m) and river mouths.
- `roads[]` `{id,class:'main'|'street'|'path',width,bridge,kind?,pts:[[x,z]...]}`. Slope-aware A* on the heightfield. Sea is never crossed. Inland water is crossed only where it is narrow (thickness limit), as separate pieces with `bridge:true` and `kind:'ford'` (<=10 m) or `'bridge'`.
- `blocks[]` `{id,townId,poly,area,lots,roadIds}`: free space enclosed by roads, water and cliffs (1 m raster, flood fill, traced outline).
- `lots[]` (plots) `{id,blockId,townId,poly,frontageRoadId,area,slope,buildable,h,size:'small'|'medium'|'large',district:'centre'|'waterfront'|'residential'|'outskirts',facing}`. Cut along the street edge of each block (street-first), inside the block, no overlaps. `buildable` = dry, big enough, mean slope <= `params.slopeLimit`.
- `layers` minimap-ready: `roads[{id,class,width,bridge,xz:[x,z,x,z...]}]`, `plots[{id,buildable,district,size,xz}]`, `blocks`, `sites`.
- `stats`: counts, `unconnectedSites`, `failedRoutes`, `ms`.

## Styles (`src/styles.js`, data only)
| id | street rule |
|---|---|
| harborTown | rectangular grid aligned to the nearest shore, central avenues are `main` |
| meadowCove | winding spokes (noisy cost) plus ring streets |
| sandbarArchipelago | `path` boardwalks: spokes to the shore plus a shore-hugging ring |
| pineHighlands | hard grade limit so streets switch back, fewer rings |
Unknown ids fall back to meadowCove. Main roads form a coast-hugging loop through the town centres (ordered by angle) plus one shortcut branch when there are 4+ sites. Components that cannot reach each other (separate islands) are skipped and listed in `stats.unconnectedSites`.

## Flatten
`flattenHeightfield(island,plan,{shoulder=7,smoothWin=24,pads,roads})` grades road beds to a smoothed longitudinal profile (gentle cut and fill, smoothstep shoulder), then levels buildable plots to their mean height. Bridges, sea and water cells are left alone.

## Determinism
Own seeded RNG, explicit tie-breaks in the heap and sorts. Same island + seed + style gives identical JSON (except `stats.ms`).

## Debug
`node tools/town-debug.mjs [outDir] [seed]` renders `town-<preset>.png` and `town-<preset>-zoom.png` into `docs/shots/<UTC date>/`.

## Tests
`npm test` at the repo root, or `node --test tests/*.test.mjs` here. A synthetic dome island (narrow river, wide lake) covers the bridge and sea rules; four real presets get loose floors only, since terrain may change.

## Known weaknesses
Large unenclosed areas (leaky street networks) yield no blocks; sandbar and pine towns get fewer plots. Roads are routed on the 4 m grid and smoothed, so tight bends can be coarse. Plots are rectangles; no corner or alley handling. Sites are not guaranteed to be on the coast.
