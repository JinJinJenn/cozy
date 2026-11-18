// Trystero transport (serverless WebRTC). Signalling goes through public Nostr relays or
// BitTorrent WebSocket trackers; game data then flows peer to peer over WebRTC data channels.
// The vendored bundles are lazy-loaded so nothing is fetched unless a guest actually joins.
import { APP_ID } from './invite.js';

export function createTrysteroTransport({ strategy = 'nostr', appId = APP_ID, rtcConfig, relayUrls } = {}) {
  return {
    kind: 'trystero-' + strategy,
    async join(roomId, h) {
      const mod = await import(new URL(`../vendor/trystero-${strategy}.min.js`, import.meta.url).href);
      // identity 'none': fresh id per tab, so two tabs in one browser are two players
      const cfg = { appId, identity: 'none' };
      if (rtcConfig) cfg.rtcConfig = rtcConfig;
      if (relayUrls) cfg.relayUrls = relayUrls;
      const room = mod.joinRoom(cfg, roomId);
      const self = await room.getSelf();
      const action = room.makeAction('state');
      action.onMessage((d, ctx) => h.onMessage?.(ctx.peerId, d));
      room.onPeerJoin(c => h.onPeerJoin?.(c.peerId));
      room.onPeerLeave(c => h.onPeerLeave?.(c.peerId));
      room.onError?.(e => h.onError?.(e));
      return {
        selfId: self.peerId,
        send: (d, target) => { action.send(d, {target}).catch(() => {}); },
        leave: () => room.leave(),
      };
    },
  };
}
