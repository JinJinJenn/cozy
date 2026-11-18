import {hashFloat} from '../packages/sim/src/rng.js';

// A household borrows the town car at the kerb and returns it at the other
// end of the visit. Both door-to-kerb legs use the ordinary pedestrian router.
export function bindResidentTraffic(ctx,street){
  const roads=[];
  for(const road of ctx.plan.roads){
    if(road.class==='path'||road.width<4||road.bridge)continue;
    const segments=[];let length=0;
    for(let i=1;i<road.pts.length;i++){
      const [x,z]=road.pts[i-1],[bx,bz]=road.pts[i],len=Math.hypot(bx-x,bz-z);
      if(!len)continue;
      segments.push({x,z,dx:(bx-x)/len,dz:(bz-z)/len,len,start:length});length+=len;
    }
    if(length>42)roads.push({segments,length,lane:Math.min(1.55,road.width*.24),homes:[]});
  }
  const visits=new Map();
  for(const home of street.island.homes){
    const p=home.approach||home.entry;let best,dist=22;
    for(const road of roads)for(const seg of road.segments){
      const t=Math.max(0,Math.min(seg.len,(p.x-seg.x)*seg.dx+(p.z-seg.z)*seg.dz));
      const d=Math.hypot(seg.x+t*seg.dx-p.x,seg.z+t*seg.dz-p.z);
      if(d<dist){dist=d;best={home,road,at:seg.start+t};}
    }
    if(best)best.road.homes.push(best);
  }
  for(const road of roads){
    const homes=road.homes.sort((a,b)=>hashFloat(ctx.seed,a.home.id)-hashFloat(ctx.seed,b.home.id));
    for(const source of homes.slice(0,Math.ceil(homes.length/9))){
      const dest=homes.find(other=>Math.abs(source.at-other.at)>42&&Math.abs(source.at-other.at)<230);
      if(dest)visits.set(source.home.id,{source,dest});
    }
  }
  ctx.carTrip=(n,returning)=>{
    const pair=visits.get(n.home.lotId);if(!pair)return null;
    const from=returning?pair.dest:pair.source,to=returning?pair.source:pair.dest;
    const {road}=from,sign=Math.sign(to.at-from.at);
    const laneAt=at=>{
      const seg=road.segments.find(s=>at<=s.start+s.len)||road.segments.at(-1);
      const t=at-seg.start;
      return [seg.x+t*seg.dx-sign*seg.dz*road.lane,seg.z+t*seg.dz+sign*seg.dx*road.lane];
    };
    const departure=laneAt(from.at),arrival=laneAt(to.at);
    const approach=ctx.nav.findPath(n.pos,departure,n.home.comp);
    const door=to.home.inside,walkIn=ctx.nav.findPath(arrival,[door.x,door.z],n.home.comp);
    if(!approach||!walkIn)return null;
    const pts=approach.pts.slice(),driveStart=pts.length;
    const stops=road.segments.map(s=>s.start).filter(t=>(t-from.at)*sign>1&&(to.at-t)*sign>1);
    if(sign<0)stops.reverse();
    for(const at of stops)pts.push(laneAt(at));
    pts.push(arrival);
    const driveEnd=pts.length;pts.push(...walkIn.pts);
    return {pts,driveStart,driveEnd};
  };
  ctx.hasCarVisit=id=>visits.has(id);

  // Build the small-area occupancy lookup on the first driving query per tick.
  // Mutable resident positions remain visible to later drivers within the tick.
  let indexedTick=-1,indexedSim;const cells=new Map();
  ctx.trafficClear=(sim,n,x,z,dx,dz,distance)=>{
    if(indexedTick!==sim.tick||indexedSim!==sim){
      indexedTick=sim.tick;indexedSim=sim;cells.clear();
      const add=(p,px,pz)=>{
        const key=Math.floor(px/8)+','+Math.floor(pz/8);
        if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);
      };
      for(const other of sim.npcs)if(!other.sleeping)add(other,other.pos[0],other.pos[1]);
      for(const a of street.session?.actors.values()||[])add(a,a.x,a.z);
    }
    const range=distance+4;
    for(let ix=Math.floor((x-range)/8);ix<=Math.floor((x+range)/8);ix++){
      for(let iz=Math.floor((z-range)/8);iz<=Math.floor((z+range)/8);iz++){
        for(const p of cells.get(ix+','+iz)||[]){
          if(p===n)continue;
          const rx=(p.pos?p.pos[0]:p.x)-x,rz=(p.pos?p.pos[1]:p.z)-z,along=rx*dx+rz*dz;
          const a=p.action,car=p.vehicle==='car'||(a?.driveStart!==undefined&&a.i>=a.driveStart&&a.i<a.driveEnd);
          if(along>-.1&&along<distance+(car?3.35:1.85)&&Math.abs(rx*dz-rz*dx)<(car?1.68:1.05))return false;
        }
      }
    }
    return true;
  };
}
