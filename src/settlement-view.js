import * as THREE from 'three';
import {bridgeDecks} from './bridge-decks.js';
import {createRoadSurface} from './road-surface.js';
import {sunlight} from './daylight.js';
import {ResidentCrowd} from './resident-crowd.js';
import {bindResidentWorld} from './resident-world.js';
import {defaultLayout,floorAt} from './street-world.js';
import { contextFromPlan } from '../packages/sim/src/context.js';
import { NoUsableHomesError, Simulation } from '../packages/sim/src/simulation.js';

const roadFill = { main: '#777c80', street: '#8d9092', path: '#c8b08a' };

function trace(ctx, xz, close = false) {
  ctx.beginPath();
  ctx.moveTo(xz[0], xz[1]);
  for (let i = 2; i < xz.length; i += 2) ctx.lineTo(xz[i], xz[i + 1]);
  if (close) ctx.closePath();
}

// The map is painted once per island. Roads and lots share the destination
// canvas transform so no island-sized intermediate bitmap is needed.
function paintMapRoads(ctx,roads) {
  ctx.lineJoin = ctx.lineCap = 'round';
  // Paint all footways before the carriageways so junction mouths stay open.
  for(const layer of ['verge','footway','kerb','carriageway']){
    for(const road of roads){
      if(road.class==='path'&&layer!=='carriageway')continue;
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
    if (road.class !== 'main') continue;
    trace(ctx, road.xz);
    ctx.stroke();
  }

}

export class SettlementView {
  constructor(island) {
    this.island = island;
    const plan = island.plan;
    this.terrainMaterial = createRoadSurface(island);
    this.group = new THREE.Group();
    this.group.add(new THREE.HemisphereLight('#dcebed', '#96947b', 1.12));
    const sun=this.sun=new THREE.DirectionalLight('#fff0d7',2.65);
    sun.position.set(sunlight.x,sunlight.y,sunlight.z);
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
      this.sim = Simulation.create({ seed: island.seed, preset: island.presetId, startHour: 10, population:'town' }, { ctx });
    } catch (err) {
      if (!(err instanceof NoUsableHomesError)) throw err;
    }
    this.current = this.sim?.positions() || [];
    this.previous = this.current;
    this.elapsed = 0;
    this.people = this.current.map(()=>new THREE.Object3D());
    this.crowd=new ResidentCrowd(this.group,this.current,island.seed);
    this.advance(0);
  }
  posePeople(now,camera,pixelHeight){this.crowd.render(this.people,camera,now,this.island,this.street?.openRoof,pixelHeight);}
  async bindStreet(street,useWorker=true){
    if(!this.sim||!this.island.homes.length)return;
    const ctx=this.sim.ctx;bindResidentWorld(ctx,street);
    this.sim=Simulation.create(this.sim.cfg,{ctx});this.current=this.sim.positions();this.previous=this.current;this.elapsed=0;
    this.crowd.dispose();this.people=this.current.map(()=>new THREE.Object3D());
    this.crowd=new ResidentCrowd(this.group,this.current,this.island.seed);this.advance(0);
    this.street=street;if(!useWorker)return;
    this.worker=new Worker(new URL('./resident-worker.js',import.meta.url),{type:'module'});
    this.workerTimes=[];
    await new Promise((resolve,reject)=>{
      this.worker.onerror=e=>{this.workerError=e.message;reject(new Error(e.message));};
      this.worker.onmessage=({data:m})=>{
        if(m.type==='ready'){resolve();return;}
        if(m.type==='error'){this.workerError=m.message;this.workerBusy=false;reject(new Error(m.message));console.error(m.message);return;}
        this.workerBusy=false;this.previous=this.current;this.current=m.positions;this.sim.tick=m.tick;
        this.workerMs=m.ms;this.workerTimes.push(...m.times);if(this.workerTimes.length>240)this.workerTimes.splice(0,this.workerTimes.length-240);
        this.lastWorkerFrame=performance.now();
      };
      const i=this.island,keys=['seed','presetId','size','half','grid','cell','h','water','plan','streetBenches'];
      const packet=Object.fromEntries(keys.map(k=>[k,i[k]]));
      packet.bridgeSpans=this.decks.spans;
      packet.footprintCells=new Map([...i.footprintCells].map(([key,items])=>[key,items.map(b=>Object.fromEntries(['x','y','z','w','d','c','s','height','id'].map(k=>[k,b[k]])))]));
      this.worker.postMessage({type:'init',island:packet,config:this.sim.cfg});
    });
  }
  advance(dt) {
    if (!this.sim) return;
    const step = this.sim.cfg.stepDt;
    this.elapsed += dt;
    if(this.worker){
      if(this.elapsed>=step&&!this.workerBusy&&!this.workerError){
        const count=Math.min(4,Math.floor(this.elapsed/step));this.elapsed-=count*step;this.workerBusy=true;
        const s=this.street.session;
        this.worker.postMessage({type:'step',steps:count,layout:s?.layout||defaultLayout(),actors:[...s?.actors.values()||[]],
          routes:[...s?.activities.routes||[]].map(([id,r])=>[id,{goal:r.goal}])});
      }
    }else while (this.elapsed >= step) {
      this.elapsed -= step;
      this.previous = this.current;
      this.sim.step();
      this.current = this.sim.positions();
    }
    const alpha=this.worker?Math.min(1,(performance.now()-(this.lastWorkerFrame||0))/(step*1000)):this.elapsed/step;
    this.current.forEach((p, i) => {
      const prev = this.previous[i];
      const x = prev.x + (p.x - prev.x) * alpha, z = prev.z + (p.z - prev.z) * alpha;
      const actor = this.people[i];
      actor.position.set(x,(this.street?floorAt(this.island,this.street.plots,x,z,this.street.session?.layout||defaultLayout()):this.decks.heightAt(x,z))+.04,z);
      actor.visible = !p.asleep;
      actor.scale.y = p.seat ? 0.73 : 1;
      actor.userData.driving=!!p.driving;
      actor.userData.destination=p.destination;
      actor.userData.gear=p.gear;actor.userData.engineLoad=p.engineLoad;actor.userData.braking=p.braking;
      if(prev.driving&&p.driving){
        const delta=p.heading-prev.heading;
        actor.userData.heading=Math.PI/2-prev.heading-alpha*Math.atan2(Math.sin(delta),Math.cos(delta));
      }else if(p.seat||p.driving)actor.userData.heading=Math.PI/2-p.heading;
    });
  }
  focus() {
    const p = this.people.find(actor => actor.visible)?.position || this.island.plan.sites[0];
    return p ? new THREE.Vector3(p.x, this.decks.heightAt(p.x,p.z) + 1, p.z) : new THREE.Vector3();
  }
  drawMap(ctx, size) {
    const scale = ctx.canvas.width / size;
    ctx.save();ctx.translate(ctx.canvas.width/2,ctx.canvas.height/2);ctx.scale(scale,scale);
    ctx.lineWidth=.42/scale;ctx.strokeStyle='rgba(93,109,88,.5)';
    for(const plot of this.island.plan.layers.plots){trace(ctx,plot.xz,true);ctx.stroke();}
    paintMapRoads(ctx,this.island.plan.layers.roads);
    ctx.restore();
  }
  dispose() {
    this.worker?.terminate();
    this.crowd.dispose();
    this.group.traverse(obj => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
    this.sun.shadow.dispose();
    this.terrainMaterial.dispose();
  }
}
