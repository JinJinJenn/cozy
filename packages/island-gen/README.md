# island-gen

Seeded, deterministic island heightmap generator. No DOM, no renderer, no dependencies. Runs in Node (>=20) and modern browsers (ES modules, JSON import attributes).

```js
import {generate,toHeightmap16,toUnityRaw,PRESET_IDS} from './index.js';
const r=generate({seed:'clover-123',preset:'pineHighlands'});   // ~1-2 s
r.heightfield  // Float32Array grid*grid, metres, sea level 0 (row = z, col = x)
r.water        // Float32Array, river/lake surface levels (0 where none)
r.zones        // the preset's paint rules (height/slope/wetness/noise windows -> colours)
r.flattenHook  // null: reserved for lot/road flatten pads
r.island.sample(x,z) / .slope(x,z) / .paint(x,z,h,s,wet) / .waterAt(x,z) / .shoreAt(angle)
```

World coordinates are metres, x,z in [-size/2, size/2]. Same `(seed, preset, grid)` always yields identical arrays (tested).

## Presets
JSON in `src/presets.json`: size, grid, lobes/scatter, bays, warp, base profile, hills, knolls, mountains, `erosion.stream` (stream-power params), rivers (`minArea`), lakes, beach, terraces, plateaus, strata, palette, zones, camera. Add a locale by adding an object. Shipped: `meadowCove`, `pineHighlands`, `sandbarArchipelago`, `harborTown`.

## Pipeline
1. lobe falloff + domain warp + shelf/deep ocean profile; fBm hills, knolls, ridged mountains
2. stream-power erosion: priority-flood from the sea (fills pits, gives flow order), drainage area, implicit update, hillslope diffusion
3. droplet hydraulic erosion + thermal relax
4. lakes (flat level below the rim) and drainage-network rivers (monotone bed + water ribbon)
5. plateaus, river-bank smoothing, beach shaping, cliff terraces

## Export
- Browser-safe: `toHeightmap16(result,{res})` (Uint16 + min/max), `toUnityRaw(result,{res:513})` (16-bit little-endian RAW + info), `toMetaJSON(result)`.
- Node: `import {exportAll} from 'island-gen/node'` writes `name.heightmap16.png`, `name.unity.raw`, `name.json`.
- Unity: import the RAW as 16-bit, Windows byte order, res 513; terrain height = `terrainHeight` from the JSON; sea level is at world y = `seaLevelY` relative to the terrain origin.

## Chunks (optional renderer helpers)
`buildTerrainChunk(island,cx,cz,res)` returns positions, unlit vertex colours, signed normalized 16-bit surface normals and triangle indices. Edge normals sample the same graded heightfield on adjacent tiles. Skirts are enabled by default for mixed resolutions. Pass `{skirts:false}` as the fifth argument for a uniform grid. `buildWaterChunk(...)` returns positions, depth and triangle indices for a wet tile, or `null` for a dry one.

## Tests
`npm test` in the repo root (or `node --test tests/*.test.mjs` here): determinism, sea level / land ratio, finite chunks, API and export shapes.
