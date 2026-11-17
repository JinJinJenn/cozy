import {gardenSeats,moveWalker,toWorld,within} from './street-world.js';
import {walkingRoute} from './street-route.js';

export const neighborName=id=>id==='resident1'?'Bea':'Robin';

export class StreetActivities {
  constructor(session){this.s=session;this.routes=new Map();this.reserved=new Set();}
  go(actor,goal,arrival='walk'){
    const {island,plots,layout}=this.s;
    const points=walkingRoute(island,plots,layout,actor,goal);
    if(!points)return false;
    this.routes.set(actor.id,{points,index:0,goal,arrival,revision:layout.revision});
    actor.walking=true;actor.goal=[goal.x,goal.z];actor.activity='';actor.part='';
    return true;
  }
  cancelRoute(actor){this.routes.delete(actor.id);actor.walking=false;delete actor.goal;}
  finish(actor){
    this.cancelRoute(actor);
    const neighbor=this.s.actors.get(actor.friend);
    if(neighbor?.invitedBy===actor.id){
      this.cancelRoute(neighbor);delete neighbor.invitedBy;delete neighbor.atBeach;
      neighbor.activity='';neighbor.cup=false;
      const patrol=this.s.patrol;
      if(patrol?.length){
        let best=0;
        for(let i=1;i<patrol.length;i++)if(Math.hypot(neighbor.x-patrol[i].x,neighbor.z-patrol[i].z)<
          Math.hypot(neighbor.x-patrol[best].x,neighbor.z-patrol[best].z))best=i;
        neighbor.way=(best+patrol.length-1)%patrol.length;
        this.go(neighbor,patrol[best],'patrol');
      }
    }
    if(actor.friend){if(this.benchOwner===actor.id){this.reserved.clear();this.benchOwner=null;}actor.activity='';}
    actor.outing='';actor.cup=false;delete actor.friend;delete actor.brewUntil;delete actor.counterSlot;delete actor.visits;delete actor.atBeach;delete actor.meetingTable;
  }
  seatTaken(q,except){
    return [...this.s.actors.values()].some(a=>a.id!==except&&within(a,q,.66));
  }
  seat(i,owner){
    if(owner?.meetingTable)return this.s.furnitureAt(owner.meetingTable,i)?.spot;
    const [x,z]=gardenSeats[i];return toWorld(this.s.garden,x,z);
  }
  tableBooked(lot){return [...this.s.actors.values()].some(a=>a.meetingTable===lot);}
  freeTable(actor,requested){
    return this.s.terraceLots().find(b=>(!requested||requested===b.id)&&[0,1].every(i=>this.s.available(actor,b,this.s.furnitureAt(b.id,i).spot)));
  }
  stationClaimed(lot,index,except){
    for(const [id,route] of this.routes)if(id!==except&&route.arrival?.lot===lot&&route.arrival.index===index)return true;
    return false;
  }
  start(actor,friend){
    if(actor.outing)return;
    const neighbor=[...this.s.actors.values()].find(a=>a.id.startsWith('resident')&&!a.invitedBy&&(!friend||friend===a.id));
    if(!neighbor){actor.feedback='That neighbor is busy right now.';return;}
    const pavilionBusy=this.reserved.size||[0,1].some(i=>this.seatTaken(this.seat(i),actor.id)||this.stationClaimed(this.s.garden.id,i,actor.id));
    const patio=pavilionBusy&&this.freeTable(actor);
    if(pavilionBusy&&!patio){actor.feedback='The pavilion and terrace are busy.';return;}
    const slot=[0,1.4,-1.4].find(x=>{
      const p=toWorld(this.s.cafe,x,-2.15);
      return ![...this.s.actors.values()].some(a=>a.id!==actor.id&&(a.counterSlot===x||within(a,p,.64)));
    });
    if(slot===undefined){actor.feedback='The counter is busy. Try again when someone collects their drinks.';return;}
    const counter=toWorld(this.s.cafe,slot,-2.15);
    if(!this.go(actor,counter,'counter')){actor.feedback='Couldn’t reach the café counter.';return;}
    if(patio)actor.meetingTable=patio.id;
    if(!this.go(neighbor,this.seat(1,actor),'neighbor')){
      delete actor.meetingTable;this.cancelRoute(actor);actor.feedback='The path to the seats is blocked.';return;
    }
    actor.friend=neighbor.id;neighbor.invitedBy=actor.id;actor.outing='counter';actor.counterSlot=slot;
    if(!patio){this.benchOwner=actor.id;this.reserved.add(0);this.reserved.add(1);}
  }
  command(actor,cmd){
    actor.feedback='';
    if(cmd.type==='cancel'){this.finish(actor);return;}
    if(cmd.type==='terrace-coffee'&&actor.outing==='carry'){
      const b=this.freeTable(actor,cmd.lot),friend=this.s.actors.get(actor.friend);
      if(!b||!friend){actor.feedback='There is no free terrace table for two.';return;}
      actor.meetingTable=b.id;
      if(!this.go(actor,this.seat(0,actor),'share')||!this.go(friend,this.seat(1,actor),'neighbor')){
        this.finish(actor);actor.feedback='The route to the terrace is blocked.';return;
      }
      if(this.benchOwner===actor.id){this.reserved.clear();this.benchOwner=null;}
      actor.outing='terrace';return;
    }
    if(cmd.type==='coffee'){
      if(!actor.outing){this.start(actor,cmd.friend);return;}
      if(actor.outing==='chat'||actor.outing==='bay'){this.finish(actor);return;}
      if(actor.outing==='carry'){
        if(this.go(actor,this.seat(0,actor),'share'))actor.outing=actor.meetingTable?'terrace':'garden';
        else actor.feedback='There is no clear route to your seat.';
      }
      return;
    }
    if(cmd.type==='beach'&&actor.outing==='chat'){
      const friend=this.s.actors.get(actor.friend),gym=this.s.plots.find(b=>b.kind==='gym');
      if(!friend||!gym)return;
      // Both walkers follow the marked lane to the last dry strip that fits the pair.
      let spots=null;
      for(let step=12;step<54;step++){
        const side=-gym.w/2-1.20-Math.max(0,step-16)*.23;
        const pair=[-.58,.58].map(k=>toWorld(gym,side+k,gym.d/2+4.7-step*.68));
        if(pair.some(q=>this.s.island.sample(q.x,q.z)<.8))break;
        spots=pair;
      }
      if(spots&&this.go(actor,spots[0],'shore')&&this.go(friend,spots[1],'shore')){
        actor.outing='beach';actor.cup=false;friend.cup=false;delete actor.meetingTable;
        if(this.benchOwner===actor.id){this.reserved.clear();this.benchOwner=null;}
      }else{this.finish(actor);actor.feedback='The beach path is blocked.';}
      return;
    }
    if(cmd.type==='furniture'){
      const target=this.s.furnitureAt(cmd.lot,cmd.index);
      if(!target)return;
      const {b,spot}=target;
      if(!this.s.available(actor,b,spot)){actor.feedback='Someone else is using that spot.';return;}
      if(actor.outing)this.finish(actor);
      if(!this.go(actor,spot,{lot:b.id,index:spot.index}))actor.feedback='There is no clear route to that spot.';
      return;
    }
    if(cmd.type==='walk'){
      if(actor.outing&&actor.outing!=='carry')this.finish(actor);
      if(!this.go(actor,{x:cmd.x,z:cmd.z}))actor.feedback='There’s no clear walking route to that spot.';
    }
  }
  manual(actor){
    if(actor.outing==='garden'){actor.outing='carry';this.cancelRoute(actor);}
    else if(actor.outing&&actor.outing!=='carry')this.finish(actor);
    else this.cancelRoute(actor);
  }
  arrive(a,arrival){
    const s=this.s;
    if(typeof arrival==='object'){
      const target=s.furnitureAt(arrival.lot,arrival.index);
      if(target&&s.available(a,target.b,target.spot)){
        const {b,spot}=target;Object.assign(a,{x:spot.x,z:spot.z,yaw:b.yaw+(b.kind==='terrace'&&spot.index===0?0:Math.PI),activity:spot.action,part:spot.part});
      }else a.feedback='Someone else is using that spot.';
      return;
    }
    if(arrival==='counter'){a.outing='brewing';a.brewUntil=s.time+1.25;a.yaw=s.cafe.yaw+Math.PI;}
    if(arrival==='neighbor'||arrival==='share'){
      const i=arrival==='neighbor'?1:0;
      const owner=arrival==='neighbor'?s.actors.get(a.invitedBy):a;
      if(!owner)return;
      const seat=this.seat(i,owner);
      if(this.seatTaken(seat,a.id)){
        this.finish(owner);owner.feedback='Someone is at the bench. The coffee visit ended.';return;
      }
      const yaw=owner.meetingTable?s.furnitureAt(owner.meetingTable,i).b.yaw+(i===0?0:Math.PI):s.garden.yaw+Math.PI+(i===1?.45:-.45);
      Object.assign(a,{x:seat.x,z:seat.z,yaw,activity:'sit'});
      if(arrival==='share')a.outing='waiting';
      const friend=s.actors.get(owner.friend);
      if(owner.outing==='waiting'&&friend?.activity==='sit'){
        owner.outing='chat';owner.cup=true;friend.cup=true;
        owner.visits=s.rememberCoffee?.(friend.id)??1;
      }
    }
    if(arrival==='shore'){
      a.atBeach=true;
      const host=a.invitedBy?s.actors.get(a.invitedBy):a,friend=host&&s.actors.get(host.friend);
      const gym=s.plots.find(b=>b.kind==='gym');a.yaw=gym.yaw+Math.PI;
      if(host?.atBeach&&friend?.atBeach)host.outing='bay';
    }
  }
  advance(a,dt){
    if(a.outing==='brewing'&&this.s.time>=a.brewUntil){a.outing='carry';a.cup=true;delete a.brewUntil;delete a.counterSlot;}
    const route=this.routes.get(a.id);
    if(!route)return !!a.invitedBy;
    const s=this.s;
    if(route.revision!==s.layout.revision){
      if(!this.go(a,route.goal,route.arrival)){
        this.cancelRoute(a);const owner=a.invitedBy?s.actors.get(a.invitedBy):a;
        if(owner){this.finish(owner);owner.feedback='The renovation closed the route.';}
      }
      return true;
    }
    let remaining=dt;
    while(remaining>.00001&&route.index<route.points.length){
      const q=route.points[route.index],dx=q.x-a.x,dz=q.z-a.z,d=Math.hypot(dx,dz);
      if(d<.075){route.index++;continue;}
      const speed=route.arrival==='patrol'?1.376:2.85,step=Math.min(remaining,d/speed),before={x:a.x,z:a.z};
      moveWalker(s.island,s.plots,s.layout,a,{x:dx/d*speed/4.3,z:dz/d*speed/4.3},step);
      remaining-=step;
      if(Math.hypot(a.x-before.x,a.z-before.z)<.0001){
        if(step<.001)return true;
        if((route.retries??0)<2&&this.go(a,route.goal,route.arrival)){
          this.routes.get(a.id).retries=(route.retries??0)+1;return true;
        }
        const owner=a.invitedBy?s.actors.get(a.invitedBy):a;
        this.cancelRoute(a);if(owner){this.finish(owner);owner.feedback='The walking route is blocked.';}return true;
      }
    }
    if(route.index===route.points.length){this.cancelRoute(a);this.arrive(a,route.arrival);}
    return true;
  }
}
