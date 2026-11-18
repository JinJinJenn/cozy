import {planResidentVisits} from './resident-car-routes.js';

// A household borrows the town car at the kerb and returns it at the other
// end of the visit. Both door-to-kerb legs use the ordinary pedestrian router.
export function bindResidentTraffic(ctx,street){
  const visits=planResidentVisits(ctx.plan,street.island.homes,ctx.seed);
  ctx.carTrip=(n,returning)=>{
    const circle=visits.get(n.home.lotId);
    if(!circle)return null;
    const next=circle[(n.completedVisits||0)%circle.length];
    const visit=returning?(circle.find(v=>v.dest.id===n.visitingLot)||next):next;
    const route=returning?visit.inbound:visit.outbound;
    const home=returning?visit.source:visit.dest,door=home.inside;
    const approach=ctx.nav.findPath(n.pos,route.curb,n.home.comp);
    const walkIn=ctx.nav.findPath(route.points.at(-1),[door.x,door.z],n.home.comp);
    if(!approach||!walkIn)return null;
    const driveStart=approach.pts.length+1,driveEnd=driveStart+route.points.length-1;
    return {pts:[...approach.pts,...route.points,...walkIn.pts],driveStart,driveEnd,curbPickup:true,
      destination:home.id,junctions:route.junctions};
  };
  ctx.hasCarVisit=id=>visits.has(id);

  // Build the small-area occupancy lookup on the first driving query per tick.
  // Mutable resident positions remain visible to later drivers within the tick.
  let indexedTick=-1,indexedSim;const cells=new Map(),crossingOwners=new Map();
  ctx.trafficClear=(sim,n,x,z,dx,dz,distance,claim=true)=>{
    if(indexedTick!==sim.tick||indexedSim!==sim){
      indexedTick=sim.tick;indexedSim=sim;cells.clear();crossingOwners.clear();
      const add=(p,px,pz)=>{
        const key=Math.floor(px/8)+','+Math.floor(pz/8);
        if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);
      };
      for(const other of sim.npcs){
        if(!other.sleeping)add(other,other.pos[0],other.pos[1]);
        const a=other.action;
        if(!a?.crossings||a.i<a.driveStart||a.i>=a.driveEnd)continue;
        a.crossings=a.crossings.filter(g=>Math.hypot(other.pos[0]-g.x,other.pos[1]-g.z)<6);
        for(const g of a.crossings)crossingOwners.set(g.id,other);
      }
      for(const a of street.session?.actors.values()||[])add(a,a.x,a.z);
    }
    // The lookup was built at the start of this tick. Include the cells a
    // resident could have left before this driver's turn.
    const range=distance+4+Math.max(3,9*sim.cfg.stepDt);
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
    const action=n.action;
    if(action?.junctions?.length&&action.i>=action.driveStart-1&&action.i<action.driveEnd){
      const entering=action.junctions.filter(g=>Math.hypot(x+dx*distance-g.x,z+dz*distance-g.z)<6);
      if(entering.some(g=>crossingOwners.has(g.id)&&crossingOwners.get(g.id)!==n))return false;
      if(!claim)return true;
      for(const g of entering){
        if(crossingOwners.has(g.id))continue;
        crossingOwners.set(g.id,n);
        (action.crossings||=[]).push(g);
      }
    }
    return true;
  };
}
