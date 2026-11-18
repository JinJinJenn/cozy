import {gardenSeats,moveWalker,toWorld,within} from './street-world.js';
import {walkingRoute} from './street-route.js';
import {homeAt,homeWalkableLocal} from './home-plan.js';
import {homeAction,entrySwitchPosition,lamps,paintingStage,setFixtureValue,setPaintingStage,switchEntryLights,tuneTelevision} from './home-fixtures.js';
import {finishHomeMeal} from './home-meals.js';
import {leaveBoard,sitAtBoard} from './table-game.js';
import {finishFlowers,flowerBox} from './roadside-flowers.js';

export const neighborName=id=>id==='resident1'?'Bea':'Robin';

export class StreetActivities {
  constructor(session){this.s=session;this.routes=new Map();this.reserved=new Set();}
  go(actor,goal,arrival='walk'){
    this.leaveFurniture(actor);
    const {island,plots,layout}=this.s;
    let points;
    if(Math.hypot(goal.x-actor.x,goal.z-actor.z)>65){
      const trip=this.s.town?.sim?.ctx.nav.findPath([actor.x,actor.z],[goal.x,goal.z]);
      if(trip){
        points=[];let start=actor;
        for(const [x,z] of trip.pts){
          const end={x,z},leg=walkingRoute(island,plots,layout,start,end);
          if(!leg){points=null;break;}
          points.push(...leg);start=end;
        }
      }
    }
    if(!points){
      const fromHome=homeAt(island,actor),toHome=homeAt(island,goal);
      const doors=fromHome!==toHome?[fromHome?.entry,toHome?.entry].filter(Boolean):undefined;
      points=walkingRoute(island,plots,layout,actor,goal,doors);
    }
    if(!points)return false;
    this.routes.set(actor.id,{points,index:0,goal,arrival,revision:layout.revision});
    actor.walking=true;actor.goal=[goal.x,goal.z];actor.activity='';actor.part='';
    return true;
  }
  cancelRoute(actor){this.routes.delete(actor.id);actor.walking=false;delete actor.goal;}
  fixtureApproaches(home,spot){
    const flower=spot.object==='flower-box',target=flower?flowerBox:entrySwitchPosition(home),points=[{x:spot.x,z:spot.z}];
    for(const [dx,dz] of flower?[[.83,.60],[-.79,.65],[.87,-.55]]:[[.1,-.75],[-.52,-.48],[.62,-.64]]){
      const local={x:target.x+dx,z:target.z+dz};
      if(flower||homeWalkableLocal(home,local)===true)points.push(toWorld(home,local.x,local.z));
    }
    return points;
  }
  walkToFixture(actor,home,spot){
    for(const p of this.fixtureApproaches(home,spot)){
      const pose={...p,yaw:Math.atan2(spot.target.x-p.x,spot.target.z-p.z)};
      if(!this.s.available(actor,home,{...spot,...pose}))continue;
      if(actor.outing)this.finish(actor);
      if(this.go(actor,pose,{lot:home.id,index:spot.index,fixturePose:pose}))return;
    }
    actor.feedback=spot.object==='flower-box'?'The flower box is busy. Try another box.':'The entry switch is busy. Try again when there is room.';
  }
  leaveFurniture(actor){
    if(!actor.using)return;
    if(actor.activity==='tablegame')leaveBoard(this.s,actor);
    Object.assign(actor,{x:actor.using.exit.x,z:actor.using.exit.z,activity:'',part:''});
    delete actor.using;delete actor.useUntil;
  }
  finish(actor){
    this.leaveFurniture(actor);
    this.cancelRoute(actor);
    if(actor.dinnerSeat!==undefined){
      actor.activity='';delete actor.dinnerSeat;delete actor.dish;delete actor.orderTime;
    }
    this.releaseNeighbor(actor);
    if(actor.friend){if(this.benchOwner===actor.id){this.reserved.clear();this.benchOwner=null;}actor.activity='';}
    actor.outing='';actor.cup=false;delete actor.friend;delete actor.brewUntil;delete actor.counterSlot;delete actor.visits;delete actor.atBeach;delete actor.meetingTable;delete actor.homeVisit;
  }
  releaseNeighbor(actor){
    const neighbor=this.s.actors.get(actor.friend);
    if(neighbor?.invitedBy===actor.id){
      this.cancelRoute(neighbor);delete neighbor.invitedBy;delete neighbor.atBeach;delete neighbor.tray;delete neighbor.cookUntil;
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
    if(lot==='l104'&&[...this.s.actors.values()].some(a=>a.id!==except&&a.dinnerSeat===index))return true;
    for(const [id,route] of this.routes)if(id!==except&&route.arrival?.lot===lot&&route.arrival.index===index)return true;
    return false;
  }
  bookDinner(actor,index){
    if(actor.outing)return;
    const room=this.s.plots.find(b=>b.kind==='restaurant');
    if(!room)return;
    const seats=index===undefined?[0,2,1,3]:[index];
    for(const i of seats){
      const spot=this.s.furnitureAt(room.id,i)?.spot;
      if(spot&&this.s.available(actor,room,spot)&&this.go(actor,spot,{lot:room.id,index:i})){
        actor.dinnerSeat=i;actor.outing='to-dinner';return;
      }
    }
    actor.feedback='There is no free seat you can reach.';
  }
  startOrder(actor){
    const people=[...this.s.actors.values()];
    if(people.some(a=>a.outing==='preparing')||people.some(a=>a.outing==='ordered'&&a.orderTime<actor.orderTime))return;
    const cook=people.find(a=>a.id.startsWith('resident')&&!a.invitedBy);
    if(!cook)return;
    const room=this.s.plots.find(b=>b.kind==='restaurant');
    if(!this.go(cook,toWorld(room,0,-1.96),'stove')){
      actor.outing='menu';actor.feedback='The cook cannot reach the stove.';return;
    }
    actor.friend=cook.id;cook.invitedBy=actor.id;actor.outing='preparing';
  }
  visitBluebell(actor){
    if(actor.outing)return;
    const home=this.s.plots.find(b=>b.kind==='house'),bea=this.s.actors.get('resident1');
    if(!home||!bea||bea.invitedBy||this.tableBooked(home.id)||
      ![0,1].every(i=>this.s.available(i?bea:actor,home,this.s.furnitureAt(home.id,i).spot))){
      actor.feedback='Bea or her table is busy.';return;
    }
    const guestSeat=this.s.furnitureAt(home.id,0).spot;
    if(!this.go(actor,guestSeat,'share')){actor.feedback='The path to Bluebell is blocked.';return;}
    if(!this.go(bea,toWorld(home,.2,-2.18),'kettle')){
      this.cancelRoute(actor);actor.feedback='Bea cannot reach her kitchen.';return;
    }
    actor.friend=bea.id;actor.meetingTable=home.id;actor.homeVisit=true;actor.outing='visiting';
    bea.invitedBy=actor.id;
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
    if(cmd.type==='book-dinner'){this.bookDinner(actor);return;}
    if(cmd.type==='order-meal'){
      if(actor.outing==='menu'&&['chowder','fish'].includes(cmd.dish)){
        actor.dish=cmd.dish;actor.orderTime=this.s.time;actor.outing='ordered';
      }
      return;
    }
    if(cmd.type==='visit-bluebell'){this.visitBluebell(actor);return;}
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
    if(cmd.type==='coffee'&&!actor.homeVisit){
      if(!actor.outing){this.start(actor,cmd.friend);return;}
      if(actor.outing==='chat'||actor.outing==='bay'){this.finish(actor);return;}
      if(actor.outing==='carry'){
        if(this.go(actor,this.seat(0,actor),'share'))actor.outing=actor.meetingTable?'terrace':'garden';
        else actor.feedback='There is no clear route to your seat.';
      }
      return;
    }
    if(cmd.type==='beach'&&actor.outing==='chat'&&!actor.homeVisit){
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
      const {b}=target;
      let spot=homeAction(this.s,b.id,target.spot,actor);
      if(!spot){actor.feedback='That serving is no longer available.';return;}
      if(spot.object==='entry-switch'||spot.object==='flower-box')return this.walkToFixture(actor,b,spot);
      if(spot.action==='tablegame'&&actor.bowlFrom){actor.feedback='Finish or return your soup before playing.';return;}
      if(['watch','tablegame'].includes(spot.action)&&!spot.alternate&&!this.s.available(actor,b,spot)){
        const other=b.uses.findIndex(u=>u.action===spot.action&&u.alternate);
        spot=this.s.furnitureAt(b.id,other)?.spot||spot;
      }
      if(!this.s.available(actor,b,spot)){actor.feedback='Someone else is using that spot.';return;}
      if(actor.outing)this.finish(actor);
      if(b.kind==='restaurant'){this.bookDinner(actor,spot.index);return;}
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
    if(arrival==='stove'){a.cookUntil=s.time+2.5;return;}
    if(arrival==='serve'){
      const diner=s.actors.get(a.invitedBy);
      if(diner?.outing==='preparing'){
        diner.outing='eating';this.releaseNeighbor(diner);delete diner.friend;
      }
      return;
    }
    if(arrival==='kettle'){
      const guest=s.actors.get(a.invitedBy);
      if(!guest?.homeVisit)return;
      a.cup=true;
      if(!this.go(a,this.seat(1,guest),'neighbor')){this.finish(guest);guest.feedback='The path from the kitchen is blocked.';}
      return;
    }
    if(typeof arrival==='object'){
      const target=s.furnitureAt(arrival.lot,arrival.index);
      let spot=target&&homeAction(s,target.b.id,target.spot,a);
      if(spot&&arrival.fixturePose)spot={...spot,...arrival.fixturePose};
      if(target&&!spot){a.feedback='That serving is no longer available.';return;}
      if(spot&&s.available(a,target.b,spot)){
        Object.assign(a,{x:spot.x,z:spot.z,yaw:spot.yaw,activity:spot.action,part:spot.part});
        if(spot.action==='watch'){
          if(!s.layout.homeTV?.[target.b.id])tuneTelevision(s,target.b.id,1);
          a.feedback='';
        }
        if(spot.action==='eat')a.feedback='Eating vegetable soup.';
        if(spot.action==='serveSoup'||spot.action==='returnSoup'){
          if(spot.action==='serveSoup'){
            a.bowlFrom=target.b.id;a.feedback='Take your bowl to a chair or the sofa.';
          }else{delete a.bowlFrom;a.feedback='Your serving is back in the pot.';}
          a.activity='';return;
        }
        if(spot.object==='entry-switch'){
          a.feedback=switchEntryLights(s,target.b)?'Entry lights on.':'Entry lights off.';
        }else if(spot.lamp){
          const lot=target.b.id,lamp=lamps[spot.lamp],next=(s.layout.homeLights?.[lot]||0)^lamp.bit;
          setFixtureValue(s.layout,'homeLights',lot,next);
          s.persist();
          a.feedback='The '+lamp.name+' is '+(next&lamp.bit?'on.':'off.');
        }
        if(spot.object){
          a.using={lot:target.b.id,object:spot.object,index:spot.index,exit:{x:spot.x,z:spot.z},height:spot.pose?.height||0,scale:spot.pose?.scale||1};
          if(spot.pose)Object.assign(a,{x:spot.pose.x,z:spot.pose.z,yaw:spot.pose.yaw});
          if(spot.action==='tablegame')sitAtBoard(s,a);
          const duration={cook:7,wash:4,shower:8,bathroom:5,eat:7,write:8,stretch:6,switch:.55,paint:2.4,clip:1.7,water:4}[spot.action];
          if(duration)a.useUntil=s.time+duration;
        }
        if(a.dinnerSeat!==undefined)a.outing='menu';
      }else{if(a.dinnerSeat!==undefined)this.finish(a);a.feedback='Someone else is using that spot.';}
      return;
    }
    if(arrival==='counter'){a.outing='brewing';a.brewUntil=s.time+1.25;a.yaw=s.cafe.yaw+Math.PI;}
    if(arrival==='neighbor'||arrival==='share'){
      const i=arrival==='neighbor'?1:0;
      const owner=arrival==='neighbor'?s.actors.get(a.invitedBy):a;
      if(!owner)return;
      const seat=this.seat(i,owner);
      if(this.seatTaken(seat,a.id)){
        this.finish(owner);owner.feedback='Someone is already sitting here.';return;
      }
      const yaw=owner.meetingTable?s.furnitureAt(owner.meetingTable,i).spot.yaw:s.garden.yaw+Math.PI+(i===1?.45:-.45);
      Object.assign(a,{x:seat.x,z:seat.z,yaw,activity:'sit'});
      if(arrival==='share')a.outing='waiting';
      const friend=s.actors.get(owner.friend);
      if(owner.outing==='waiting'&&friend?.activity==='sit'){
        owner.outing='chat';owner.cup=true;friend.cup=true;
        if(!owner.homeVisit)owner.visits=s.rememberCoffee?.(friend.id)??1;
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
    if(a.activity==='paint'&&this.s.time>=a.useUntil){
      const {lot,object}=a.using,stage=Math.min(4,paintingStage(this.s.layout,lot,object)+1);
      setPaintingStage(this.s,lot,object,stage);
      if(stage<4)a.useUntil=this.s.time+2.4;
      else{
        a.activity='admire';delete a.useUntil;
        a.feedback='The painting is finished.';
      }
    }
    if(a.useUntil!==undefined&&this.s.time>=a.useUntil){
      const action=a.activity,result=['clip','water'].includes(action)?finishFlowers(this.s,a):finishHomeMeal(this.s,a);this.leaveFurniture(a);
      if(action!=='switch')a.feedback=result||{wash:'All washed up.',shower:'Feeling refreshed.',bathroom:'All done.',write:'A page for your journal.',stretch:'Feeling limber.'}[action]||'';
    }
    if(a.outing==='ordered')this.startOrder(a);
    if(a.cookUntil!==undefined&&this.s.time>=a.cookUntil){
      const diner=this.s.actors.get(a.invitedBy),room=this.s.plots.find(b=>b.kind==='restaurant');
      delete a.cookUntil;
      if(diner){
        a.tray=diner.dish;
        const aisleX=diner.dinnerSeat%2 ? .67 : -.67;
        if(!this.go(a,toWorld(room,aisleX,-.30),'serve')){
          this.releaseNeighbor(diner);delete diner.friend;diner.outing='menu';diner.feedback='The aisle is blocked.';
        }
      }
    }
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
