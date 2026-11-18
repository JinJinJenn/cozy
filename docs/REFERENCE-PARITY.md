# Social play reference checklist

17 November 2026. Town parity and Sky Lounge parity are explicit acceptance targets.
This checklist records gaps rather than claiming that Cozy already meets them.
Implement original behavior and art; reference access does not authorize asset or
source transplantation. Every Cozy prop must meet the [prop contract](PROP-BEHAVIORS.md).

The reviewed Town checkout is `fb7148b`, Cafe is `014bbc4`, and the local Sky Lounge
port is `2c6dca2`. Sky Lounge's captured client and reconstructed/port-added server
behavior are distinct references; its unavailable original backend is not verified.

| Area | Useful reference | Shipped in Cozy | Remaining work |
| --- | --- | --- | --- |
| Continuous world | Jenn's Town, Sunset Valley composition | Island roads, 588 parcels, 457 generated homes, full generated-home resident population | More varied architecture, landscaping and neighborhood composition |
| Furniture use | Sky Lounge, Jenn's Town | Host reservations, separate approach/use/exit positions, configurable linked home lighting and a shared cook/serve/eat loop | Catalog-wide behaviors, richer props and interaction transitions |
| Shared music | Sky Lounge ensemble | Moon Room melody and bass stations | More parts, instruments and late-join music coverage |
| Room editing | Jenn's Cafe, Sky Lounge | Owners can move or rotate six kinds of home furniture and edit a divider while guests use the room. Desk lamps, chairs and activities follow their furniture. | Catalog purchases, wall placement, stacking and multi-room plans |
| Multiplayer arrival | Sky Lounge public lobby | Automatic public joining, delayed-signal convergence, separate private streets | Explicit private-home access, larger groups and full host handover |
| Personal homes | Owner-specific room saves | Session address claims, compatible alternatives, reconnect grace and an encrypted personal street backup with its own private invitation | Per-guest private-home permissions and a durable land registry if permanent public ownership becomes a requirement |
| Performance | Cozy's island and simulator | Resident simulation worker, shared avatar batches and compact population frames. The [rendering review](RENDERING-REVIEW.md) records Intel 0x7D67 measurements at street, room and island scales. | Older integrated graphics and phone measurements, continued wide-view profiling |

## Full-system coverage

Partial means an existing behavior needs expansion or acceptance testing. Missing
means the reference use case is not yet implemented in Cozy. A passing local test
does not establish independent-network acceptance or broad catalog coverage.

| System | Reference target | Cozy status and remaining acceptance |
| --- | --- | --- |
| Resident control | Town: select residents, queue/cancel commands, simulation speeds | Missing selected-NPC command queue and speed controls; player movement and autonomous residents exist |
| Social groups | Town: directed chat, joining/leaving multi-person conversations | Partial: two-person hosted visits; flexible conversation groups missing |
| Household activities | Town seating, drinks, TV and transition animation | Players can share soup or tune a living-room television together. Every generated home has three animated programs and a saved channel. Furniture approach/use/exit blends remain open. |
| Public/outdoor seating | Town: usable benches, loungers, picnic and game seats | Partial: roadside and venue benches; all furnished outdoor lots need an object-by-object audit |
| Avatar identity and expression | Sky Lounge: editable appearance, name/motto, gestures | Display names, six shirt colors and animated wave and cheer work across public and private visits. Browser-stored appearance survives reload. Mottos, more clothing and cross-device profile transfer remain open. |
| Room discovery | Sky Lounge port: automatic common lobby and roster | Players meet through the game URL. Multiplayer lists each current player by name and shirt color. Selecting a name follows that player. |
| Private access | Sky Lounge: invitation, closed/listed rooms, admission and owner controls | Partial street invites/listing; private home capabilities and moderation missing |
| Recovery | Sky Lounge port: backups, import/export, identity migration and restore | Encrypted file recovery preserves the owner and existing invite. Devices retain separate selectable saves. Offline history merging remains open. |
| Host departure | Sky Lounge port: successor host and retained layout | Remaining peers elect a new host. Full NPC scheduler and in-flight action handover remain open. |
| Room creation | Sky Lounge: templates, entrances, named rooms and navigation | Missing general personal-home creation and connected-room editing |
| Build catalog | Sky Lounge: broad catalog, coordinated sets and configuration | Partial venue-specific terrace placement; reusable catalog and set placement missing |
| Editing operations | Sky Lounge: move, rotate, duplicate, delete, draft/commit | Preview, place, rotate and undo existing furniture inside a generated home. Duplicate, remove and multi-item transactions remain open. |
| Surface placement | Sky Lounge: floor/wall/shelf support and attached children | Desk and bedside lamps follow their support, including the switch target and light pool. Free shelf placement, stacking and height checks remain open. |
| Parametric construction | Sky Lounge: cabinet runs and configurable strings | Missing cabinet-span and anchored-strand tools |
| Linked controls | Sky Lounge: switches, remotes, screens and speakers | Owners can link the desk and bedside lamps to the entry switch. Visitors can use the switch and each individual lamp. Both the wiring and lamp states survive a reload or encrypted transfer. General control links for other devices remain open. |
| Instruments | Sky Lounge: multiple live instruments and note feedback | Partial two-part Moon Room performance; instrument catalog and free performance UI missing |
| Music tools | Sky Lounge: import/library, part selection, ready/start, late joining | Partial existing score playback; full import/library and ensemble workflow missing |
| Shared audio queue | Sky Lounge: editable stereo queue and repeat | Missing |
| Object games | Sky Lounge: multiplayer table game and playable electronic props | Harbor Three uses two reservable dining chairs, physical buoys and rings, solo practice, live turns, spectator updates and rematches. Playable electronic props remain open. |
| Pets | Sky Lounge: named/configurable pets, pet/call/fetch | Missing |
| Friends and presence | Sky Lounge: contacts, requests, blocks and joinable locations | Missing persistent social records and delivery rules |
| Guestbooks | Sky Lounge: room messages and author/owner deletion | Missing |
| Ambience | Sky Lounge: room finishes, time/weather choices and settings | Partial graphics presets; coherent shared time/weather, finish editing and broader audio controls missing |

Sky Lounge's active catalog has 117 definitions. Matching only a few chairs and
appliances is not catalog parity. Its prop activities do not establish a needs,
careers or economy simulation; those systems need their own explicit design if
added. Count behavior coverage and acceptance cases, not copied models or labels.

The existing Sky Lounge port is a room-oriented reference. Its transient-session
host election is not proof of durable land ownership or a continuously saved city.
See [the multiplayer contract](MULTIPLAYER-PLAN.md) for the proposed boundary.
