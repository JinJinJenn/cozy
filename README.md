# Cozy: island world generator (first slice)

A seeded, chunk-streamed heightmap island with several locale presets, a tiny viewer and a headless capture pipeline. Terrain only for now: no streets, lots, gameplay or multiplayer. Local only (no remote yet).

## Run

```bash
npm install --ignore-scripts      # three 0.180.0 (only needed once)
npm run vendor                    # copies three + OrbitControls into vendor/
npm test                          # determinism + sea level / land ratio tests (node --test)
npm run serve                     # http://127.0.0.1:4180/ (binds localhost, does NOT open a browser)
```

Open the printed URL yourself. Drag = orbit, right-drag = pan, wheel = zoom. Panel: locale dropdown, seed box, Re-roll, Oblique / Top / Shore camera buttons. The minimap (bottom right) is clickable to jump.
URL params: `?preset=pineHighlands&seed=clover-123&view=shore`.

## Headless captures (no window, no focus steal)

```bash
node tools/shots.mjs [outDir] [seed]      # 3 views x every preset -> docs/shots/YYYY-MM-DD/
node tools/video.mjs <preset> [sec] [fps] [seed] [WxH]   # orbit fly-over -> docs/video/YYYY-MM-DD/raw/*.mp4 (needs ffmpeg)
```

## Layout

```
src/rng.js        seeded rng, gradient noise, fBm, ridged fBm
src/presets.js    locale presets = plain data (add a new island type by adding an object)
src/island.js     generator: base shape -> erosion -> rivers/lakes -> beach -> terraces; sample/slope/paint queries
src/chunks.js     64 m chunk builders (terrain with baked light, water with depth attribute)
src/minimap.js    top-down minimap
src/main.js       viewer (Three.js, LOD chunk streaming, water shader)
tools/            serve, vendor, shots, video
tests/            node --test suite
docs/             DEVLOG.html, STORY.md, timeline.json, shots/, video/, blog/
```

## How the terrain is made

1. Radial/lobe falloff mask with a domain warp, shelf + deep-ocean profile, plus bays (preset data).
2. Hills = fBm; mountains = ridged fBm gated by a mask (Pine Highlands).
3. Droplet hydraulic erosion + thermal relax on the whole grid (deterministic).
4. Lakes get a flat water level below their rim; rivers follow steepest descent with a carved, monotonically falling bed and a water-level ribbon.
5. Beach shaping, then optional cliff terraces on steep rock.
6. Paint: each preset has an ordered `zones` list (height / slope / wetness / noise windows -> pastel colour). Not a biome simulation; add rows to add patches.
7. Baked light: lambert + heightfield shadow march + cavity darkening, softly banded, in vertex colours (unlit toon material).
8. Water: per-chunk surface mesh with a depth attribute -> depth tint, animated shore foam.

Determinism: the same `(seed, preset)` gives identical arrays. Saves only need the seed plus later edits. `flatten: null` in a preset is the hook for the future lot/road flatten mask.
