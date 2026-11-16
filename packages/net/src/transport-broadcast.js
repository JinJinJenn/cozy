// BroadcastChannel loopback transport. Same-origin tabs of one browser profile only; used for
// headless tests and offline "two tabs" play. Presence is built from hello/bye/ping messages
// because BroadcastChannel has no membership events.
//
// Transport contract (also implemented by transport-trystero.js):
//   async join(roomId, {onPeerJoin(id), onPeerLeave(id), onMessage(id, data), onError(e)})
//     -> { selfId, send(data), leave() }
export function createBroadcastTransport({ pingMs = 1000, timeoutMs = 3500, name = 'cozy-net' } = {}) {
  return {
    kind: 'broadcast',
    async join(roomId, h) {
      const selfId = 'bc-' + Math.random().toString(36).slice(2, 10);
      const ch = new BroadcastChannel(`${name}:${roomId}`);
      const peers = new Map(); // id -> lastSeen
      const raw = m => { try { ch.postMessage({ from: selfId, ...m }); } catch {} };
      const seen = id => {
        const isNew = !peers.has(id);
        peers.set(id, performance.now());
        if (isNew) { h.onPeerJoin?.(id); raw({ k: 'hello' }); } // answer so the newcomer learns about us
      };
      ch.onmessage = e => {
        const m = e.data;
        if (!m || m.from === selfId) return;
        if (m.k === 'bye') { if (peers.delete(m.from)) h.onPeerLeave?.(m.from); return; }
        seen(m.from);
        if (m.k === 'data') h.onMessage?.(m.from, m.d);
      };
      raw({ k: 'hello' });
      const timer = setInterval(() => {
        raw({ k: 'ping' });
        const now = performance.now();
        for (const [id, t] of peers) if (now - t > timeoutMs) { peers.delete(id); h.onPeerLeave?.(id); }
      }, pingMs);
      const onUnload = () => raw({ k: 'bye' });
      globalThis.addEventListener?.('pagehide', onUnload);
      return {
        selfId,
        send: d => raw({ k: 'data', d }),
        leave() {
          clearInterval(timer); raw({ k: 'bye' });
          globalThis.removeEventListener?.('pagehide', onUnload); ch.close();
        },
      };
    },
  };
}
