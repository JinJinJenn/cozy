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
