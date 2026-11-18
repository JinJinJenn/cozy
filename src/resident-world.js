import {walkingRoute} from './street-route.js';
import {defaultLayout,walkable,toWorld} from './street-world.js';
import {homeAt} from './home-plan.js';

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
}
