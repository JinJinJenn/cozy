# Jenn's Cozy Town

Walk Harbor Town on a continuous island. The waterfront has two homes, Jenn's Café, Bay Kitchen, Tidepool Spa, Harbor Gym and The Moon Room. Find a place points toward its front door. [Play Jenn's Cozy Town](https://jinjinjenn.github.io/cozy/) · [Devlog](docs/DEVLOG.html)

Version 0.3 runs 457 generated-home residents in a dedicated worker, with two additional waterfront social residents. All continue their routines offscreen. [Public town and personal home plan](docs/MULTIPLAYER-PLAN.md) records the selected multiplayer direction; automatic public joining and personal-home claims are still pending.

## Live mode and building

Under **Find a place**, choose **Bluebell House** and **Visit Bea for tea**. Bea brings tea from her kitchen and sits opposite you. During the visit, the owner can open **Build**, choose **Bluebell House** and drag its front-right corner. The two sliders adjust either wall individually. Undo restores both dimensions of a corner edit.

Walk with WASD, the arrow keys or the touch pad. Drag to orbit and press E or tap the activity button. Switch the café lanterns, relax at the spa, work out at the gym or play a part at the club. Two people can take melody and bass on the same score.

Open Build and choose Peach Cottage, Bluebell House, The Moon Room or Jenn's Café. Drag the wall handle and release it to commit, or set the offset with the slider and choose Move wall and door. Each home and the club can grow or shrink toward the street by up to 1.5 metres. Its doorway, porch, roof and floor follow the front wall. The café has a movable interior partition. Undo applies to the selected property. The owner edits while guests keep playing. Layout and lanterns are stored on the owner's browser. Multiplayer opens a guest link and optional public listing. Keep the owner tab open while friends visit.

Island map opens the terrain and settlement inspector. Walk in Harbor Town returns to the waterfront. Petalwood now has 588 parcels, with 54 new frontage lots and homes on both sides of the waterfront road. All 457 generated residential homes can be entered: click a door or choose a home under Find a place. Inside, the roof cuts away. Click beds to rest, bookshelves to read, kitchens to cook or wash, and rugs to stretch. Larger plans add desk, dining and washroom activities. The host reserves each object and releases it safely when you leave. The seven original waterfront venues retain their activities and building tools. The civic hall and market buildings remain exterior models.

Scroll farther out while walking to see the neighborhood. Graphics at the top right offers Auto, Low, Balanced and High. Low retains the buildings and interiors, caps rendering at one million pixels and turns off shadows. See the [working spec](docs/WORKING-SPEC.md) for the room-editor direction and the remaining visual and performance targets.

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
