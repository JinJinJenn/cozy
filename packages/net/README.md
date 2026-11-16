# @cozy/net: guest-join skeleton

Serverless guest join for the Cozy island. A host shares a link, a guest opens it, both see each other's position and rotation. No game server, no accounts. Browser ES modules, no bundler.

## Pieces

```
index.js                      barrel export
src/invite.js                 buildInvite / parseInvite / roomIdFor / sanitizeRoom
src/net-session.js            NetSession: join, 10 Hz pose broadcast, peers, interpolation, events
src/interp.js                 Interpolator (snapshot buffer, yaw-safe lerp, capped extrapolation)
src/transport-trystero.js     Trystero (WebRTC data channels; Nostr or BitTorrent signalling)
src/transport-broadcast.js    BroadcastChannel loopback (same browser profile, no network)
vendor/trystero-nostr.min.js  vendored Trystero bundles (see Vendoring)
vendor/trystero-torrent.min.js
test/unit.test.mjs            node --test: invite, interpolation, NetSession with a fake transport
test/e2e.html, test/e2e.mjs   Playwright headless two-tab test
```

## Usage

```js
import { NetSession, createTrysteroTransport, parseInvite, buildInvite } from './packages/net/index.js';

const inv = parseInvite(location.href);            // {seed, preset, room} or null
const net = new NetSession({
  transport: createTrysteroTransport({ strategy: 'nostr' }),   // or 'torrent'
  room: inv.room, name: 'Trent',
});
net.on('peerjoin',  p => spawnAvatar(p.id));
net.on('peerleave', p => removeAvatar(p.id));
await net.join();

// every frame
net.setLocal([x, y, z], [yaw, pitch]);             // sent at 10 Hz, only when changed (1 s heartbeat)
for (const s of net.getPeerStates()) moveAvatar(s.id, s.p, s.r);   // interpolated, ~120 ms behind

shareButton.onclick = () => navigator.clipboard.writeText(
  buildInvite(location.href, { seed, preset }));    // ?seed=...&preset=...&room=island-<hash>
```

The room id defaults to a hash of seed+preset (`roomIdFor`), so anyone on the same island lands together. Pass an explicit `room` to open a private second room for the same island.

## Architecture

- Signalling: Trystero publishes presence under (appId, roomId) on public Nostr relays or WebTorrent trackers. Peers exchange SDP through them, then talk over a direct WebRTC data channel. Relays only ever see the SDP offers and the room topic.
- Transport contract: `join(roomId, {onPeerJoin, onPeerLeave, onMessage, onError}) -> {selfId, send, leave}`. NetSession knows nothing about Trystero, so the loopback transport and tests drop in.
- Packet (JSON): `{n: name, p: [x,y,z], r: [yaw,pitch], s: seq}`, values rounded to mm. Receivers validate shape, finiteness and sequence (stale/duplicate packets dropped) and cap names at 24 chars. Remote data is untrusted.
- Interpolation: arrivals are stamped with the local clock and rendered 120 ms in the past; between samples lerp, yaw takes the short way round, past the newest sample it extrapolates at most 150 ms then holds.
- Presence: transport leave events are primary; a peer silent for 8 s is also dropped.
- Identity: `identity: 'none'` so every tab is a fresh peer id (Trystero's default persists identity and would merge two tabs in one browser into one user).

## Vendoring

Trystero ships unbundled modules with bare imports, which do not load without a bundler. The two vendored files were built once with esbuild:

```
npm install trystero@0.27.0 @trystero-p2p/torrent@0.27.0 esbuild@0.28.2 --ignore-scripts   # scratch dir
esbuild node_modules/@trystero-p2p/<nostr|torrent>/dist/index.mjs --bundle --format=esm --minify --target=es2022 --legal-comments=none
```

Strategies are lazy-imported, so a page that never joins never loads them. Licence: MIT (`vendor/TRYSTERO-LICENSE.txt`).

## Tests

```bash
node --test packages/net/test/unit.test.mjs          # fast, no browser
node packages/net/test/e2e.mjs                       # broadcast loopback only (offline-safe)
node packages/net/test/e2e.mjs nostr                 # real Trystero over public Nostr relays
node packages/net/test/e2e.mjs torrent               # real Trystero over public WebTorrent trackers
node packages/net/test/e2e.mjs all
```

The e2e runs two headless tabs in one browser context against a localhost static server, joins a random room, and asserts each tab sees the other's position advance in the scripted direction, names carry, send rate is about 10 Hz, and `peerleave` fires when a tab closes. Exit code 2 means signalling was unreachable (reported, not counted as a pass).

## Limits

- No TURN. Peers behind symmetric NATs or strict firewalls will fail to connect; STUN-only. The e2e only covers two tabs on one machine (host ICE candidates), so NAT traversal over the real internet is untested.
- Public relays and trackers are best effort: they come and go, rate limit, and discovery can take several seconds. No SLA.
- Mesh topology: every peer connects to every other. Fine for a handful of friends, not for dozens (Trystero's `scale()` plugin exists but is not wired in).
- No authority, no anti-cheat: every client reports its own position. No shared world state (edits, items, time of day) yet, only poses.
- Leave detection over WebRTC can take about 8 s after an abrupt close (observed 8 s in e2e); a graceful `net.leave()` is faster.
- Anyone who knows or guesses the room id can join; there is no password (Trystero supports `password`, not enabled). The derived room id is a hash of seed+preset, so a popular seed is a shared public room.
- Packets are JSON for readability; a binary layout would cut size roughly 4x if bandwidth ever matters.
- The loopback transport is same-origin, same-profile only.
- Not yet wired into `src/main.js` (this package is standalone by request).
