import {roadsOf,project} from './street-road-index.js';
import {homeAt} from './home-plan.js';
import {frontAt,sideAt,toRoom,toWorld,walkable} from './street-world.js';
import {stepRoadster,wheelbase} from '../packages/sim/src/roadster.js';

const specifications={
  car:{halfWidth:.86,halfLength:1.55},
  bike:{top:7.5,reverse:1.15,accel:3.4,brake:6,coast:1.5,turn:.93,halfWidth:.28,halfLength:.79}
};
function outdoors(s,p){
  if(!walkable(s.island,s.plots,s.layout,p)||homeAt(s.island,p))return false;
  return !s.plots.some(b=>{const q=toRoom(b,p);return q.x> -b.w/2-.25&&q.x<sideAt(b,s.layout)+.25&&q.z> -b.d/2-.25&&q.z<frontAt(b,s.layout)+.25;});
}
function nearbyPeople(s,actor,x,z){
  const people=[];
  for(const other of s.actors.values())if(other.id!==actor.id&&Math.abs(other.x-x)<9&&Math.abs(other.z-z)<9)people.push(other);
  for(const p of s.town.people)if(p.visible&&Math.abs(p.position.x-x)<9&&Math.abs(p.position.z-z)<9)
    people.push(p.userData?.driving?{x:p.position.x,z:p.position.z,vehicle:'car'}:p.position);
  return people;
}
function fits(s,kind,x,z,yaw,people){
  const spec=specifications[kind],sin=Math.sin(yaw),cos=Math.cos(yaw);
  for(const p of people){
    const dx=p.x-x,dz=p.z-z,padding=p.vehicle==='car'?1.5:p.vehicle==='bike'?.72:.29;
    if(Math.abs(dx*cos-dz*sin)<spec.halfWidth+padding&&Math.abs(dx*sin+dz*cos)<spec.halfLength+padding)return false;
  }
  for(const fore of [-spec.halfLength,0,spec.halfLength]){
    const cx=x+fore*sin,cz=z+fore*cos;
    for(const side of [-spec.halfWidth,spec.halfWidth]){
      const corner={x:cx+side*cos,z:cz-side*sin};
      if(kind==='car'){
        const lines=roadsOf(s.island).cells.get(Math.floor(corner.x/32)+','+Math.floor(corner.z/32));
        if(!lines?.some(l=>l.drivable&&project(l,corner).distance<=l.r))return false;
      }
      if(!outdoors(s,corner))return false;
    }
  }
  return true;
}
function clearActivity(s,a){
  s.activities.finish(a);a.activity='';a.part='';a.feedback='';
  delete a.bowlFrom;delete a.vehicle;delete a.speed;delete a.steer;delete a.reverseHold;delete a.brakeHeld;
  delete a.gear;delete a.shiftLeft;delete a.engineLoad;
  delete a.sideSpeed;delete a.yawRate;delete a.longAccel;delete a.lateralAccel;delete a.roadPitch;
}
export function takeVehicle(s,a,kind){
  if(!Object.hasOwn(specifications,kind))return;
  let best,line;
  for(const segment of roadsOf(s.island).segments){
    if(kind==='car'&&!segment.drivable)continue;
    const p=project(segment,a);if(!best||p.distance<best.distance){best=p;line=segment;}
  }
  if(!line){a.feedback='There is no road here.';return;}
  const yaw=Math.atan2(line.dx,line.dz),direction=Math.cos(yaw-a.yaw)<0?-1:1;
  for(const offset of [0,4,-4,8,-8])for(const lane of [1,-1]){
    const side=Math.min(line.r*.45,1.5)*direction*lane;
    const x=best.x-line.dz*side+line.dx*offset,z=best.z+line.dx*side+line.dz*offset;
    const heading=yaw+(direction<0?Math.PI:0);
    if(!fits(s,kind,x,z,heading,nearbyPeople(s,a,x,z)))continue;
    clearActivity(s,a);Object.assign(a,{vehicle:kind,x,z,yaw:heading,speed:0});return;
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

function approach(value,target,amount){
  return value+Math.sign(target-value)*Math.min(Math.abs(target-value),amount);
}
function driveCar(s,a,input,dt){
  if(dt<=0)return;
  a.brakeHeld=!!input.brake;
  const people=nearbyPeople(s,a,a.x,a.z);
  const dx=Math.sin(a.yaw)*wheelbase*.5,dz=Math.cos(a.yaw)*wheelbase*.5;
  const height=s.island.deckHeight||((x,z)=>s.island.sample(x,z));
  const grade=Math.max(-.35,Math.min(.35,(height(a.x+dx,a.z+dz)-height(a.x-dx,a.z-dz))/wheelbase));
  a.roadPitch=-Math.atan(grade);
  const steps=Math.max(1,Math.ceil(dt*60)),step=dt/steps;
  for(let i=0;i<steps;i++){
    const previous=a.speed||0,side=a.sideSpeed||0,omega=a.yawRate||0;
    stepRoadster(a,input,step,grade);
    const travel=(previous+a.speed)*.5*step;
    const drift=(side+a.sideSpeed)*.5*step,turn=(omega+a.yawRate)*.5*step;
    if(!travel&&!drift&&!turn)continue;
    const mid=a.yaw+turn*.5,yaw=a.yaw+turn;
    const x=a.x+Math.sin(mid)*travel+Math.cos(mid)*drift,z=a.z+Math.cos(mid)*travel-Math.sin(mid)*drift;
    if(fits(s,'car',x,z,yaw,people)){Object.assign(a,{x,z,yaw});continue;}
    // Scrub along the kerb on a shallow contact. The proposed recovery goes
    // through the same footprint, pedestrian and building checks as free travel.
    const lines=roadsOf(s.island).cells.get(Math.floor(a.x/32)+','+Math.floor(a.z/32))||[];
    let nearest,foot;
    for(const line of lines){
      if(!line.drivable)continue;
      const hit=project(line,a);
      if(!foot||hit.distance<foot.distance){nearest=line;foot=hit;}
    }
    if(nearest){
      const along=nearest.dx*Math.sin(mid)+nearest.dz*Math.cos(mid);
      if(Math.abs(along)>.76){
        const heading=Math.atan2(nearest.dx*Math.sign(along),nearest.dz*Math.sign(along));
        const error=Math.atan2(Math.sin(heading-a.yaw),Math.cos(heading-a.yaw));
        const corrected=a.yaw+approach(0,error,step*2.8);
        let cx=a.x+nearest.dx*travel*along,cz=a.z+nearest.dz*travel*along;
        let clear=fits(s,'car',cx,cz,corrected,people);
        if(!clear&&foot.distance>nearest.r-specifications.car.halfWidth-.24){
          // At an outside bend, rotating to the tangent can swing the rear
          // corner farther onto the curb. Resolve a small inward displacement
          // with the rotation and check the complete footprint together.
          const inset=Math.min(.65*step,foot.distance)/foot.distance;
          cx+=(foot.x-a.x)*inset;cz+=(foot.z-a.z)*inset;
          clear=fits(s,'car',cx,cz,corrected,people);
        }
        if(clear){
          Object.assign(a,{x:cx,z:cz,yaw:corrected,speed:a.speed*Math.exp(-step*2),sideSpeed:0,yawRate:0});continue;
        }
      }
    }
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
