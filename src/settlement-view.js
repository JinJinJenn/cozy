import * as THREE from 'three';
import {createRoadSurface} from './road-surface.js';
import {avatar,disposeGroup} from './street-art.js';
import { contextFromPlan } from '../packages/sim/src/context.js';
import { NoUsableHomesError, Simulation } from '../packages/sim/src/simulation.js';

const roadFill = { main: '#777c80', street: '#8d9092', path: '#c8b08a' };
const coats = ['#e46b66', '#428ca4', '#dfaa43', '#7967a4', '#559784', '#c15a81', '#536da1', '#c77b4b'];

function trace(ctx, xz, close = false) {
  ctx.beginPath();
  ctx.moveTo(xz[0], xz[1]);
  for (let i = 2; i < xz.length; i += 2) ctx.lineTo(xz[i], xz[i + 1]);
  if (close) ctx.closePath();
}

// The minimap uses a compact raster of the road plan. The world uses exact road segments.
function paintPlan(plan, maxTextureSize) {
  const { roads, plots } = plan.layers;
  const bounds = new THREE.Box2();
  const point = new THREE.Vector2();
  for (const item of [...roads, ...plots]) {
    for (let i = 0; i < item.xz.length; i += 2) bounds.expandByPoint(point.fromArray(item.xz, i));
  }
  if (bounds.isEmpty()) bounds.expandByPoint(point.set(0, 0));
  bounds.expandByScalar(12);
  const extent = bounds.getSize(new THREE.Vector2());
  const scale = Math.min(4, maxTextureSize / Math.max(extent.x, extent.y));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(extent.x * scale));
  canvas.height = Math.max(1, Math.ceil(extent.y * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / extent.x, canvas.height / extent.y);
  ctx.translate(-bounds.min.x, -bounds.min.y);
  ctx.lineJoin = ctx.lineCap = 'round';
  // Paint all footways before the carriageways so junction mouths stay open.
  for(const layer of ['verge','footway','kerb','carriageway']){
    for(const road of roads){
      if(road.bridge||road.class==='path'&&layer!=='carriageway')continue;
      const extra={verge:3.25,footway:2.85,kerb:.42,carriageway:0}[layer];
      trace(ctx,road.xz);
      ctx.lineWidth=road.width+extra;
      ctx.strokeStyle={verge:'#a69e8a',footway:'#d7c9ad',kerb:'#e5d9c3',carriageway:roadFill[road.class]}[layer];
      ctx.stroke();
    }
  }
  ctx.setLineDash([2.5, 6]);
  ctx.lineCap = 'butt';
  ctx.lineWidth = 0.19;
  ctx.strokeStyle = '#e2d6b8';
  for (const road of roads) {
    if (road.class !== 'main' || road.bridge) continue;
    trace(ctx, road.xz);
    ctx.stroke();
  }
  return { canvas, bounds, extent };
}

function bridgeDecks(island, roads) {
  const verts = [], indices = [], spans = [];
  for (const road of roads.filter(r => r.bridge)) {
    const points = road.pts;
    let peak = -Infinity;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
      for (let j = 0; j <= n; j++) {
        const x = ax + (bx - ax) * j / n, z = az + (bz - az) * j / n;
        peak = Math.max(peak, island.waterAt(x, z));
      }
    }
    const deckY = peak + 0.22, radius = road.width / 2;
    // Keep each cross-section above the water and either bank.
    const rows = [];
    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i];
      const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
      const dx = after[0] - before[0], dz = after[1] - before[1], len = Math.hypot(dx, dz) || 1;
      const y = Math.max(deckY, island.sample(x, z) + 0.09);
      rows.push([x,z,y]);
      verts.push(x - dz / len * radius, y, z + dx / len * radius, x + dz / len * radius, y, z - dx / len * radius);
      const k = verts.length / 3 - 2;
      if (i > 0) {
        indices.push(k - 2, k, k - 1, k - 1, k, k + 1);
        spans.push({ a: rows[i - 1], b: rows[i], radius });
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#b98c62', side: THREE.DoubleSide }));
  function heightAt(x, z) {
    let y = island.sample(x, z);
    for (const { a, b, radius } of spans) {
      const dx = b[0] - a[0], dz = b[1] - a[1], lengthSq = dx * dx + dz * dz;
      if (!lengthSq) continue;
      const t = ((x-a[0])*dx + (z-a[1])*dz) / lengthSq;
      if (t >= 0 && t <= 1 && Math.hypot(x-a[0]-dx*t, z-a[1]-dz*t) <= radius) y = Math.max(y, a[2] + (b[2]-a[2])*t);
    }
    return y;
  }
  return { mesh, heightAt };
}

export class SettlementView {
  constructor(island, capabilities) {
    this.island = island;
    const plan = island.plan;
    this.decal = paintPlan(plan, Math.min(4096, capabilities.maxTextureSize));
    this.terrainMaterial = createRoadSurface(island);
    this.group = new THREE.Group();
    this.group.add(new THREE.HemisphereLight('#dcebed', '#96947b', 1.12));
    const sun=this.sun=new THREE.DirectionalLight('#fff0d7',2.65);
    sun.position.set(46,63,-32);
    sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    Object.assign(sun.shadow.camera,{left:-29,right:29,top:29,bottom:-29,near:1,far:150});
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias=-.00035;sun.shadow.normalBias=.032;sun.shadow.intensity=.68;
    sun.shadow.autoUpdate=false;
    this.group.add(sun,sun.target);
    this.decks = bridgeDecks(island, plan.roads);
    this.group.add(this.decks.mesh);
    const ctx = contextFromPlan({ seed: island.seed, presetId: island.presetId, island }, plan);
    try {
      this.sim = Simulation.create({ seed: island.seed, preset: island.presetId, startHour: 10 }, { ctx });
    } catch (err) {
      if (!(err instanceof NoUsableHomesError)) throw err;
    }
    this.current = this.sim?.positions() || [];
    this.previous = this.current;
    this.elapsed = 0;
    this.people = this.current.map((_, i) => {
      const person = new THREE.Group();
      const skin=['#e1ac89','#b67856','#f1c5a3','#965e46'][i%4];
      const hair=['#654237','#453a40','#ab7045','#543f35'][i%4];
      person.add(avatar(coats[i%coats.length],skin,hair));
      this.group.add(person);
      return person;
    });
    this.advance(0);
  }
  posePeople(now){
    const dt=Math.min(.18,Math.max(0,(now-(this.lastPose??now))/1000));
    this.lastPose=now;
    for(const person of this.people){
      const figure=person.children[0],p=person.position,state=person.userData;
      const dx=p.x-(state.x??p.x),dz=p.z-(state.z??p.z),distance=Math.hypot(dx,dz);
      state.x=p.x;state.z=p.z;
      if(!person.visible)continue;
      const seated=person.scale.y<.9;
      // Existing network frames encode sitting in root scale. The rig bends at
      // the hips and knees while preserving the resident's standing proportions.
      figure.scale.y=1/person.scale.y;
      if(distance>.002&&distance<3){
        const angle=Math.atan2(dx,dz)-figure.rotation.y;
        figure.rotation.y+=Math.atan2(Math.sin(angle),Math.cos(angle))*(1-Math.exp(-dt*15));
      }
      figure.setStride(distance<3?distance:0,dt,seated,false,false);
      figure.setSeated(seated);
    }
  }
  advance(dt) {
    if (!this.sim) return;
    const step = this.sim.cfg.stepDt;
    this.elapsed += dt;
    while (this.elapsed >= step) {
      this.elapsed -= step;
      this.previous = this.current;
      this.sim.step();
      this.current = this.sim.positions();
    }
    this.current.forEach((p, i) => {
      const prev = this.previous[i], alpha = this.elapsed / step;
      const x = prev.x + (p.x - prev.x) * alpha, z = prev.z + (p.z - prev.z) * alpha;
      const actor = this.people[i];
      actor.position.set(x, this.decks.heightAt(x,z) + 0.04, z);
      actor.visible = !p.asleep;
      actor.scale.y = p.seat ? 0.73 : 1;
    });
  }
  focus() {
    const p = this.people.find(actor => actor.visible)?.position || this.island.plan.sites[0];
    return p ? new THREE.Vector3(p.x, this.decks.heightAt(p.x,p.z) + 1, p.z) : new THREE.Vector3();
  }
  drawMap(ctx, size) {
    const { bounds, extent, canvas } = this.decal;
    const scale = ctx.canvas.width / size;
    ctx.save();ctx.translate(ctx.canvas.width/2,ctx.canvas.height/2);ctx.scale(scale,scale);
    ctx.lineWidth=.42/scale;ctx.strokeStyle='rgba(93,109,88,.5)';
    for(const plot of this.island.plan.layers.plots){trace(ctx,plot.xz,true);ctx.stroke();}
    ctx.restore();
    ctx.drawImage(canvas, (bounds.min.x + size / 2) * scale, (bounds.min.y + size / 2) * scale, extent.x * scale, extent.y * scale);
  }
  dispose() {
    for(const person of this.people){this.group.remove(person);disposeGroup(person);}
    this.group.traverse(obj => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
    this.sun.shadow.dispose();
    this.terrainMaterial.dispose();
  }
}
