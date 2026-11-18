# Jenn's Cozy Town playtest handoff

JinJinJenn owns the project and publishes it on her GitHub Pages site. [Play the island](https://jinjinjenn.github.io/cozy/) · [Playtest history](docs/DEVLOG.html)

## Current build

Version 0.3 adds domestic activities and a worker-driven population for all 457
generated homes. Read [the working spec](docs/WORKING-SPEC.md) for the agreed
direction, the reference findings and the distinction between this release and
the next connected-room editor milestone.

The selected multiplayer target is an automatic public town plus private invited
homes. [The save and ownership plan](docs/MULTIPLAYER-PLAN.md) separates persistent
personal homes from session parcel leases. That joining and ownership layer is
not yet implemented. Current play remains owner-hosted with invitation links.

Generated beds, kitchens, bookshelves and rugs now advertise actions; larger homes
also expose desks, dining and washroom activities. Use points, poses and exit
points are separate. The host reserves an object while a visitor approaches, and
leaving a bed restores a walkable position before applying movement. Timed actions
show animation/effects and completion feedback; they do not add inventory or needs.

The city worker follows collision-aware routes, uses real roadside benches and
keeps all generated-home residents running offscreen. The renderer shares the
full avatar geometry across visible residents. Guest frames encode the complete
population, not just nearby residents. Run npm run test:domestic for isolated native
WebRTC bed contention, household activities and the full-population worker check.

Live mode opens at Jenn's Café. Click the ground or pick a venue under Find a place to walk there. WASD takes over from a route and Shift jogs. Coffee with a neighbor sends the player to the counter while a resident walks across the road to Harbor Green. The pair can sit, share the coffee and continue to the beach. The owner saves visit counts for each resident. The host checks routes against the current walls and recalculates them after a renovation.

The street advances on rendered frames, with a timer fallback for hidden tabs. Guests predict their own manual movement against the shared geometry and reconcile it with acknowledged host frames. Other walkers are interpolated. The camera tracks the same presented position as the avatar.

Click Robin or Bea to invite that resident for coffee. Inside a venue, clicking a chair, a keyboard or another activity spot offers its action where you clicked. The host holds the spot while the player walks over and checks occupancy again on arrival.

The island viewer generates terrain, settlements and graded lots from a seed and locale. Town view finds a resident. The 457 generated-home residents follow the town simulation and appear on the minimap. The published Petalwood seed has 62 road pieces and 588 plots, including 54 new frontage parcels. The original 534 parcel boundaries and IDs remain intact.

The settlement planner reserves a full block for a landscaped square, fits a clock hall to a nearby block when one is available, and selects market frontages and orchard parcels. On newly generated Harbor Town islands the outer streets bend around the central grid. Spare ends can join by a country lane where grades, water and existing lots permit. Roads, curbs and sidewalks are drawn from the actual road centrelines across the island. Island map → Square frames the district. In Petalwood, Find a place → Town Square routes a walker there from the waterfront. The hall and market buildings currently have exterior models.

Harbor Town now opens at the café, with seven furnished venues occupying real waterfront parcels. The island has additional street-facing exteriors on buildable lots. Find a place gives a direction and distance to each venue. The terrain inspector remains available under Island map.

Harbor Green is across the road from the café. Both pavilion benches use the shared seating system. The saved Petalwood plan in the settlement package holds the published streets and parcel IDs used by resident homes and saved front-wall edits. Other seeds use the procedural planner. All 457 generated residential homes have open doors, furnished interiors and a reservable sofa. Click a front door or choose a home under Find a place. The roof and camera-facing walls cut away on entry. Large plans have bedroom and washroom partitions; small plans are studios. Beds, kitchens and other usable furniture advertise their actions on click. Only the occupied home's detailed furniture is allocated.

Walking zoom now reaches 420 rather than 45. The top-right Graphics control offers Auto, Low, Balanced and High, retaining the same building geometry. Auto reduces resolution under sustained slow frames and then turns off shadows. Low caps the drawing buffer at one million pixels and disables shadows. The ocean, fog and sky share a consistent horizon treatment. Lighting and home materials have been revised.

## Version 0.3 verification and limits

- 108 package/unit checks and the four-locale browser viewer passed.
- The full native WebRTC street regression passed with isolated browser profiles
  and a local signalling fixture: dinner, tea, furniture edits, late joining,
  owner reload, coffee outings, music and occupied-wall rejection.
- The domestic WebRTC check passed bed contention/release and guest pose
  replication, plus reading, writing, cooking, washing, stretching, showering,
  bathroom use and dining. All 457 residents moved across 120 worker steps with
  zero sampled blocked positions. Every home's door, sofa and use approaches
  passed the generated-geometry route checks.
- A 360-frame wide-town orbit on RTX 5070 Ti at 1080p measured 16.7 ms median,
  18.3 ms p95 on Balanced and 17.6 ms p95 on Low. Software WebGL remained slow:
  roughly 8 FPS street / 4 FPS wide on Low. Real integrated-GPU testing is pending.
- These checks do not establish cross-network connectivity, persistent server
  simulation or complete Sky Lounge parity. Browser suspension can pause the host.
  General home editing, automatic lobby admission, ownership and backup migration
  remain the next milestones. The devlog contains reviewed playtest stills.

## Building and multiplayer

At Jenn's Café, Build → Furnish café terrace places, rotates, moves or removes bistro sets on the half-metre grid. Each has a solid table and two reservable seats. The host checks both seat approaches, current occupants, incoming guests and the entrance. A second table gives a coffee outing another destination. Placement and the last sixteen table edits survive a host reload. The initial furnishing tool covers the café terrace.

The host simulates player movement and two waterfront residents against the committed floor plan. Guests join from a link and receive signed host frames. The owner can drag the café partition or the street-facing wall of either home or the Moon Room. Home facades carry their open door, windows and porch. The foundation and side walls resize from the fixed back wall. Movement, floor queries, cutaways, directions and waterfront resident entrance waypoints read the committed offset. Each property has independent undo. The club stage and keyboard stations remain fixed during a frontage edit. The host sweeps occupants, including the active town residents, and checks parcel limits before committing. Visitors can walk, use the lanterns and play their part at the club during the edit. Layout, lantern state and undo history persist in the owner's browser. A host must be present for guests. Run npm run test:street for a browser playtest using the local transport.

Bluebell House supports a two-axis corner drag and separate front and right wall sliders. The doorway travels with the front. Both dimensions save and undo together. Find a place → Bluebell House → Visit Bea for tea sends a visitor to the first chair while Bea walks to the kitchen and then to the opposite chair. Both seats are reserved for the visit.

Bay Kitchen has four dining chairs. Choose the restaurant under Find a place and take a table, or click an open chair. Order chowder or grilled fish. A resident walks to the stove and serves the plate. The owner can move the dining-room front wall and door during service. The wall and its undo history persist with the town.

Next, follow the connected-room editor acceptance slice in the working spec. Keep the existing gym and spa activities and the Moon Room's two-keyboard stage working throughout that change. Test visits across independent networks and exercise host loss before promising a persistent public town. Generated homes are enterable and furnished but do not yet expose the venue-specific renovation tools.

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

Use npm run serve for local play, npm test for package and worker checks, and npm run test:viewer for the four-locale headless browser check. npm run test:homes verifies every generated door, seat and room approach against the rendered town, clicks a door to enter, and checks host/guest sofa occupancy. Multiplayer transport has a separate two-client harness. A successful local BroadcastChannel run is distinct from a successful public-relay run. tools/benchmark.mjs records fixed-camera frame intervals; software WebGL results are stress tests, not integrated-GPU certification.
