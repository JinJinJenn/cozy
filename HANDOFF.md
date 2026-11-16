# Jenn's Cozy Town playtest handoff

JinJinJenn owns the project and publishes it on her GitHub Pages site. [Play the island](https://jinjinjenn.github.io/cozy/) · [Playtest history](docs/DEVLOG.html)

## Current build

The island viewer generates terrain, settlements and graded lots from a seed and locale. Town view finds a resident. Capsule residents follow the town simulation and appear on the minimap. The petalwood Harbor Town seed has 61 road pieces, 534 plots and eight residents.

The browser viewer currently runs locally on each client. The objects package supports building permissions, occupied objects and per-builder undo. The network package exchanges player positions. Connecting those packages to structural edits is the next piece of work.

## Next playable milestone

Build and live mode must coexist on the same island. Start with one occupied lot and two connected clients. One player edits a wall while another uses its doorway and a resident follows a route through the lot. Doors should follow the wall they belong to. Only the room owner can build. Guests retain direct control and can use the existing space while the owner pushes walls and attached doors aside.

Use a local drag preview. Commit a valid edit as one host-authoritative operation so the wall, its openings, its collision and the affected routes change together. Check a blocked drag, a guest attempting an edit during an owner drag, per-builder undo and a late join. Keep people seated, nearby interactions active and distant lots ticking throughout. Town Kit supplies layout ideas to try after this interaction feels right.

## Reference projects and social play

- Jenn's Café supplies modeling and editor references, especially characters, furniture and connected rooms. Keep a live activity in every building playtest.
- Jenn's Farm is a rendering and UI reference, including its rolling-world camera.
- [Jenn's Town](https://github.com/JinJinJenn/town) supplies neighbourhood-scale examples of resident routing, seat reservations, standing up and social groups.
- Study the Sky Lounge Trystero port for ideas. Implement Cozy's own code. The first social feature to prototype is an ensemble where guests pick different parts of the same MML song and hear sampled instruments start together.
- Support guest joining, listed rooms and invite-only rooms with shareable links from the first multiplayer slice. Additional candidates are adjustable sag on wall strings, tic-tac-toe, a guestbook, dancing pets and painted-texture clothing.
- Use Cozy's own renderer, multiplayer and guest identity. Leave the donor backend, login, synth voices, arcade games and needs/economy systems outside this project.

## Packages and checks

| Package | Responsibility |
| --- | --- |
| island-gen | Seeded terrain, water and chunk meshes |
| settlement | Streets, plots and terrain grading |
| objects | Replicated edit operations, permissions, occupancy and undo |
| sim | Fixed-tick residents, navigation and routines |
| net | Invites, peer presence and position transport |

Use npm run serve for local play, npm test for package and worker checks, and npm run test:viewer for the four-locale headless browser check. Multiplayer transport has a separate two-client harness. A successful local BroadcastChannel run is distinct from a successful public-relay run.
