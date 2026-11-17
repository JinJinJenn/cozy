# Jenn's Cozy Town playtest handoff

JinJinJenn owns the project and publishes it on her GitHub Pages site. [Play the island](https://jinjinjenn.github.io/cozy/) · [Playtest history](docs/DEVLOG.html)

## Current build

Live mode opens at Jenn's Café. Click the ground or pick a venue under Find a place to walk there. WASD takes over from a route and Shift jogs. Coffee with a neighbor sends the player to the counter while a resident walks across the road to Harbor Green. The pair can sit, share the coffee and continue to the beach. The owner saves visit counts for each resident. The host checks routes against the current walls and recalculates them after a renovation.

The street advances on rendered frames, with a timer fallback for hidden tabs. Guests predict their own manual movement against the shared geometry and reconcile it with acknowledged host frames. Other walkers are interpolated. The camera tracks the same presented position as the avatar.

Click Robin or Bea to invite that resident for coffee. Inside a venue, clicking a chair, a keyboard or another activity spot offers its action where you clicked. The host holds the spot while the player walks over and checks occupancy again on arrival.

The island viewer generates terrain, settlements and graded lots from a seed and locale. Town view finds a resident. Capsule residents follow the town simulation and appear on the minimap. The petalwood Harbor Town seed has 61 road pieces, 534 plots and eight residents.

Harbor Town now opens at the café, with seven furnished venues occupying real waterfront parcels. The island has additional street-facing exteriors on buildable lots. Find a place gives a direction and distance to each venue. The terrain inspector remains available under Island map.

Harbor Green is across the road from the café. Both pavilion benches use the shared seating system. The saved Petalwood plan in the settlement package holds the published streets and parcel IDs used by resident homes and saved front-wall edits. Other seeds use the procedural planner. Surrounding homes have solid single-volume or winged footprints, front paths and yards. Their interiors are still unbuilt.

## Building and multiplayer

At Jenn's Café, Build → Furnish café terrace places, rotates, moves or removes bistro sets on the half-metre grid. Each has a solid table and two reservable seats. The host checks both seat approaches, current occupants, incoming guests and the entrance. A second table gives a coffee outing another destination. Placement and the last sixteen table edits survive a host reload. The initial furnishing tool covers the café terrace.

The host simulates player movement and two waterfront residents against the committed floor plan. Guests join from a link and receive signed host frames. The owner can drag the café partition or the street-facing wall of either home or the Moon Room. Home facades carry their open door, windows and porch. The foundation and side walls resize from the fixed back wall. Movement, floor queries, cutaways, directions and waterfront resident entrance waypoints read the committed offset. Each property has independent undo. The club stage and keyboard stations remain fixed during a frontage edit. The host sweeps occupants, including the eight visible town residents, and checks parcel limits before committing. Visitors can walk, use the lanterns and play their part at the club during the edit. Layout, lantern state and undo history persist in the owner's browser. A host must be present for guests. Run npm run test:street for a browser playtest using the local transport.

Bluebell House supports a two-axis corner drag and separate front and right wall sliders. The doorway travels with the front. Both dimensions save and undo together. Find a place → Bluebell House → Visit Bea for tea sends a visitor to the first chair while Bea walks to the kitchen and then to the opposite chair. Both seats are reserved for the visit.

Bay Kitchen has four dining chairs. Choose the restaurant under Find a place and take a table, or click an open chair. Order chowder or grilled fish. A resident walks to the stove and serves the plate. The owner can move the dining-room front wall and door during service. The wall and its undo history persist with the town.

Next, extend the gym and spa interiors and give each a resident activity. Test visits across independent networks and exercise host loss before promising a persistent public town. The Moon Room has a furnished two-keyboard stage with note-driven lights.

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
