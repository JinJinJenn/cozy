// Deterministic headless town simulator.
//
// State = seed + config + ordered input log (events from the host/players) + the op log of the objects replica.
// There is no wall clock and no Math.random: step() advances exactly one fixed timestep.
import {driveAcceleration} from './powertrain.js';
import { Replica } from '../../objects/index.js';
import { Rng, hashSeed, hashFloat } from './rng.js';
import { buildContext } from './context.js';
import { createObjects, asNpcReplica, placeDefaults, seatInfo, lampOn, lampUser, tryAct, NPC_PEER, npcWho } from './objects.js';

export const DEFAULTS = {
  seed: 'cozy-1',
  preset: 'harborTown',
  npcCount: 8, // 5..12
  stepDt: 0.5, // sim seconds per fixed step
  dayLength: 1440, // sim seconds per 24 h (one hour = 60 s)
  startHour: 5, // sim starts at 05:00, everybody asleep at home
  walkSpeed: 3, // m/s
  tether: 170, // NPCs stay within this many metres of their home
  stuckLimit: 60, // steps without progress before the watchdog acts
  logCap: 40000,
};
const NAMES = ['Mossy', 'Pip', 'Juniper', 'Bramble', 'Clover', 'Tansy', 'Wren', 'Fig', 'Basil', 'Marlow', 'Sorrel', 'Hazel'];
const GIVEN=[...NAMES,'Nico','Cora','Ada','Max','Jules','Bea','Iris','Sam','Fern','Orla','Ellis','Nell','Robin','Milo','Aster','Theo','Romy','Kit','Alma','Cleo'];
const FAMILY=['Finch','Reed','Moreno','Lin','Brooks','Hart','Bell','Silva','Patel','Kim','Bennett','Dale','Rossi','Ito','Vega','Byrne','Wells','Park','Marin','Rose','Lane','Yu','Eaton','Chen','Meyer','Nash','Flores','Cole','Shaw','Costa','Singh','Ford'];
const MOODS = [[0.5, 'delighted'], [0.2, 'happy'], [-0.2, 'content'], [-0.5, 'bored'], [-9, 'lonely']];
const SLOTS_PER_DAY = 4;

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clone = (v) => JSON.parse(JSON.stringify(v));
const centroid = (poly) => {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
};

export class NoUsableHomesError extends Error {}

export class Simulation {
  static create(config = {}, { ctx } = {}) {
    const cfg = normalise(config);
    return new this(cfg, ctx || buildContext(cfg), null);
  }
  static fromJSON(snap, { ctx } = {}) {
    if (!snap || snap.v !== 1) throw new Error('unsupported sim snapshot');
    return new this(snap.config, ctx || buildContext(snap.config), snap);
  }
  // Rebuild a sim from nothing but config + the input log (host-authoritative replay).
  static replay(config, inputLog, ticks, { ctx } = {}) {
    const sim = this.create(config, { ctx });
    sim.runLog(inputLog, ticks);
    return sim;
  }

  constructor(cfg, ctx, snap) {
    this.cfg = cfg;
    this.ctx = ctx;
    if (snap) this._load(snap);
    else this._init();
  }

  // ---- construction ----------------------------------------------------------------------------------
  _init() {
    const { cfg, ctx } = this;
    this.tick = 0;
    this.acc = 0;
    this.rng = new Rng(hashSeed(`${cfg.seed}|${cfg.preset}|sim`));
    this.reservations = {};
    this.players = {};
    this.music = {};
    this.weatherOverride = null;
    this.lastWeather = null;
    this.log = [];
    this.logDropped = 0;
    this.inputLog = [];
    this.pending = [];
    this.stats = { teleports: 0, maxStuck: 0, chats: 0, seatClaims: 0, seatRefusals: 0, lampsUsed: 0, greets: 0 };
    const homes = this._assignHomes();
    const host = createObjects();
    if(ctx.placeObjects)ctx.placeObjects(host);else placeDefaults(host, ctx, homes, this.rng);
    this.objects = asNpcReplica(host);
    this.npcs = homes.map((h, i) => this._makeNpc(i, h));
    this.lastWeather = this.weather().state;
  }

  _assignHomes() {
    const { cfg, ctx, rng } = this;
    const nav = ctx.nav;
    const cand = [];
    for (const lot of ctx.plan.lots) {
      if (!lot.buildable||lot.use) continue;
      const location=ctx.homeLocations?.get(lot.id);
      if(ctx.homeLocations&&!location)continue;
      const c = location?[location.x,location.z]:centroid(lot.poly);
      if (!nav.land(c[0], c[1])) continue;
      const node = nav.nearestNode(c[0], c[1], 80);
      if (node < 0) continue;
      cand.push({ lotId: lot.id, x: r2(c[0]), z: r2(c[1]), door: nav.nodes[node].slice(), comp: nav.comp[node] });
    }
    if (!cand.length) throw new NoUsableHomesError('sim: settlement has no usable home lots');
    // The live city gives each usable parcel its own household. Keep the small
    // clustered population mode for deterministic package fixtures and replays.
    if(cfg.population==='town')return cand;
    const per = new Map();
    for (const c of cand) per.set(c.comp, (per.get(c.comp) || 0) + 1);
    let best = null;
    for (const [k, v] of per) if (best === null || v > per.get(best) || (v === per.get(best) && k < best)) best = k;
    let pool = cand.filter((c) => c.comp === best);
    // neighbours: homes cluster around the town with the most usable lots, so NPCs actually meet
    let hub = null, hubN = -1;
    for (const site of ctx.plan.sites) {
      const n = pool.filter((c) => Math.hypot(c.x - site.x, c.z - site.z) <= 150).length;
      if (n > hubN) { hubN = n; hub = site; }
    }
    if (hub) {
      pool.sort((a, b) => Math.hypot(a.x - hub.x, a.z - hub.z) - Math.hypot(b.x - hub.x, b.z - hub.z) || (a.lotId < b.lotId ? -1 : 1));
      pool = pool.slice(0, Math.max(cfg.npcCount * 3, 24));
    }
    for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const homes = [];
    for (let i = 0; i < cfg.npcCount; i++) homes.push(pool[i % pool.length]);
    return homes;
  }

  _makeNpc(i, home) {
    const { rng } = this;
    const traits = { sociability: r2(rng.float()), laziness: r2(rng.float()), curiosity: r2(rng.float()), nightOwl: r2(rng.float()) };
    const wake = r2(6 + traits.nightOwl * 0.9 + rng.range(-0.35, 0.35));
    const bed = r2(20.8 + traits.nightOwl * 0.9 + rng.range(-0.2, 0.2));
    const n = {
      id: `n${i}`, name: NAMES[i % NAMES.length]+(i>=NAMES.length?' '+(1+Math.floor(i/NAMES.length)):''), traits, wake, bed, pace: r2(rng.range(0.9, 1.1)),
      home: { lotId: home.lotId, x: home.x, z: home.z, door: home.door, comp: home.comp },
      pos: [home.x, home.z], heading: 0, mood: 0, sleeping: false, homeMode: false, recheck: false,
      action: null, seat: null, lastSat: -1e9, lastChat: -1e9, greeted: {}, fails: 0, stuck: 0, lastPos: [home.x, home.z],
    };
    const h = this.hourOfDay();
    if(this.cfg.population==='town'){
      const nameIndex=(i*347+hashSeed(this.cfg.seed+'|names'))%(GIVEN.length*FAMILY.length);
      n.name=GIVEN[nameIndex%GIVEN.length]+' '+FAMILY[Math.floor(nameIndex/GIVEN.length)];
      if(this.ctx.hasCarVisit?.(home.lotId)){
        n.nextDrive=this._steps(55*hashFloat(this.cfg.seed,home.lotId,'first drive'));
      }
    }
    if (h >= bed || h < wake) { n.sleeping = true; n.action = { kind: 'sleep', interruptible: false }; }
    else if(this.cfg.population==='town')n.action={kind:'idle',until:i%16,interruptible:true};
    return n;
  }

  _load(snap) {
    this.tick = snap.tick;
    this.acc = snap.acc;
    this.rng = new Rng(snap.rng);
    this.npcs = clone(snap.npcs);
    this.reservations = clone(snap.reservations);
    this.players = clone(snap.players);
    this.music = clone(snap.music);
    this.weatherOverride = snap.weatherOverride;
    this.lastWeather = snap.lastWeather;
    this.log = clone(snap.log);
    this.logDropped = snap.logDropped;
    this.inputLog = clone(snap.inputLog);
    this.pending = clone(snap.pending);
    this.stats = clone(snap.stats);
    this.objects = Replica.fromJSON(snap.objects, { peerId: NPC_PEER });
  }

  // ---- clock + weather -------------------------------------------------------------------------------
  seconds() { return this.tick * this.cfg.stepDt + (this.cfg.startHour / 24) * this.cfg.dayLength; }
  hourOfDay() { return ((this.seconds() % this.cfg.dayLength) / this.cfg.dayLength) * 24; }
  clock() {
    const s = this.seconds(), L = this.cfg.dayLength;
    const hour = ((s % L) / L) * 24, day = Math.floor(s / L);
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    const phase = hour >= 21 || hour < 5 ? 'night' : hour < 8 ? 'dawn' : hour < 18 ? 'day' : 'dusk';
    return { tick: this.tick, seconds: s, day, dayNumber: day + 1, hour, hh, mm, phase, label: `D${day + 1} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
  }
  // Exposed hook, no behavioural effect: clear | overcast | rain | fog. Host events can override it.
  weather() {
    if (this.weatherOverride) return { state: this.weatherOverride, source: 'event' };
    const c = this.clock();
    const r = hashFloat(this.cfg.seed, 'weather', c.day, Math.floor(c.hour / (24 / SLOTS_PER_DAY)));
    return { state: r < 0.55 ? 'clear' : r < 0.8 ? 'overcast' : r < 0.93 ? 'rain' : 'fog', source: 'auto' };
  }

  // ---- inputs ----------------------------------------------------------------------------------------
  // Host-authoritative inputs. Each is logged with the tick it applies at, so (config + inputLog) replays the sim.
  //   {type:'music', id, x, z, radius?, on?}   {type:'player', id, x, z, near?}
  //   {type:'weather', state|'auto'}           {type:'objectOp', op}  (an op from a player replica)
  submit(ev) {
    const e = { tick: this.tick, ...clone(ev) };
    this.inputLog.push(e);
    this.pending.push(e);
    return e;
  }
  // Re-feed a recorded input log: step until each event tick, submit it, continue to `ticks`.
  runLog(inputLog, ticks) {
    const evs = inputLog.slice().sort((a, b) => a.tick - b.tick);
    let k = 0;
    for (;;) {
      while (k < evs.length && evs[k].tick <= this.tick) { const { tick, ...rest } = evs[k++]; this.submit(rest); }
      if (this.tick >= ticks) break;
      this.step();
    }
    return this;
  }

  // ---- stepping --------------------------------------------------------------------------------------
  // tickDt(dt): accumulate frame time and run whole fixed steps (the accumulator is part of the state).
  tickDt(dt) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.cfg.stepDt - 1e-9) { this.acc -= this.cfg.stepDt; this.step(); n++; }
    return n;
  }
  advance(steps) { for (let i = 0; i < steps; i++) this.step(); return this; }
  advanceDays(days) { return this.advance(Math.round((days * this.cfg.dayLength) / this.cfg.stepDt)); }

  step() {
    this._applyPending();
    const h = this.hourOfDay();
    const w = this.weather().state;
    if (w !== this.lastWeather) { this.lastWeather = w; this._log('world', 'weather', { state: w }); }
    for (const n of this.npcs) this._update(n, h);
    this.tick++;
  }

  _applyPending() {
    if (!this.pending.length) return;
    const list = this.pending;
    this.pending = [];
    for (const e of list) {
      if (e.type === 'music') {
        if (e.on === false) delete this.music[e.id]; else this.music[e.id] = { x: e.x, z: e.z, radius: e.radius || 40 };
        this._log('world', 'event', { type: 'music', id: e.id, on: e.on !== false });
        this._recheckAll();
      } else if (e.type === 'player') {
        if (e.near === false) delete this.players[e.id]; else this.players[e.id] = { x: e.x, z: e.z };
        this._log('world', 'event', { type: 'player', id: e.id, near: e.near !== false });
        this._recheckAll();
      } else if (e.type === 'weather') {
        this.weatherOverride = !e.state || e.state === 'auto' ? null : e.state;
        this._log('world', 'event', { type: 'weather', state: e.state || 'auto' });
      } else if (e.type === 'objectOp') {
        const r = this.objects.receive(e.op);
        this._log('world', 'event', { type: 'objectOp', ok: !!r.ok });
      } else this._log('world', 'event', { type: 'ignored' });
    }
  }
  _recheckAll() { for (const n of this.npcs) if (!n.sleeping && !n.homeMode) n.recheck = true; }

  _log(who, kind, extra = {}) {
    const c = this.clock();
    this.log.push({ t: this.tick, day: c.dayNumber, hour: r2(c.hour), who, kind, ...extra });
    if (this.log.length > this.cfg.logCap + 2000) { this.logDropped += this.log.length - this.cfg.logCap; this.log.splice(0, this.log.length - this.cfg.logCap); }
  }

  // ---- per-NPC update --------------------------------------------------------------------------------
  _update(n, h) {
    const night = h >= n.bed || h < n.wake;
    if (n.sleeping) {
      if (night) return;
      n.sleeping = false; n.homeMode = false; n.action = null; n.mood *= 0.5;
      this._log(n.id, 'wake', {});
    }
    if (!n.homeMode && (night || h >= 19 || (h >= 16.5 && this._mustLeave(n, h)))) { n.homeMode = true; this._end(n); }
    const past = (h - n.bed + 24) % 24; // hours since bedtime
    if (night && !this._atHome(n) && past > 0.75 && past < 12) this._teleport(n, 'curfew');
    if (!n.action) this._decide(n, h);
    else if (n.recheck && n.action.interruptible) { this._end(n); this._decide(n, h); }
    this._advance(n);
    n.mood = clamp(n.mood * 0.9997, -1, 1);
    // watchdog: moving (or failing to move) without any displacement
    const moved = dist(n.pos, n.lastPos);
    n.lastPos = n.pos.slice();
    const a = n.action;
    if (moved > 1e-6 || a?.waitingForTraffic) n.stuck = 0;
    else if (a && (a.kind === 'move' || (a.kind === 'idle' && a.afterFail))) n.stuck++;
    else n.stuck = 0;
    if (n.stuck > this.stats.maxStuck) this.stats.maxStuck = n.stuck;
    if (n.stuck > this.cfg.stuckLimit) {
      n.stuck = 0;
      if (n.homeMode) this._teleport(n, 'stuck');
      else { this._end(n); this._log(n.id, 'unstick', {}); }
    }
  }

  // Start the walk home early when the route is long: arrival time plus margin must beat bedtime.
  _mustLeave(n, h) {
    if (this.tick % 20 !== Number(n.id.slice(1)) % 20) return false;
    const p = this.ctx.nav.findPath(n.pos, [n.home.x, n.home.z], n.home.comp);
    if (!p) return false;
    const perHour = (n.pace * this.cfg.walkSpeed * this.cfg.dayLength) / 24;
    return p.len / perHour + 1 >= n.bed - h;
  }

  _atHome(n) { return dist(n.pos, [n.home.x, n.home.z]) < 3.5; }
  _steps(sec) { return Math.max(1, Math.ceil(sec / this.cfg.stepDt)); }
  _idle(n, sec, extra = {}) { n.action = { kind: 'idle', until: this.tick + this._steps(sec), interruptible: true, ...extra }; }
  _npc(id) { return this.npcs.find((x) => x.id === id) || null; }

  _teleport(n, reason) {
    this._end(n);
    n.pos = [n.home.x, n.home.z];
    n.fails = 0; n.stuck = 0;
    this.stats.teleports++;
    this._log(n.id, 'teleport', { reason });
  }

  // release everything the current action holds (seat, reservation, lamp claim, chat partner)
  _end(n) {
    const a = n.action;
    if (a) {
      if (a.kind === 'sit' && n.seat) {
        tryAct(this.objects, n.seat.objectId, n.seat.layerId, n.seat.leave, { who: npcWho(n.id) });
        n.seat = null;
        n.lastSat = this.tick;
        n.mood = clamp(n.mood + 0.05, -1, 1);
      } else if (a.kind === 'move' && a.then && (a.then.kind === 'sit' || a.then.kind === 'lamp')) this._unreserve(a.then.objectId, n.id);
      else if (a.kind === 'lamp') tryAct(this.objects, a.objectId, 'npc', 'release', { who: npcWho(n.id) });
      const partnerId = a.kind === 'chat' || a.kind === 'chatWait' ? a.partner : a.kind === 'move' && a.then && a.then.kind === 'chat' ? a.then.partner : null;
      const p = partnerId ? this._npc(partnerId) : null;
      if (p && p.action && p.action.partner === n.id && (p.action.kind === 'chat' || p.action.kind === 'chatWait')) p.action = null;
    }
    n.action = null;
  }

  _reserve(objectId, id) { (this.reservations[objectId] ||= []).push(id); }
  _unreserve(objectId, id) {
    const l = this.reservations[objectId];
    if (!l) return;
    const i = l.indexOf(id);
    if (i >= 0) l.splice(i, 1);
    if (!l.length) delete this.reservations[objectId];
  }
  _reservedByOthers(objectId, id) { return (this.reservations[objectId] || []).filter((x) => x !== id).length; }

  // ---- decisions -------------------------------------------------------------------------------------
  _decide(n, h) {
    n.recheck = false;
    const night = h >= n.bed || h < n.wake;
    const home = this._atHome(n);
    if (night) return home ? this._sleep(n) : this._goHome(n);
    if (n.homeMode) {
      if (!home) return this._goHome(n);
      const lamp = this._lampTarget(n, h, 35);
      const lp = lamp && this.ctx.nav.findPath(n.pos, [lamp.x, lamp.z], n.home.comp);
      if (lp && lp.len <= 45) return this._startLamp(n, lamp);
      return this._idle(n, this.rng.range(20, 40), { rest: true });
    }
    if(this.ctx.hasCarVisit?.(n.home.lotId)&&this.tick>=(n.nextDrive||0)){
      const trip=this.ctx.carTrip(n,!!n.returnVisit);
      n.nextDrive=this.tick+this._steps(45);
      if(trip){
        n.action={kind:'move',purpose:'visit',...trip,i:0,then:{kind:'endVisit',returning:!!n.returnVisit,destination:trip.destination},interruptible:false};
        return;
      }
    }
    const t = n.traits, dt = this.cfg.stepDt, rng = this.rng;
    const since = (tk) => (this.tick - tk) * dt;
    const cands = [{ kind: 'wander', score: 0.35 + 0.35 * t.curiosity }];
    const seat = this._bestSeat(n);
    if (seat) cands.push({ kind: 'sit', seat, score: 0.25 + 0.55 * t.laziness * clamp(since(n.lastSat) / 240, 0, 1) - seat.d / 400 });
    const partner = this._chatPartner(n);
    if (partner) cands.push({ kind: 'chat', partner, score: 0.2 + 0.6 * t.sociability * clamp(since(n.lastChat) / 240, 0, 1) + clamp(-n.mood, 0, 0.3) });
    const mus = this._musicTarget(n);
    if (mus) cands.push({ kind: 'music', mus, score: 0.75 + 0.3 * t.sociability - mus.d / 500 });
    const pl = this._greetTarget(n);
    if (pl) cands.push({ kind: 'greet', pl, score: 0.7 + 0.3 * t.sociability });
    const lamp = this._lampTarget(n, h, 120);
    if (lamp) cands.push({ kind: 'lamp', lamp, score: 0.5 + 0.3 * t.curiosity - lamp.d / 400 });
    let best = null;
    for (const c of cands) {
      c.score += rng.float() * 0.12;
      if (!best || c.score > best.score) best = c;
    }
    switch (best.kind) {
      case 'sit': return this._startSit(n, best.seat);
      case 'chat': return this._startChat(n, best.partner);
      case 'music': return this._startMusic(n, best.mus);
      case 'greet': return this._startGreet(n, best.pl);
      case 'lamp': return this._startLamp(n, best.lamp);
      default: return this._wander(n);
    }
  }

  _sleep(n) {
    n.returnVisit=false;delete n.visitingLot;
    n.sleeping = true;
    n.action = { kind: 'sleep', interruptible: false };
    n.pos = [n.home.x, n.home.z];
    n.fails = 0;
    this._log(n.id, 'sleep', {});
  }
  _fail(n, purpose) {
    if (purpose === 'home') {
      n.fails++;
      if (n.fails >= 3) return this._teleport(n, 'no-route');
    }
    this._idle(n, 2, { afterFail: true });
  }
  _tethered(n, x, z, extra = 0) { return Math.hypot(x - n.home.x, z - n.home.z) <= this.cfg.tether + extra; }

  _goHome(n) {
    this._move(n, 'home', [n.home.x, n.home.z], { kind: 'arriveHome' }, { to: 'home' });
  }

  // build a route and start walking it; logs a goTo / wander line
  _move(n, purpose, dest, then, logExtra = {}) {
    const p = this.ctx.nav.findPath(n.pos, dest, n.home.comp);
    if (!p) return this._fail(n, purpose);
    n.action = { kind: 'move', purpose, pts: p.pts.map((q) => [r3(q[0]), r3(q[1])]), i: 0, then, interruptible: purpose !== 'home' };
    this._log(n.id, purpose === 'wander' ? 'wander' : 'goTo', { purpose, to: [r2(dest[0]), r2(dest[1])], len: Math.round(p.len), ...logExtra });
  }

  _wander(n) {
    const { nav } = this.ctx, rng = this.rng;
    let target = null;
    if (rng.chance(0.12)) {
      for (let k = 0; k < 4 && !target; k++) {
        const a = rng.range(0, Math.PI * 2), d = rng.range(6, 14);
        const q = [n.pos[0] + Math.cos(a) * d, n.pos[1] + Math.sin(a) * d];
        if (this._tethered(n, q[0], q[1]) && nav.land(q[0], q[1]) && nav.clearLine(n.pos, q)) target = q;
      }
    }
    if (!target) {
      const c = [];
      for (let i = 0; i < nav.nodes.length; i++) {
        if (nav.comp[i] !== n.home.comp) continue;
        const d = dist(nav.nodes[i], n.pos);
        if (d >= 30 && d <= 120 && this._tethered(n, nav.nodes[i][0], nav.nodes[i][1])) c.push(i);
      }
      if (c.length) target = nav.nodes[c[rng.int(c.length)]];
    }
    if(target&&this.ctx.leisureStop)target=this.ctx.leisureStop(target,n.pos);
    if (!target) return this._idle(n, 3);
    this._move(n, 'wander', target, { kind: 'idle', lo: 3, hi: 14 }, {});
  }

  _bestSeat(n) {
    let best = null;
    for (const o of this.objects.world.list()) {
      const info = seatInfo(o);
      if (!info) continue;
      if(this.ctx.canUseSeat&&!this.ctx.canUseSeat(o))continue;
      if (info.cap - info.users.length - this._reservedByOthers(o.id, n.id) <= 0) continue;
      if (!this._tethered(n, o.pos[0], o.pos[2])) continue;
      const d = Math.hypot(o.pos[0] - n.pos[0], o.pos[2] - n.pos[1]);
      if (d > 90) continue;
      if (!best || d < best.d) best = { id: o.id, x: o.pos[0], z: o.pos[2], d };
    }
    return best;
  }
  _startSit(n, s) {
    this._reserve(s.id, n.id);
    this._move(n, 'seat', [s.x, s.z], { kind: 'sit', objectId: s.id }, { object: s.id });
    if (!n.action || n.action.kind !== 'move') this._unreserve(s.id, n.id);
  }

  _chatPartner(n) {
    if(this.ctx.inTrafficLane?.(n.pos))return null;
    let best = null;
    for (const o of this.npcs) {
      if (o === n || o.sleeping || o.homeMode || !o.action) continue;
      const k = o.action.kind;
      if (o.returnVisit||!(k === 'idle' || k === 'sit' || (k === 'move' && o.action.purpose === 'wander'))) continue;
      const d = dist(o.pos, n.pos);
      if (d <= 16 && (!best || d < best.d) && !this.ctx.inTrafficLane?.(o.pos)) best = { id: o.id, d };
    }
    return best;
  }
  _startChat(n, c) {
    const p = this._npc(c.id);
    this._end(p);
    p.action = { kind: 'chatWait', partner: n.id, until: this.tick + this._steps(60), interruptible: false };
    if (c.d <= 2.6) return this._beginChat(n, p);
    const dx = n.pos[0] - p.pos[0], dz = n.pos[1] - p.pos[1], l = Math.hypot(dx, dz) || 1;
    let dest = [p.pos[0] + (dx / l) * 2, p.pos[1] + (dz / l) * 2];
    if(this.ctx.leisureStop)dest=this.ctx.leisureStop(dest,p.pos)||p.pos.slice();
    if(dist(dest,p.pos)>4)dest=p.pos.slice();
    if (!this.ctx.nav.land(dest[0], dest[1])) dest = p.pos.slice();
    this._move(n, 'chat', dest, { kind: 'chat', partner: p.id }, { with: p.id });
    if ((!n.action || n.action.kind !== 'move') && p.action && p.action.partner === n.id) p.action = null;
  }
  _beginChat(n, p) {
    const until = this.tick + this._steps(this.rng.range(10, 25));
    n.action = { kind: 'chat', partner: p.id, until, interruptible: false };
    p.action = { kind: 'chat', partner: n.id, until, interruptible: false };
    n.heading = r2(Math.atan2(p.pos[1] - n.pos[1], p.pos[0] - n.pos[0]));
    p.heading = r2(Math.atan2(n.pos[1] - p.pos[1], n.pos[0] - p.pos[0]));
    this.stats.chats++;
    this._log(n.id, 'chat', { with: p.id });
  }

  _musicTarget(n) {
    let best = null;
    for (const id of Object.keys(this.music)) {
      const m = this.music[id], d = Math.hypot(m.x - n.pos[0], m.z - n.pos[1]);
      if (d <= 250 && this._tethered(n, m.x, m.z, 80) && (!best || d < best.d)) best = { id, m, d };
    }
    return best;
  }
  _startMusic(n, t) {
    const { nav } = this.ctx, rng = this.rng;
    let dest = null;
    for (let k = 0; k < 6 && !dest; k++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(3, 8);
      const q = [t.m.x + Math.cos(a) * r, t.m.z + Math.sin(a) * r];
      if (nav.land(q[0], q[1])) dest = q;
    }
    if (!dest) return this._wander(n);
    this._move(n, 'music', dest, { kind: 'listen', musicId: t.id }, { music: t.id });
  }

  _greetTarget(n) {
    let best = null;
    for (const id of Object.keys(this.players)) {
      const p = this.players[id], d = Math.hypot(p.x - n.pos[0], p.z - n.pos[1]);
      if (d > 45 || !this._tethered(n, p.x, p.z, 40) || !this.ctx.nav.land(p.x, p.z)) continue;
      if (n.greeted[id] !== undefined && (this.tick - n.greeted[id]) * this.cfg.stepDt < 400) continue;
      if (!best || d < best.d) best = { id, p, d };
    }
    return best;
  }
  _startGreet(n, t) {
    const dx = n.pos[0] - t.p.x, dz = n.pos[1] - t.p.z, l = Math.hypot(dx, dz) || 1;
    let dest = [t.p.x + (dx / l) * 2.5, t.p.z + (dz / l) * 2.5];
    if (!this.ctx.nav.land(dest[0], dest[1])) dest = [t.p.x, t.p.z];
    this._move(n, 'greet', dest, { kind: 'greet', playerId: t.id }, { player: t.id });
  }

  _lampTarget(n, h, maxD) {
    const want = h >= 18.5 || h < 6.5;
    let best = null;
    for (const o of this.objects.world.list()) {
      if (o.defId !== 'lamp' || lampOn(o) === want || lampUser(o) || this.reservations[o.id]) continue;
      const d = Math.hypot(o.pos[0] - n.pos[0], o.pos[2] - n.pos[1]);
      if (d <= maxD && this._tethered(n, o.pos[0], o.pos[2]) && (!best || d < best.d)) best = { id: o.id, x: o.pos[0], z: o.pos[2], d, on: want };
    }
    return best;
  }
  _startLamp(n, l) {
    this._reserve(l.id, n.id);
    this._move(n, 'lamp', [l.x, l.z], { kind: 'lamp', objectId: l.id, on: l.on }, { object: l.id });
    if (!n.action || n.action.kind !== 'move') this._unreserve(l.id, n.id);
  }

  // ---- action progress -------------------------------------------------------------------------------
  _advance(n) {
    const a = n.action;
    if (!a) return;
    const tk = this.tick;
    switch (a.kind) {
      case 'move': {
        if(a.driveStart!==undefined){
          let time=this.cfg.stepDt;
          let accelerated;
          a.waitingForTraffic=false;a.braking=false;
          while(time>1e-7&&a.i<a.pts.length){
            const to=a.pts[a.i],dx=to[0]-n.pos[0],dz=to[1]-n.pos[1],len=Math.hypot(dx,dz);
            const pickup=a.i+1===a.driveStart,boarding=pickup&&a.curbPickup;
            if(len<.001&&!boarding){n.pos=to.slice();a.i++;continue;}
            const driving=a.i>=a.driveStart&&a.i<a.driveEnd;
            let speed=n.pace*this.cfg.walkSpeed;
            if(driving){
              let limit=a.i===a.driveEnd-1?Math.min(8,Math.sqrt(1+6*len)):8;
              for(const g of a.junctions||[]){
                const range=Math.hypot(g.x-n.pos[0],g.z-n.pos[1]);
                limit=Math.min(limit,3.8+Math.max(0,range-4)*.48);
              }
              const corner=a.cornerSpeeds?.[a.i-a.driveStart];
              const cruise=Math.min(limit*n.pace,corner===undefined?Infinity:Math.sqrt(corner*corner+7*len));
              const previous=a.speed||0;
              if(accelerated===undefined){
                const pedal=Math.max(0,Math.min(.82,(cruise-previous)*.65+.13));
                const power=driveAcceleration(a,previous,pedal,time,false);
                accelerated=Math.max(0,previous+power*time);
              }
              speed=Math.min(cruise,accelerated);
              const lookahead=Math.min(len,speed*time+previous*previous/7);
              if(this.ctx.trafficClear&&lookahead>speed*time+.2&&
                !this.ctx.trafficClear(this,n,...n.pos,dx/len,dz/len,lookahead,false)){
                speed=Math.min(speed,Math.max(1,previous-3.5*time));
              }
              if(this.ctx.trafficClear&&!this.ctx.trafficClear(this,n,...n.pos,dx/len,dz/len,Math.min(len,speed*time))){
                a.speed=0;a.engineLoad=0;a.braking=true;a.waitingForTraffic=true;break;
              }
              if(speed<previous){a.engineLoad=0;if(previous-speed>time*.6)a.braking=true;}
              a.speed=speed;
            }
            const distance=boarding?len:Math.min(len,speed*time);
            if(distance===len&&pickup){
              const next=a.pts[a.driveStart],nx=next[0]-to[0],nz=next[1]-to[1],span=Math.hypot(nx,nz)||1;
              if(this.ctx.trafficClear&&(!this.ctx.trafficClear(this,n,...to,nx/span,nz/span,0,false)||
                !this.ctx.trafficClear(this,n,...to,-nx/span,-nz/span,0))){
                a.waitingForTraffic=true;break;
              }
              // Keep the visitor on the pavement until the seat is available.
              // The next driver in this tick sees the newly occupied car.
              if(boarding){n.pos=to.slice();n.heading=Math.atan2(nz,nx);a.i++;break;}
            }
            n.pos=[n.pos[0]+dx/len*distance,n.pos[1]+dz/len*distance];n.heading=Math.atan2(dz,dx);
            time-=distance/speed;
            if(distance===len)a.i++;
          }
          if(a.i===a.pts.length){n.action=null;this._arrive(n,a.then);}
          break;
        }
        let budget = n.pace * this.cfg.walkSpeed * this.cfg.stepDt;
        while (budget > 0 && a.i < a.pts.length) {
          const t = a.pts[a.i], dx = t[0] - n.pos[0], dz = t[1] - n.pos[1], d = Math.hypot(dx, dz);
          if (d <= budget) { n.pos = [t[0], t[1]]; budget -= d; a.i++; if (d > 1e-6) n.heading = r2(Math.atan2(dz, dx)); }
          else { n.pos = [r3(n.pos[0] + (dx / d) * budget), r3(n.pos[1] + (dz / d) * budget)]; n.heading = r2(Math.atan2(dz, dx)); budget = 0; }
        }
        if (a.i >= a.pts.length) { n.action = null; this._arrive(n, a.then); }
        break;
      }
      case 'idle': if (tk >= a.until) n.action = null; break;
      case 'chatWait': if (tk >= a.until) n.action = null; break;
      case 'chat': if (tk >= a.until) { n.mood = clamp(n.mood + 0.12, -1, 1); n.lastChat = tk; n.action = null; } break;
      case 'wave': if (tk >= a.until) n.action = null; break;
      case 'listen':
        if (!this.music[a.musicId] || tk >= a.until) { n.mood = clamp(n.mood + 0.1, -1, 1); n.action = null; }
        break;
      case 'lamp': if (tk >= a.until) { tryAct(this.objects, a.objectId, 'npc', 'release', { who: npcWho(n.id) }); n.action = null; } break;
      case 'sit':
        if (tk >= a.until) this._end(n);
        else if ((tk - a.since) % 40 === 39) this._seatChat(n);
        break;
      default: break;
    }
  }

  // two NPCs sharing a bench chat in place
  _seatChat(n) {
    const o = n.seat ? this.objects.world.get(n.seat.objectId) : null;
    const info = o && seatInfo(o);
    if (!info) return;
    const others = info.users.filter((u) => u !== npcWho(n.id) && u.startsWith('npc:'));
    if (!others.length || (this.tick - n.lastChat) * this.cfg.stepDt < 120) return;
    n.lastChat = this.tick;
    n.mood = clamp(n.mood + 0.08, -1, 1);
    this.stats.chats++;
    this._log(n.id, 'chat', { with: others[0].slice(4), where: 'seat' });
  }

  _arrive(n, then) {
    n.fails = 0;
    if (!then) return;
    const tk = this.tick;
    switch (then.kind) {
      case 'endVisit': {
        n.returnVisit=!then.returning;
        if(n.returnVisit)n.visitingLot=then.destination;
        else{delete n.visitingLot;n.completedVisits=(n.completedVisits||0)+1;}
        const pause=n.returnVisit?16+n.traits.sociability*25:65+n.traits.curiosity*35;
        n.nextDrive=tk+this._steps(pause);
        this._idle(n,n.returnVisit?pause:8);
        this._log(n.id,then.returning?'arriveHome':'visitNeighbor',{});
        break;
      }
      case 'idle': this._idle(n, this.rng.range(then.lo, then.hi)); break;
      case 'arriveHome': this._log(n.id, 'arriveHome', {}); break;
      case 'sit': {
        this._unreserve(then.objectId, n.id);
        const o = this.objects.world.get(then.objectId), info = o && o.alive ? seatInfo(o) : null;
        const res = info&&(!this.ctx.canUseSeat||this.ctx.canUseSeat(o)) ? tryAct(this.objects, o.id, info.layerId, info.join, { who: npcWho(n.id) }) : { ok: false, code: 'gone' };
        if (!res.ok) { this.stats.seatRefusals++; this._log(n.id, 'seatRefused', { object: then.objectId, code: res.code }); this._idle(n, 2); break; }
        this.stats.seatClaims++;
        n.pos = [r3(o.pos[0]), r3(o.pos[2])];
        if(this.cfg.population==='town')n.heading=Math.PI/2-o.rot*Math.PI/180;
        n.seat = { objectId: o.id, layerId: info.layerId, leave: info.leave };
        n.action = { kind: 'sit', until: tk + this._steps(this.rng.range(40, 140)), since: tk, interruptible: true };
        this._log(n.id, 'sitAndRest', { object: o.id, def: o.defId });
        break;
      }
      case 'chat': {
        const p = this._npc(then.partner);
        if (p && p.action && p.action.kind === 'chatWait' && p.action.partner === n.id && dist(p.pos, n.pos) < 6) this._beginChat(n, p);
        else this._idle(n, 1);
        break;
      }
      case 'listen':
        if (!this.music[then.musicId]) { this._idle(n, 1); break; }
        n.action = { kind: 'listen', musicId: then.musicId, until: tk + this._steps(this.rng.range(40, 120)), interruptible: true };
        this._log(n.id, 'listen', { music: then.musicId });
        break;
      case 'greet': {
        const p = this.players[then.playerId];
        if (!p || Math.hypot(p.x - n.pos[0], p.z - n.pos[1]) > 8) { this._idle(n, 1); break; }
        n.greeted[then.playerId] = tk;
        n.heading = r2(Math.atan2(p.z - n.pos[1], p.x - n.pos[0]));
        n.mood = clamp(n.mood + 0.08, -1, 1);
        n.action = { kind: 'wave', until: tk + this._steps(4), interruptible: false };
        this.stats.greets++;
        this._log(n.id, 'greet', { with: `player:${then.playerId}` });
        break;
      }
      case 'lamp': {
        this._unreserve(then.objectId, n.id);
        const c = tryAct(this.objects, then.objectId, 'npc', 'claim', { who: npcWho(n.id) });
        if (!c.ok) { this._idle(n, 1); break; }
        tryAct(this.objects, then.objectId, 'toggle', 'set', { on: then.on });
        this.stats.lampsUsed++;
        n.action = { kind: 'lamp', objectId: then.objectId, until: tk + this._steps(3), interruptible: false };
        this._log(n.id, 'lamp', { object: then.objectId, on: then.on });
        break;
      }
      default: break;
    }
  }

  // ---- views, snapshot -------------------------------------------------------------------------------
  // What a viewer needs each frame. Positions are metres on the island plane (x, z); y is terrain height.
  positions() {
    return this.npcs.map((n) => ({
      id: n.id, who: npcWho(n.id), name: n.name, x: n.pos[0], z: n.pos[1], y: r2(this.ctx.nav.height(n.pos[0], n.pos[1])),
      heading: n.heading, driving:n.action?.driveStart!==undefined&&n.action.i>=n.action.driveStart&&n.action.i<n.action.driveEnd,
      ...(n.action?.gear&&n.action.i<n.action.driveEnd?{gear:n.action.gear,engineLoad:n.action.engineLoad,braking:!!n.action.braking}:{}),
      destination: n.action?.destination,
      action: n.action ? n.action.kind : 'none', purpose: n.action && n.action.purpose ? n.action.purpose : null,
      asleep: n.sleeping, seat: n.seat ? n.seat.objectId : null, mood: r2(n.mood), moodLabel: MOODS.find((m) => n.mood >= m[0])[1], homeLotId: n.home.lotId,
    }));
  }
  // ops a player replica should receive to see NPC seat and lamp usage: objects.log.slice(since)
  objectOps(since = 0) { return this.objects.log.slice(since); }

  toJSON() {
    return clone({
      v: 1, config: this.cfg, tick: this.tick, acc: this.acc, rng: this.rng.s, npcs: this.npcs, reservations: this.reservations,
      players: this.players, music: this.music, weatherOverride: this.weatherOverride, lastWeather: this.lastWeather,
      log: this.log, logDropped: this.logDropped, inputLog: this.inputLog, pending: this.pending, stats: this.stats,
      objects: this.objects.toJSON(),
    });
  }
}

function normalise(config) {
  const c = { ...DEFAULTS, ...config };
  c.npcCount = clamp(Math.round(c.npcCount), 5, 12);
  return c;
}
