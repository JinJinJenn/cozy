# Shared town and personal homes

17 November 2026. Public town plus private invited homes is the selected product
direction. The ownership and save rules below are a proposed implementation
contract. Version 0.4 opens a shared public town by default. Existing personal
street keys and layout saves stay in their owner's browser.

## Public town in 0.4

The Petalwood waterfront uses one public room per deployment and world protocol.
Each tab creates a temporary signing key and introduces itself on its live
transport. Reachable clients select the earliest announced arrival, using the
public key to break ties. Local play starts immediately while WebRTC connects.
A connected guest uses the selected host's signed snapshots for the players
and all 457 generated residents. Other seeds stay outside this room.

**Build at home** opens the player's existing personal street. Its owner can
renovate, share an invite, and choose whether to list that street. Public play
keeps the personal key, layout and visit history private. Public layout changes
last for the session. The public host has the same construction restrictions
as the other players.

If a host departs, the remaining peers select a successor. A successor that
received a town snapshot keeps its last layout, resets activities and resumes
its own resident scheduler. A disconnected group can temporarily elect its
own host. Durable shared ownership and uninterrupted simulation handover
still require the snapshot and revision work below. The current session limit
is one host and twelve remote players.

## Keep the continuous city

The public town contains the streets, landmarks, NPC population and shared social
spaces. Everyone joining the same lobby should see the same simulation. Visiting
a private home changes access and edit authority, not the owner's saved identity.
The city continues running while somebody is indoors or decorating.

Sky Lounge is useful for object-specific activities, occupancy, room discovery and
editing transactions. Its room scope is not a reason to remove Cozy's city. We
study its behavior and implement original code and art.

## Ownership and saves

As of v0.8, a private street owner can download a passphrase-encrypted file
containing the street signing key, committed layout, coffee history, optional
home address and world version. Restoring adds a new local save and preserves
the previous one. The public lobby identity is temporary and separate.
Connected v0.8 copies choose one private host by signed start time and
session ID. Each offline device retains the revision it last saved locally.
Public parcel leasing and merging edits across devices remain open.

| Record | Authority | Lifetime |
| --- | --- | --- |
| Player identity | Player's signing key | Across visits and sessions; recoverable backup required |
| Personal home | Stable home ID and owner identity | Persistent, independent of a public parcel or host |
| Home plan | Owner-signed revision with schema version and previous revision hash | Saved locally first; export/import and explicit migration required |
| Public parcel placement | Current lobby host assigns a compatible parcel to a home ID | Session lease, not permanent land ownership |
| Furniture occupancy | Host reserves an object before routing a player to it | Released on cancellation, departure or timeout |
| Town simulation | One host with a numbered simulation epoch | Snapshot and input log needed for host handover |

When two players request the same public parcel, the host processes the claims in
one order and acknowledges one lease. The other player's home remains intact and
can use another compatible parcel or be visited privately. Do not overwrite its
layout, silently resize it, or give the second player a blank home. A disconnected
owner gets a grace period before a session parcel becomes available again.

A home save must include its ID, owner, schema/generator versions, room and object
IDs, revision and contents. Public position, visitors, current seats and session
NPC poses are separate state. Clearing browser storage must never be presented as
safe without a recoverable home and identity backup. Existing venue saves need an
explicit migration and retained backup.

Permanent exclusive ownership of one address across all sessions requires a
durable registry and conflict resolution. Browser peer sessions alone cannot
guarantee it. Session leases let us ship the social loop without pretending that
registry already exists.

## Public lobby and private access

The normal URL should discover and join an active public lobby automatically.
Lobby discovery, host selection and duplicate-room convergence need tests under
simultaneous joins and delayed signalling. Protocol and world versions must match.
Do not merge incompatible towns because their display names match.

Private invitations target a home ID and carry an access capability. Knowing a
home's ID alone must not grant entry. Guests may interact; only the owner commits
home edits initially. Co-editing can be added as an explicit owner-granted role.
The public host must validate owner signatures and base revisions before accepting
personal-home changes. Hosting the lobby does not grant ownership of others' homes.

Current invitations identify an owner-hosted street. They are not yet this private
home access system. Current saves live in the owner's browser; there is no cloud
account recovery or cross-device save service.

## Acceptance sequence

1. Two fresh browser identities open the normal URL and meet without exchanging a
   link. Simultaneous startup converges to one host and one town simulation.
2. Both request the same parcel. One claim succeeds; the other retains its home
   and receives a valid alternative. Reload preserves both personal homes.
3. A private invitation admits the invited player; an uninvolved client cannot
   enter or submit an edit. A stale or unsigned home revision is rejected.
4. Two visitors contend for a bed or instrument. One reservation wins, the other
   remains mobile, and disconnect releases the reservation.
5. The owner edits and undoes a room while visitors and distant NPCs stay active.
   Reload and backup import restore the same committed revision.
6. Host loss freezes authority changes until a successor has the last accepted
   snapshot and input sequence. Never let two hosts independently award parcels.
7. Repeat across independent networks, including a restrictive NAT. Local native
   WebRTC tests verify game behavior, not internet connectivity or relay coverage.

## Version 0.3 groundwork

Version 0.3 adds exclusive domestic activities with separate approach, pose and
exit points. Native WebRTC tests cover occupied-bed refusal, release and guest
pose replication. The whole resident population remains in each host snapshot,
encoded in seven bytes per resident before base64; local simulation runs in a
dedicated worker. Version 0.4 adds public admission. Personal home claims,
home-save export and full simulation handover remain open.
