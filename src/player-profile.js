import {validFlower} from './roadside-flowers.js';
export const shirts = Object.freeze({
  rose: '#c55b61', juniper: '#52806a', denim: '#6687bd',
  saffron: '#be903e', plum: '#98719a', lagoon: '#438a95'
});
const first = ['Amber','Briar','Cedar','Clover','Fern','Linden','Maple','Willow'];
const last = ['Brook','Cove','Glen','Hill','Lake','Reed','Shore','Vale'];
const profileKey = 'cozy.player-profile.1';

export function defaultProfile(id) {
  let value = 0;
  for (const c of id) value = (Math.imul(value, 31) + c.charCodeAt(0)) >>> 0;
  return {name: first[value % first.length] + ' ' + last[(value >>> 8) % last.length],
    shirt: Object.keys(shirts)[(value >>> 16) % Object.keys(shirts).length]};
}

export function readProfile(value) {
  if (typeof value?.name !== 'string' || value.name.length > 96 ||
      typeof value.shirt !== 'string' || !Object.hasOwn(shirts, value.shirt)) return null;
  const name = value.name.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu, '')
    .replace(/\s+/gu, ' ').trim();
  if (!name || [...name].length > 24) return null;
  return {name, shirt: value.shirt,...(validFlower(value.flower)?{flower:value.flower}:{})};
}

export function storeProfile(profile) {
  try { localStorage.setItem(profileKey, JSON.stringify(profile)); return true; }
  catch { return false; }
}
export function loadProfile(id) {
  try {
    const profile = readProfile(JSON.parse(localStorage.getItem(profileKey)));
    if (profile) return profile;
  } catch { /* A visitor can still choose an appearance for this session. */ }
  const profile = defaultProfile(id);
  storeProfile(profile);
  return profile;
}
export function sameProfile(a, b) { return a?.name === b?.name && a?.shirt === b?.shirt && a?.flower === b?.flower; }
export function canGesture(actor) {
  return !!actor && !actor.vehicle && !actor.cup && !actor.tray && !actor.bowlFrom && !actor.outing &&
    (!actor.activity || actor.activity === 'sit' || actor.activity === 'relax');
}
export const gestureSeconds = 2.6;
export function canGreet(actor, other) {
  return canGesture(actor) && !!other && other.id !== actor.id && !other.id.startsWith('resident') &&
    Math.hypot(other.x-actor.x,other.z-actor.z)<=15;
}
export function gesturePhase(actor, time) {
  if (!canGesture(actor) || !['wave','cheer'].includes(actor.gesture) || !Number.isFinite(actor.gestureAt)) return null;
  const age = time - actor.gestureAt;
  return age >= 0 && age < gestureSeconds ? age / gestureSeconds : null;
}
