# Cozy: handoff for Codex

Written 2026-11-16 by Claude for Trent. Read this, then AGENTS.md, then keep going. Everything here was checked against the repo on 2026-11-16 (root `npm test`: 78 pass, 0 fail).

## 1. What cozy is

A cozy open-world island hangout: Club Penguin crossed with the Sims. You and friends share a seeded island, walk around, sit on things, decorate, and build together. Residents (a handful of NPCs) live on it.

Why it differs from Cow's Skylounge (the game it resembles):
1. Seeded, shareable islands: the world is generated from `seed + locale preset`, and an invite link carries both.
2. Real terrain (erosion, rivers, lakes), not a flat lot.
3. Every object has several interaction layers, not one use.
4. Co-op, non-modal building: more than the room owner can build, and building does not pause the live world.
5. Residents with routines that react to music and players.

Build in the open. A YouTube video and Patreon may come later. Nothing monetisation-related is built, and nothing should be built until Trent says.

## 2. Trent's plan order

Terrain first, then streets, then lots and massing, then building rules. Everything else sits on those rules. Terrain and a first pass of streets, lots and a sim exist. Building rules and massing do not.

## 3. Design rules (from Trent)

- Every object is a list of composable interaction layers (more than one), each with its own state and a UI hook. Lamp: toggle, dim, tint, flicker, schedule, music-reactive, NPC-use, linked switch. Chair: sit, lounge, move, decorate, NPC-use, social seat.
- Co-op build mode: roles owner, builder, visitor. Builders are granted by the owner. Players in live mode keep playing while others build. Stable object IDs, small edit ops, soft highlights of who is editing what, occupancy checks, per-builder undo.
- Clothes are painted as textures.
- Guest join with invite links.
- KISS heightmap. No voxels, no caves, no dual contouring.
- Real sampled audio only, no synthesised sound.
- Floored cheap rendering. Look: pastel toon with baked vertex-colour light.
- No strict biome system, but a data-driven `zones` list per preset (height, slope, wetness and noise windows mapped to colours).
- Trent owns performance: do not lecture him about batching, culling or LOD.
- No em dashes in anything you write to Trent. Use `;` `:` or parentheses.

## 4. Repo facts

- Repo: https://github.com/JinJinJenn/cozy (public). Live viewer: https://jinjinjenn.github.io/cozy/ (GitHub Pages, branch `main`, root, https enforced).
- Branch `main`. Commit authors are `Tront <noreply@users.noreply.github.com>`. Set that identity for your commits. No Claude (or any AI) co-author trailers.
- New work on branches is fine. Normal fast-forward pushes to `main` are fine. NEVER force-push `main` without Trent's explicit approval.
- Local gh auth on PC 1 has two accounts: JinJinJenn (the one for this repo) and TrentSterling. Use JinJinJenn for cozy. Stay out of Jenn's other repos and personal files.
- `docs/video/`, `node_modules/`, `test-results/` and `*.log` are gitignored. mp4s stay local.
- The site must keep working under the `/cozy/` base path: relative URLs only, three.js vendored in `vendor/`, no CDN.

## 5. Package map

Node 24, ES modules, `node --test`, no bundler. Three.js 0.180.0 vendored.

| Folder | What | Key API | Tests |
|---|---|---|---|
| `packages/island-gen` | Seeded island generator | `generate({seed,preset,grid,droplets,stream})`, `toHeightmap16`, `toUnityRaw`, `toMetaJSON`, `createIsland`, `PRESETS`, `buildTerrainChunk`, `buildWaterChunk`; Node exporter `export-node.js` | 26 |
| `packages/settlement` | Town sites, roads, blocks, plots, grading | `generateSettlement(island,{seed,style})` (alias `generateTown`), `flattenHeightfield`, `createFlattenHook`, `STYLES` | 13 |
| `packages/objects` | Layered interactive objects and co-op edit ops | `World`, `LayerRegistry`, `DefinitionRegistry`, `IdGen`, replica with roles and undo; ops: place, move, rotate, remove, setLayerState, addLayer, removeLayer, act, setRole | 21 |
| `packages/sim` | Deterministic fixed-tick world sim with NPCs | `Sim`, `buildContext`, `buildNav`; `tickDt`, `advanceDays`, `submit` (events: music, player, weather, objectOp), `Sim.replay`, JSON snapshot | 12 |
| `packages/net` | Guest-join skeleton | `buildInvite`, `parseInvite`, `roomIdFor`, `NetSession`, `Interpolator`, Trystero transport (nostr or torrent, vendored) and a BroadcastChannel transport | 6 unit + a separate e2e |
| `src/` | Viewer | `main.js` (viewer and `window.__cozy` API), `island-client.js` (worker proxy, LRU chunk cache), `gen-worker.js`, `minimap.js` | none |
| `tools/` | Pipeline | see section 6 | none |
| `docs/` | Devlog | `DEVLOG.html`, `devlog.json`, `timeline.json`, `STORY.md`, `blog/`, `shots/`, `exports/` | none |

Each package has its own README with details. Read `packages/<name>/README.md` before changing one.

Locale presets (JSON in `packages/island-gen/src/presets.json`): `meadowCove`, `pineHighlands`, `sandbarArchipelago`, `harborTown`. Default seed in shots and clips: `petalwood`. Settlement debug seed: `cozy-1`.

How terrain is made (so you can change it with understanding): lobe falloff with domain warp, shelf and deep ocean profile, fBm hills, knolls and a hero hill, ridged mountains, stream-power erosion on a priority-flood drainage graph (Cordonnier et al. 2016 idea), droplet erosion, thermal relax, quantile sea level (`landRatio` knob), coast majority smoothing, sea stacks, lakes, drainage-network rivers carved by capsule, plateaus, terraces, then zones colouring, strata banding and baked light. Chunks stream at 64 m with 4 LOD levels and skirts. Sea level is 0 and units are metres.

## 6. How to run things

```bash
npm install --ignore-scripts   # three 0.180.0 (once)
npm run vendor                 # copies three + OrbitControls into vendor/ (already committed)
npm test                       # root suite: 78 tests (island-gen 26, settlement 13, objects 21, sim 12, net unit 6)
npm run serve                  # local viewer at http://127.0.0.1:4180/ (binds localhost)
node packages/net/test/e2e.mjs all   # net end-to-end, headless, uses public relays
```

Headless tools (Playwright is loaded from `C:/trontstack/craftmine/package.json`; override with `PLAYWRIGHT_FROM`, and set `CHROME_EXE` or rely on `LOCALAPPDATA` for the chromium_headless_shell path):
- `node tools/shots.mjs` stills (set `ONLY=harborTown,meadowCove` to limit) into `docs/shots/<UTC date>/`
- `node tools/video.mjs <preset> [seconds] [fps] [seed] [WxH]` orbit clip into `docs/video/<UTC date>/raw/`
- `node tools/edit.mjs <out> "Title|clip|subtitle" ...` title cards plus clips into a cut (needs ffmpeg)
- `node tools/gallery.mjs` seed contact sheets (pure node PNG)
- `node tools/town-debug.mjs` top-down PNG with roads, blocks and plots
- `node tools/sim-debug.mjs` sim days headless with NPC trail PNGs
- `node tools/export-island.mjs` PNG16, Unity RAW, JSON exports
- `node tools/devlog.mjs` regenerates `docs/DEVLOG.html` and blog pages from `docs/devlog.json`
- `node tools/live-shot.mjs [url] [out.png]` headless screenshot of the live Pages URL

Viewer URL params: `?shot=1&preset=<id>&seed=<seed>`. Viewer test API: `window.__cozy` (`ready`, `load`, `setView`, `flushChunks`, `setCamera`, `render(time)`, `info`).

Gotchas:
- Shot and video folders use the UTC date, which can be a day ahead of local time.
- Port 4181 (shots) and 4182 (video) are fixed. A leftover render holds the port and the next run dies on listen; check for stray `node tools/video.mjs` processes.
- Presets are loaded with import attributes (`with {type:'json'}`).
- Colours are converted to linear before baking light; keep that.

## 7. Current state, honestly

Works:
- Four locale terrains, deterministic from (seed, preset). Rivers read as continuous channels. Worker generation with chunk cache. Minimap, orbit camera, oblique, top and shore views. Live on Pages (checked headlessly, harborTown only).
- Settlement output (JSON): on seed `cozy-1`, plots total/buildable: harborTown 527/490, meadowCove 257/117, sandbarArchipelago 376/369, pineHighlands 193/130. All towns connected, no failed routes.
- Objects package with convergence tests (25 shuffled delivery orders), roles, occupancy, undo.
- Sim: NPCs asleep at home by night on all four presets, 0 teleports, replay and snapshot restore are bit-identical.
- Net: invite links, NetSession, tested headless across two tabs on loopback, real Nostr and tracker relays.

NOT wired into the viewer: roads, plots, NPC capsules, objects, net. The viewer shows terrain only. The settlement flatten hook is not applied to the live terrain. Nothing renders buildings.

Known weak spots:
- Terrain: coast gullying only partly fixed; silhouettes still mostly round; no moisture field; the worker path has no unit test; river water is dark navy and a bit uniform.
- Settlement: sandbar towns all sit on one island (other islands unsettled); no alleys; plots are simple quads, corner and convex fills; streets that stop more than about 4 m short still leak and leave areas without blocks; sites are not guaranteed to be on the coast; bends are coarse because routing is on the 4 m grid.
- Sim: NPCs cluster around the best-served town, others get no residents; no NPC collision avoidance; a chat partner waits instead of walking over; mood only trends up; weather is only a state value; walking is slow (about 180 m per sim hour).
- Net: not wired; no TURN so symmetric NATs fail; only 2 peers tested; abrupt leave takes about 8 s to detect.
- Docs: `docs/DEVLOG.html` is about 16 MB (screenshots embedded as base64); slim it. Live controls (locale dropdown, Re-roll, minimap) are only partly click-tested on the live site. The old devlog entries have stale "what still looks bad" lists.

## 8. Next steps, in priority order

1. Wire roads, plots and NPC capsules into the viewer: call `generateSettlement` in the worker, send the layers to the main thread, draw roads (decals or strips) and plot outlines, add the flatten hook so ground matches, add NPC capsules driven by `Sim`, minimap dots.
2. Harbor Town NPC clip (1080p60) plus stills, then devlog entry.
3. Slim `docs/DEVLOG.html` (link images instead of base64) and keep Pages small.
4. Building rules and massing per lot (footprints, height envelopes), as data, then buildings.
5. NPC collision avoidance, residents in more than one town, chat walk-to.
6. Co-op build UI on top of `packages/objects`.
7. Multiplayer wiring on `packages/net` (positions first, then object ops over the same channel, host-authoritative sim).
8. Terrain polish: coast gullying, silhouettes, moisture field, worker unit test.

Do one scoped change at a time and let Trent play between rounds. Do not start monetisation features.

## 9. The devlog habit

Trent wants a human-readable HTML devlog with inline captures. After each milestone: add an entry to `docs/devlog.json` (fields: n, date, slug, milestone, title, text[], stills[{file,caption}] with paths relative to `docs/`, videos, bad[], next[]), add the milestone and clips to `docs/timeline.json`, add a section to `docs/STORY.md`, run `node tools/devlog.mjs`, commit. Videos: raw 1080p60 orbit clips plus a titled cut per milestone, kept local (gitignored), referenced by path.

## 10. Working rules

- No surprise windows. Headless captures only. Open a viewer, a Photos window or VLC only when Trent says "show me" in the thread.
- Never put secrets, tokens, passwords or private life items (money, health, legal, addresses) into any file, note or gold note.
- Save gold notes as you go (a reusable technique, a decision, a lesson). On PC 1: `C:\trontstack\fleet\tools\tb.exe gold "text" --kind code|decision|lesson|idea`, or drop a file in `C:\trontstack\.brain\inbox\gold\YYYY-MM-DD-slug.md`.
- `C:\trontstack\jinjinjenn-town` is Jenn's earlier town project: read-only inspiration (`ART_DIRECTION.md`, `HANDOFF.md`, `src/v11-life.js`, `v9-life.js`, `v11-navigation.js`, `v12-seats.js`). Reimplement ideas; never modify it.
- Never copy code from Cow's Skylounge. `C:\trontstack\skylounge\FEATURE-SPEC.md` is a feature description only.
- Do not install anything beyond what a task needs, and say so when you do.

## 11. Where related things live on PC 1

- Notes: `C:\trontstack\notes\jinjinjenn-town-survey-2026-11-15.md`, `jinjinjenn-open-world-proposal*.md`, `jinjinjenn-cozy-ideas-2026-11-15.md` (differentiation, layered objects, co-op building), best stills as `cozy-*.png`, and `cozy-codex-handoff-2026-11-16.md` (copy of this file).
- Gold notes: `C:\trontstack\.brain\inbox\gold\2026-11-15-layered-object-interactions.md` and `2026-11-15-coop-nonmodal-building.md`.
- Related projects for ideas: `C:\trontstack\terrainlab` (Surface Nets sandbox), `C:\trontstack\streetgen` (street-first subdivision, read only), `C:\trontstack\jennsfarm` (Three.js farming, world curvature).
- Search everything with `tb wiki <words>`.
