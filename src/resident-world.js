import {walkingRoute} from './street-route.js';
import {defaultLayout,walkable,toWorld} from './street-world.js';
import {homeAt,homeWalkable} from './home-plan.js';
import {distSeg} from '../packages/settlement/src/geom.js';
import {bindResidentTraffic} from './resident-traffic.js';
import {carriagewayAt,sidewalkStop} from './street-road-index.js';

function crossesSolid(home,a,b){
  const radius=Math.hypot(home.w,home.d)/2+.8,dx=b[0]-a[0],dz=b[1]-a[1];
  const nearest=distSeg(home.x,home.z,a[0],a[1],b[0],b[1]);
  if(nearest.d>radius)return false;
  const length=Math.hypot(dx,dz),reach=radius/Math.max(.001,length);
  const start=Math.max(0,nearest.t-reach),end=Math.min(1,nearest.t+reach);
  const steps=Math.max(1,Math.ceil((end-start)*length/.14));
  for(let i=0;i<=steps;i++){
    const t=start+(end-start)*i/steps;
    if(homeWalkable(home,{x:a[0]+t*dx,z:a[1]+t*dz})===false)return true;
  }
  return false;
}
export function rerouteResidents(sim,homes){
  if(!sim||!homes.length)return;
  for(const resident of sim.npcs){
    const trip=resident.action;if(trip?.kind!=='move')continue;
    let from=resident.pos;
    for(let i=trip.i;i<trip.pts.length;i++){
      const to=trip.pts[i];
      if(homes.some(home=>crossesSolid(home,from,to))){
        const route=sim.ctx.nav.findPath(resident.pos,trip.pts.at(-1),resident.home.comp);
        if(route){trip.pts=route.pts;trip.i=0;delete trip.driveStart;delete trip.driveEnd;}else sim._end(resident);
        break;
      }
      from=to;
    }
  }
}

// Bind the headless residents to the committed, visible street. Synthetic sim
// props are useful in fixtures, but live residents must use real benches and
// pass through the same doors and collision geometry as a player.
export function bindResidentWorld(ctx,street){
  const island=street.island,nav=ctx.nav,networkRoute=nav.findPath.bind(nav);
  ctx.homeLocations=new Map(island.homes.map(b=>[b.id,b.inside]));
  ctx.placeObjects=host=>{
    for(const b of island.streetBenches.values())for(const x of [-.48,.48]){
      const p=toWorld(b,x,.18);
      host.place('chair',{pos:[p.x,b.y,p.z],rot:Math.round(b.yaw*180/Math.PI)});
    }
  };
  const cache=new Map();let revision=-1;
  const layout=()=>street.session?.layout||defaultLayout();
  ctx.inTrafficLane=pos=>!!carriagewayAt(island,...pos);
  ctx.leisureStop=(target,from)=>sidewalkStop(island,target,from,(x,z)=>{
    const p={x,z};
    return nav.land(x,z)&&!homeAt(island,p)&&walkable(island,street.plots,layout(),p);
  });
  ctx.canUseSeat=o=>{
    const session=street.session;if(!session)return true;
    const p={x:o.pos[0],z:o.pos[2]};
    if([...session.actors.values()].some(a=>Math.hypot(a.x-p.x,a.z-p.z)<.7))return false;
    return ![...session.activities.routes.values()].some(r=>Math.hypot(r.goal.x-p.x,r.goal.z-p.z)<.7);
  };
  nav.findPath=(from,to,comp)=>{
    const state=layout(),start={x:from[0],z:from[1]},end={x:to[0],z:to[1]};
    if(!walkable(island,street.plots,state,end))return null;
    if(revision!==state.revision){cache.clear();revision=state.revision;}
    const first=homeAt(island,start),last=homeAt(island,end);
    const begin=first?(first.approach||first.entry):start,finish=last?(last.approach||last.entry):end;
    const base=networkRoute([begin.x,begin.z],[finish.x,finish.z],comp);if(!base)return null;
    const goals=[...(first?[first.inside,first.entry,begin]:[]),...base.pts.map(([x,z])=>({x,z})),...(last?[last.entry,last.inside,end]:[])];
    const pts=[];let at=start,len=0;
    for(const goal of goals){
      if(Math.hypot(goal.x-at.x,goal.z-at.z)<.02)continue;
      const key=[at.x,at.z,goal.x,goal.z].map(n=>n.toFixed(3)).join(',');
      let leg=cache.get(key);
      if(leg===undefined){leg=walkingRoute(island,street.plots,state,at,goal);if(cache.size>4096)cache.clear();cache.set(key,leg);}
      if(!leg)return null;
      for(const p of leg){len+=Math.hypot(p.x-at.x,p.z-at.z);pts.push([p.x,p.z]);at=p;}
    }
    return {pts:pts.length?pts:[to.slice()],len};
  };
  bindResidentTraffic(ctx,street);
}
