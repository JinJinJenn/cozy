# Jenn's Cozy Town

Walk Harbor Town on a continuous island. The waterfront has two homes, Jenn's Café, Bay Kitchen, Tidepool Spa, Harbor Gym and The Moon Room. Find a place points toward its front door. [Play Jenn's Cozy Town](https://jinjinjenn.github.io/cozy/) · [Devlog](docs/DEVLOG.html)

## Live mode and building

Walk with WASD, the arrow keys or the touch pad. Drag to orbit and press E or tap the activity button. Switch the café lanterns, relax at the spa, work out at the gym or play a part at the club. Two people can take melody and bass on the same score.

The owner can use Build to preview, move and undo the café partition and its attached doorway. The host sweeps the edit against players and street residents. Occupied space limits the move. Layout and lanterns are stored on the owner's browser. Multiplayer opens a guest link and optional public listing. Keep the owner tab open while friends visit.

Island map opens the terrain and settlement inspector. Walk in Harbor Town returns to the waterfront. Other lots across the island have building exteriors. The seven waterfront buildings have furnished interiors and activities.

## Run

```bash
npm install --ignore-scripts      # three 0.180.0 (only needed once)
npm run vendor                    # copies three + OrbitControls into vendor/
npm test                          # package and worker regression tests (node --test)
npm run serve                     # http://127.0.0.1:4180/ (binds localhost, does NOT open a browser)
```

Open the printed URL yourself. Drag = orbit, right-drag = pan, wheel = zoom. Panel: locale dropdown, seed box, Re-roll, Oblique / Top / Shore / Town camera buttons. The minimap (bottom right) is clickable to jump.
URL params: `?preset=pineHighlands&seed=clover-123&view=shore`.

## Headless captures (no window, no focus steal)

```bash
node tools/shots.mjs [outDir] [seed]      # 3 views x every preset -> docs/shots/YYYY-MM-DD/
node tools/video.mjs <preset> [sec] [fps] [seed] [WxH]   # orbit fly-over -> docs/video/YYYY-MM-DD/raw/*.mp4 (needs ffmpeg)
```

## Layout

```
packages/island-gen/src/rng.js      seeded rng, gradient noise, fBm, ridged fBm
packages/island-gen/src/presets.js  locale presets = plain data (add a new island type by adding an object)
packages/island-gen/src/island.js   generator: base shape -> erosion -> rivers/lakes -> beach -> terraces; sample/slope/paint queries
packages/island-gen/src/chunks.js   64 m chunk builders (terrain with baked light, water with depth attribute)
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

The same seed and preset reproduce the island. The viewer grades streets and buildable plots before generating chunk meshes.
