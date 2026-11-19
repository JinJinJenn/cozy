import {roadsOf,project} from './street-road-index.js';
import {homeAt} from './home-plan.js';
import {frontAt,sideAt,toRoom,toWorld,walkable,walkCell} from './street-world.js';
import {trafficContact} from '../packages/sim/src/traffic-footprint.js';
import {roadContact} from '../packages/sim/src/road-contact.js';
import {stepRoadster} from '../packages/sim/src/roadster.js';

const driveSurface={};
const specifications={
  car:{halfWidth:.86,halfLength:1.55},
  bike:{top:7.5,reverse:1.15,accel:3.4,brake:6,coast:1.5,turn:.93,halfWidth:.28,halfLength:.79}
};
function outdoors(s,p,car){
  const cell=walkCell(s.island,s.plots,Math.floor(p.x/32),Math.floor(p.z/32));
  if(!walkable(s.island,s.plots,s.layout,p,cell,car?Infinity:.95)||homeAt(s.island,p))return false;
  return !cell.venues.some(b=>{const q=toRoom(b,p);return q.x> -b.w/2-.25&&q.x<sideAt(b,s.layout)+.25&&q.z> -b.d/2-.25&&q.z<frontAt(b,s.layout)+.25;});
}
function nearbyPeople(s,actor,x,z){
  const people=[];
  for(const other of s.actors.values())if(other.id!==actor.id&&Math.abs(other.x-x)<9&&Math.abs(other.z-z)<9)people.push(other);
  for(const p of s.town.people)if(p.visible&&Math.abs(p.position.x-x)<9&&Math.abs(p.position.z-z)<9)
    people.push(p.userData?.driving?{x:p.position.x,z:p.position.z,vehicle:'car',yaw:p.userData.heading}:p.position);
  return people;
}
function fits(s,kind,x,z,yaw,people){
  const spec=specifications[kind],sin=Math.sin(yaw),cos=Math.cos(yaw);
  for(const p of people){
    if(trafficContact(kind,sin,cos,0,p.x-x,p.z-z,p.vehicle,p.yaw))return false;
  }
  for(const fore of [-spec.halfLength,0,spec.halfLength]){
    const cx=x+fore*sin,cz=z+fore*cos;
    for(const side of [-spec.halfWidth,spec.halfWidth]){
      const corner={x:cx+side*cos,z:cz-side*sin};
      if(!outdoors(s,corner,kind==='car'))return false;
    }
  }
  return true;
}
function clearActivity(s,a){
  s.activities.finish(a);a.activity='';a.part='';a.feedback='';
  delete a.bowlFrom;delete a.carModel;delete a.vehicle;delete a.speed;delete a.steer;delete a.reverseHold;delete a.brakeHeld;
  delete a.gear;delete a.shiftLeft;delete a.engineLoad;
  delete a.sideSpeed;delete a.yawRate;delete a.longAccel;delete a.lateralAccel;delete a.roadPitch;
}
function mountVehicle(s,a,kind,model,x,z,yaw){
  clearActivity(s,a);Object.assign(a,{vehicle:kind,x,z,yaw,speed:0});
  if(kind==='car'&&model==='wagon')a.carModel='wagon';
}
export function takeVehicle(s,a,kind,model){
  if(!Object.hasOwn(specifications,kind))return;
  let best,line;
  for(const segment of roadsOf(s.island).segments){
    if(kind==='car'&&!segment.drivable)continue;
    const p=project(segment,a);if(!best||p.distance<best.distance){best=p;line=segment;}
  }
  if(kind==='car'&&(!line||best.distance>line.r+10)&&fits(s,kind,a.x,a.z,a.yaw,nearbyPeople(s,a,a.x,a.z))){
    mountVehicle(s,a,kind,model,a.x,a.z,a.yaw);
    return;
  }
  if(!line){a.feedback='There is no road here.';return;}
  const yaw=Math.atan2(line.dx,line.dz),direction=Math.cos(yaw-a.yaw)<0?-1:1;
  for(const offset of [0,4,-4,8,-8])for(const lane of [1,-1]){
    const side=Math.min(line.r*.45,1.5)*direction*lane;
    const x=best.x-line.dz*side+line.dx*offset,z=best.z+line.dx*side+line.dz*offset;
    const heading=yaw+(direction<0?Math.PI:0);
    if(!fits(s,kind,x,z,heading,nearbyPeople(s,a,x,z)))continue;
    mountVehicle(s,a,kind,model,x,z,heading);
    return;
  }
  a.feedback='The road is occupied. Try another stretch of street.';
}
export function moveVehicle(s,a,input,dt){
  if(a.vehicle==='car')return driveCar(s,a,input,dt);
  a.steer=input.x;
  const spec=specifications[a.vehicle],target=input.z*(input.z<0?spec.reverse:spec.top);
  const current=a.speed||0,rate=!input.z?spec.coast:target*current<0?spec.brake:spec.accel;
  const speed=current+Math.sign(target-current)*Math.min(Math.abs(target-current),rate*dt);
  a.speed=speed;if(!speed||dt<=0)return;
  const people=nearbyPeople(s,a,a.x,a.z);
  const n=Math.max(1,Math.ceil(Math.abs(speed*dt)/.28));
  for(let i=0;i<n;i++){
    const yaw=a.yaw-input.x*Math.sign(speed)*Math.min(2.05,Math.abs(speed)*spec.turn)*dt/n;
    const x=a.x+Math.sin(yaw)*speed*dt/n,z=a.z+Math.cos(yaw)*speed*dt/n;
    if(!fits(s,a.vehicle,x,z,yaw,people)){a.speed=0;return;}
    Object.assign(a,{x,z,yaw});
  }
}

// A car straddling a paved shoulder progressively gives up grip on loose ground.
function looseGround(island,car){
  const lines=roadsOf(island).cells.get(Math.floor(car.x/32)+','+Math.floor(car.z/32));
  let loose=1;
  for(const line of lines||[]){
    if(!line.drivable)continue;
    const edge=project(line,car).distance-line.r;
    if(edge<=.45)return 0;
    loose=Math.min(loose,(edge-.45)/1.55);
  }
  return loose;
}
function driveCar(s,a,input,dt){
  if(dt<=0)return;
  a.brakeHeld=!!(input.brake||input.handbrake);
  const people=nearbyPeople(s,a,a.x,a.z);
  const surface=roadContact(s.island.tireHeight||s.island.deckHeight||s.island.sample,a.x,a.z,a.yaw,driveSurface);
  const loose=looseGround(s.island,a);
  a.roadPitch=surface.pitch;
  // The tire velocities are along the road. Only their horizontal projection
  // advances the car through the town's XZ collision and network coordinates.
  const pitchCos=Math.cos(surface.pitch), rollCos=Math.cos(surface.roll);
  const bankForward=Math.sin(surface.pitch)*Math.sin(surface.roll);
  const steps=Math.max(1,Math.ceil(dt*60)),step=dt/steps;
  for(let i=0;i<steps;i++){
    const previous=a.speed||0,side=a.sideSpeed||0,omega=a.yawRate||0;
    stepRoadster(a,input,step,surface.grade,surface.crossGrade,loose);
    const lateralTravel=(side+a.sideSpeed)*.5*step;
    const travel=(previous+a.speed)*.5*step*pitchCos+lateralTravel*bankForward;
    const drift=lateralTravel*rollCos,turn=(omega+a.yawRate)*.5*step;
    if(!travel&&!drift&&!turn)continue;
    const mid=a.yaw+turn*.5,yaw=a.yaw+turn;
    const x=a.x+Math.sin(mid)*travel+Math.cos(mid)*drift,z=a.z+Math.cos(mid)*travel-Math.sin(mid)*drift;
    if(fits(s,'car',x,z,yaw,people)){Object.assign(a,{x,z,yaw});continue;}
    a.speed=0;a.sideSpeed=0;a.yawRate=0;a.longAccel=0;a.lateralAccel=0;return;
  }
}
function land(s,a,p,home){
  const others=nearbyPeople(s,a,p.x,p.z);
  for(const [dx,dz] of [[0,0],[.8,0],[-.8,0],[0,.8],[0,-.8],[1.25,.8],[-1.25,-.8],[2.3,0],[-2.3,0],[0,2.3],[0,-2.3]]){
    const q={x:p.x+dx,z:p.z+dz};
    if(home&&homeAt(s.island,q)!==home)continue;
    if(walkable(s.island,s.plots,s.layout,q)&&others.every(b=>Math.hypot(q.x-b.x,q.z-b.z)>(b.vehicle?1.9:.62))){
      clearActivity(s,a);Object.assign(a,q);a.travelSeq=(a.travelSeq||0)+1;return true;
    }
  }
  return false;
}
export function dismount(s,a){
  if(!a.vehicle)return;
  const side=specifications[a.vehicle].halfWidth+.65;
  for(const sign of [1,-1])if(land(s,a,{x:a.x+side*sign*Math.cos(a.yaw),z:a.z-side*sign*Math.sin(a.yaw)}))return;
  if(!land(s,a,a))a.feedback='Find a clear spot to get out.';
}
export function teleport(s,a,cmd){
  let p;
  if(cmd.place){
    const home=s.island.homesById?.get(cmd.place);
    if(home){
      if(land(s,a,home.inside,home))return;
      for(let z=home.d/2-.8;z> -home.d/2+.4;z-=.9){
        for(let x=-home.w/2+.8;x<home.w/2-.4;x+=.9){
          if(land(s,a,toWorld(home,x,z),home))return;
        }
      }
      a.feedback='There is no clear spot inside this house.';return;
    }
    const b=s.island.streetBenches?.get(cmd.place)||s.plots.find(b=>b.id===cmd.place)||
      [s.garden,s.island.townSquare].find(b=>b&&b.id===cmd.place);
    if(b)p=b.inside||b.entry||toWorld(b,0,frontAt(b,s.layout)+1.4);
  }else if(Number.isFinite(cmd.x)&&Number.isFinite(cmd.z)&&Math.abs(cmd.x)<s.island.half&&Math.abs(cmd.z)<s.island.half)p=cmd;
  if(!p||!land(s,a,p))a.feedback='Choose a clear spot on land.';
}
