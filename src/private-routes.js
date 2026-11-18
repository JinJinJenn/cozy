// Private invitations use the same room key and actor on either WebRTC strategy.
// A guest races discovery only while it lacks an authenticated host snapshot.
const fallbackAfter = 9000;
const retryAfter = 18000;

export class PrivateRoutes {
  constructor(session, join) {
    this.session = session;
    this.join = join;
    this.routes = new Map();
    this.nextAttempt = 0;
    this.retryDelay = retryAfter;
    this.active = null;
  }

  start(now) {
    this.nextAttempt = now + fallbackAfter;
    this.open('nostr');
    if (this.session.owner) this.open('torrent');
  }

  open(strategy) {
    if (this.session.closed || this.routes.has(strategy)) return;
    const slot = { connection: null, closing: false };
    this.routes.set(strategy, slot);
    const current = () => !slot.closing && !this.session.closed;
    slot.ready = (async () => {
      try {
        const connection = await this.join(strategy, current);
        if (!current()) {
          await connection.leave();
          return;
        }
        slot.connection = connection;
        this.session.connections.push(connection);
        await this.session.attachPrivate('trystero-' + strategy, connection);
      } catch (e) {
        this.session.transportError = String(e.message || e);
      }
    })();
  }

  async drop(strategy) {
    const slot = this.routes.get(strategy);
    if (!slot || slot.closing) return;
    slot.closing = true;
    const links = this.session.connections;
    const index = links.indexOf(slot.connection);
    if (index >= 0) links.splice(index, 1);
    try {
      if (slot.connection) await slot.connection.leave();
      await slot.ready;
    } catch (e) {
      this.session.transportError = String(e.message || e);
    } finally {
      this.routes.delete(strategy);
    }
  }

  confirmed(kind, now) {
    // Once admitted, try the other route as soon as StreetSession detects a
    // stale host frame. Keep the longer initial window for ordinary invites.
    this.nextAttempt = now + 4000;
    this.retryDelay = retryAfter;
    if (this.active === kind) return;
    this.active = kind;
    for (const strategy of this.routes.keys()) {
      if (kind !== 'trystero-' + strategy) void this.drop(strategy);
    }
  }

  tick(now) {
    if (this.session.closed || this.session.owner || this.session.connected || now < this.nextAttempt) return;
    this.active = null;
    this.nextAttempt = now + this.retryDelay;
    this.retryDelay = Math.min(60000, this.retryDelay * 2);
    // Give both discoveries time to finish before renewing either. One stalled
    // signalling service cannot hold the other join or a local visit open.
    if (!this.routes.has('torrent') || !this.routes.has('nostr')) {
      this.open('torrent');
      this.open('nostr');
      return;
    }
    for (const strategy of this.routes.keys()) {
      const slot = this.routes.get(strategy);
      if (slot.closing) continue;
      void this.drop(strategy).then(() => {
        if (!this.session.connected && !this.session.owner) this.open(strategy);
      });
    }
  }
}
