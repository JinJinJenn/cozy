# Cozy story beats

Raw material for a longer YouTube edit. Newest at the bottom. Keep before/after comparisons.

## 2026-11-15: first islands
- Goal: an open, seeded island world, terrain first (then streets, then lots), instead of Jenn's single town. KISS: heightmap only, no voxels or caves.
- Tried first: a plain falloff + noise island in Jenn's town repo. Dropped that; new standalone folder instead so the town stays untouched.
- First render: everything looked washed out. Cause: vertex colours are linear in Three.js, we fed sRGB hex. Fix: convert the palette to linear. Before/after is a great comparison shot.
- Coastline had hair-like sand spikes. Cause: erosion droplets depositing sediment along their path into the sea. Fix: sediment is lost at the shore.
- Highlands shore view looked into a cliff wall with hanging skirt curtains. Fix: mountains start further inland and the shore camera picks gentle slopes.
- Harbor and meadow first looked like camouflage because the pink flower noise covered too much. Raised the thresholds.
- Water was too dark in the bay: absorption was too strong. Retuned.
- Result: four locales, 19 tests passing, 1080p60 orbit clips per locale.

## 2026-11-15 (later): terrain pass 2
- Stopped a half-finished video batch rendered from the old terrain; kept the Meadow Cove clip as the BEFORE clip (docs/video/.../BEFORE-m1-...). Re-render all four locales after the terrain changes for an honest before/after.
- Added knolls, a flat harbor plateau, bank smoothing, rock strata, lower snow line, thinner foam.
- Side effect: highland rivers became almost invisible. Needs a ribbon pass next.
- Edit tool: tools/edit.mjs builds title-card + clip cuts with ffmpeg (1080p60, no audio). First gotchas: fade durations need a leading zero (0.4 not .4), and a drive-letter colon in the drawtext fontfile path breaks the filtergraph, so the font is copied next to the tool.

## 2026-11-16: research-driven pass (M3)
- Research (stream-power erosion on a drainage graph, Cordonnier 2016 and a 2024 analytic follow-up; flow accumulation rivers; droplet erosion). Chose priority-flood routing + implicit stream power: it fills pits, gives a flow order for free, and produces branching valleys.
- First result: gullies everywhere and beaded dotted rivers. Tuned K down, diffusion up, raised the river area threshold, and carved river segments between cells (3 samples) so channels are continuous.
- Rivers went from invisible to trench-like on flat plains; reduced depth for the flat locales.
- Seeds gallery showed every Meadow Cove had the same south bay; added per-seed rotation of bays and plateaus.
- Gotcha: the capture folder is dated in UTC, so after 7 pm local the date rolled to 2026-11-16 mid-session.

## 2026-11-16: settlement, objects, sim, net (M4)
Terrain got a standalone package, a worker and quantile sea level; the river beads were a shader tint, not geometry. Then four helpers built in parallel in separate packages: settlement (sites, roads, blocks, plots), objects (layered interactions, co-op ops), sim (a handful of NPCs on a day routine) and net (invite links, Trystero skeleton). Next is putting it all in the viewer.
