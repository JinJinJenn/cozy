# AGENTS.md (cozy)

Cozy is a cozy open-world island hangout (Club Penguin x Sims). Read `HANDOFF.md` first: vision, design rules, package map, honest current state, next steps.

## Rules

- Git: branch `main`; commit as `Tront <noreply@users.noreply.github.com>`; no AI co-author trailers; new work on branches is fine; never force-push `main` without Trent's explicit approval.
- Use the JinJinJenn gh account for this repo. Stay out of Jenn's other repos and personal files.
- No surprise windows. Headless captures only unless Trent says "show me" in the thread.
- No secrets, tokens, private life items or personal paths in any file or note.
- Never copy code from Cow's Skylounge. `C:\trontstack\jinjinjenn-town` is read-only inspiration.
- Do not build monetisation features.
- Keep it KISS: heightmap terrain, no voxels or caves; real sampled audio only; every object has several interaction layers; building is co-op and non-modal.
- Relative URLs only so the site works at `https://jinjinjenn.github.io/cozy/`; three.js stays vendored.
- No em dashes in messages to Trent.
- One scoped change at a time; Trent plays between rounds.

## Commands

```bash
npm test          # 78 tests across island-gen, settlement, objects, sim, net unit
npm run serve     # http://127.0.0.1:4180/
node tools/shots.mjs   # headless stills into docs/shots/<UTC date>/
```

After each milestone update the devlog (see HANDOFF.md section 9). Gold notes: `tb gold "..." --kind code|decision|lesson|idea`.
