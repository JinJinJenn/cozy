import * as THREE from 'three';
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

// One cropped world-space decal follows the actual terrain triangles at every LOD.
// Use the same drawing in the minimap. Keep a transparent margin for texture clamping.
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
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false;
  return { canvas, bounds, extent, map };
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
    const { map, bounds, extent } = this.decal;
    map.anisotropy = Math.min(8, capabilities.getMaxAnisotropy());
    this.terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, fog: true });
    this.terrainMaterial.onBeforeCompile = shader => {
      shader.uniforms.townMap = { value: map };
      shader.uniforms.townRect = { value: new THREE.Vector4(bounds.min.x, bounds.min.y, extent.x, extent.y) };
      shader.vertexShader = 'varying vec2 townUV; uniform vec4 townRect;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\ntownUV = (position.xz - townRect.xy) / townRect.zw;');
      shader.fragmentShader = 'varying vec2 townUV; uniform sampler2D townMap;\n' + shader.fragmentShader.replace(
        '#include <color_fragment>', `#include <color_fragment>
        vec4 street = texture2D(townMap, townUV);
        float light = 0.80 + 0.35 * dot(diffuseColor.rgb, vec3(0.21, 0.72, 0.07));
        diffuseColor.rgb = mix(diffuseColor.rgb, street.rgb * light, street.a);`);
    };
    this.group = new THREE.Group();
    this.group.add(new THREE.HemisphereLight('#ffeedc', '#b5adb2', 1.52));
    const sun=this.sun=new THREE.DirectionalLight('#fff0ce',2.45);
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
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.64, 4, 10), new THREE.MeshLambertMaterial({ color: coats[i % coats.length] }));
      body.position.y = 0.71;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8), new THREE.MeshLambertMaterial({ color: ['#e1ac89','#b67856','#f1c5a3','#965e46'][i % 4] }));
      head.position.y = 1.51;
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.277, 12, 6, 0, Math.PI * 2, 0, 1.24),
        new THREE.MeshLambertMaterial({ color: ['#654237','#453a40','#ab7045','#543f35'][i % 4] }));
      hair.position.copy(head.position);
      hair.rotation.z = -0.18;
      person.add(body, head, hair);
      this.group.add(person);
      return person;
    });
    this.advance(0);
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
    this.group.traverse(obj => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
    this.sun.shadow.dispose();
    this.terrainMaterial.dispose();
    this.decal.map.dispose();
  }
}
