# Jenn's Cozy Town playtest handoff

JinJinJenn owns the project and publishes it on her GitHub Pages site. [Play the island](https://jinjinjenn.github.io/cozy/) · [Playtest history](docs/DEVLOG.html)

## Current build

The island viewer generates terrain, settlements and graded lots from a seed and locale. Town view finds a resident. Capsule residents follow the town simulation and appear on the minimap. The petalwood Harbor Town seed has 61 road pieces, 534 plots and eight residents.

Harbor Town now opens at the café, with seven furnished venues occupying real waterfront parcels. The island has additional street-facing exteriors on buildable lots. Find a place gives a direction and distance to each venue. The terrain inspector remains available under Island map.

## Building and multiplayer

The host simulates player movement and two waterfront residents against the committed floor plan. Guests join from a link and receive signed host frames. The owner can drag the café partition or the street-facing wall of either home. Home facades carry their open door, windows and porch. The foundation and side walls resize from the fixed back wall. Movement, floor queries, cutaways, directions and waterfront resident entrance waypoints read the committed offset. Each house has independent undo. The host sweeps occupants, including the eight visible town residents, and checks parcel limits before committing. Visitors can walk, use the lanterns and play their part at the club during the edit. Layout, lantern state and undo history persist in the owner's browser. A host must be present for guests. Run npm run test:street for a browser playtest using the local transport.

Next, extend editing to side walls and shared corners and integrate the broader resident simulation with the edited interiors. Test across independent networks and exercise host loss before promising a persistent public town. Other venues still need authored floor plans, furniture and deeper activities.

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
