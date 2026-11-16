// Invite-link helpers. Pure functions, no DOM required (URL is global in browsers and Node).
// A room is fully determined by seed + preset so two players with the same island meet.
export const APP_ID = 'cozy-island.tront.xyz';

/** Stable short hash (FNV-1a style, two lanes) -> 16 hex chars. A namespace, not security. */
function hash16(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** Default room id derived from the island identity. */
export function roomIdFor(seed, preset) {
  return 'island-' + hash16(`${String(seed)}|${String(preset)}`);
}

/**
 * Build an invite URL. `base` is the page URL (e.g. location.href); existing query/hash is replaced.
 * `room` is optional; when omitted it is derived, so a link without it still works, but an
 * explicit room lets a host open a second private room for the same island.
 */
export function buildInvite(base, { seed, preset, room } = {}) {
  if (seed == null || preset == null) throw new Error('buildInvite needs seed and preset');
  const u = new URL(base);
  u.search = '';
  u.hash = '';
  u.searchParams.set('seed', String(seed));
  u.searchParams.set('preset', String(preset));
  u.searchParams.set('room', sanitizeRoom(room) || roomIdFor(seed, preset));
  return u.toString();
}

/** Parse an invite (URL string, URL, or location-like). Returns null if seed/preset missing. */
export function parseInvite(input) {
  let u;
  try { u = input instanceof URL ? input : new URL(String(input.href || input)); } catch { return null; }
  const seed = u.searchParams.get('seed');
  const preset = u.searchParams.get('preset');
  if (!seed || !preset) return null;
  const explicit = sanitizeRoom(u.searchParams.get('room'));
  return { seed, preset, room: explicit || roomIdFor(seed, preset), derivedRoom: !explicit };
}

/** Rooms are public rendezvous names: restrict to a safe charset and length. */
export function sanitizeRoom(r) {
  if (!r) return '';
  return String(r).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64);
}
