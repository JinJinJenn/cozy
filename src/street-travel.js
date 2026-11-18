import {homeAt} from './home-plan.js';
import {frontAt,sideAt,toRoom,toWorld,walkable} from './street-world.js';

const specifications={
  car:{top:15.5,reverse:3.3,accel:6.6,brake:12,coast:1.35,halfWidth:.86,halfLength:1.55},
  bike:{top:7.5,reverse:1.15,accel:3.4,brake:6,coast:1.5,turn:.93,halfWidth:.28,halfLength:.79}
};
const roadIndexes=new WeakMap();
function roadsOf(island){
  if(roadIndexes.has(island))return roadIndexes.get(island);
  const segments=[],cells=new Map();
  for(const road of island.plan.roads)for(let i=1;i<road.pts.length;i++){
    const [x,z]=road.pts[i-1],[ex,ez]=road.pts[i],length=Math.hypot(ex-x,ez-z);
    if(!length)continue;
    const dx=(ex-x)/length,dz=(ez-z)/length,r=road.width/2;
    const line={x,z,dx,dz,length,r};segments.push(line);
    for(let ix=Math.floor((Math.min(x,ex)-r)/32);ix<=Math.floor((Math.max(x,ex)+r)/32);ix++)
      for(let iz=Math.floor((Math.min(z,ez)-r)/32);iz<=Math.floor((Math.max(z,ez)+r)/32);iz++){
        const key=ix+','+iz;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(line);
      }
  }
  const result={segments,cells};roadIndexes.set(island,result);return result;
}
function project(line,p){
  const t=Math.min(line.length,Math.max(0,(p.x-line.x)*line.dx+(p.z-line.z)*line.dz));
  const x=line.x+t*line.dx,z=line.z+t*line.dz;
  return {x,z,distance:Math.hypot(x-p.x,z-p.z)};
}
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
        if(!lines?.some(l=>project(l,corner).distance<=l.r))return false;
      }
      if(!outdoors(s,corner))return false;
    }
  }
  return true;
}
function clearActivity(s,a){
  s.activities.finish(a);a.activity='';a.part='';a.feedback='';
  delete a.bowlFrom;delete a.vehicle;delete a.speed;delete a.steer;delete a.reverseHold;
}
export function takeVehicle(s,a,kind){
  if(!Object.hasOwn(specifications,kind))return;
  let best,line;
  for(const segment of roadsOf(s.island).segments){
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
export function carSteerAngle(steer,speed){
  return steer*.62/(1+.011*speed*speed);
}
function driveCar(s,a,input,dt){
  if(dt<=0)return;
  const spec=specifications.car,people=nearbyPeople(s,a,a.x,a.z);
  const steps=Math.max(1,Math.ceil(dt*60)),step=dt/steps;
  for(let i=0;i<steps;i++){
    const previous=a.speed||0,throttle=input.z||0;
    const braking=throttle*previous<0;
    if(braking)a.reverseHold=.20;
    else if(!throttle||throttle>0)a.reverseHold=0;
    else a.reverseHold=Math.max(0,(a.reverseHold||0)-step);
    const target=braking||a.reverseHold?0:throttle*(throttle<0?spec.reverse:spec.top);
    const rate=braking?spec.brake:!throttle?spec.coast+.015*previous*previous:spec.accel*(1-.32*Math.min(1,Math.abs(previous)/spec.top));
    a.speed=approach(previous,target,rate*step);
    a.steer=approach(a.steer||0,input.x||0,step*(input.x?3.8:6));
    const travel=(previous+a.speed)*.5*step;
    if(!travel)continue;
    // The wheelbase comes from the axles of the rendered car. Limit steering
    // lock at speed so a brief tap can trim a lane without whipping the camera.
    const turn=-travel*Math.tan(carSteerAngle(a.steer,previous))/2.02;
    const mid=a.yaw+turn*.5,yaw=a.yaw+turn;
    const x=a.x+Math.sin(mid)*travel,z=a.z+Math.cos(mid)*travel;
    if(fits(s,'car',x,z,yaw,people)){Object.assign(a,{x,z,yaw});continue;}
    // Scrub along the kerb on a shallow contact. The proposed recovery goes
    // through the same footprint, pedestrian and building checks as free travel.
    const lines=roadsOf(s.island).cells.get(Math.floor(a.x/32)+','+Math.floor(a.z/32))||[];
    let nearest,dist=Infinity;
    for(const line of lines){const d=project(line,a).distance;if(d<dist){nearest=line;dist=d;}}
    if(nearest){
      const along=nearest.dx*Math.sin(mid)+nearest.dz*Math.cos(mid);
      if(Math.abs(along)>.76){
        const heading=Math.atan2(nearest.dx*Math.sign(along),nearest.dz*Math.sign(along));
        const error=Math.atan2(Math.sin(heading-a.yaw),Math.cos(heading-a.yaw));
        const corrected=a.yaw+approach(0,error,step*2.8);
        const cx=a.x+nearest.dx*travel*along,cz=a.z+nearest.dz*travel*along;
        if(fits(s,'car',cx,cz,corrected,people)){
          Object.assign(a,{x:cx,z:cz,yaw:corrected,speed:a.speed*Math.exp(-step*2)});continue;
        }
      }
    }
    a.speed=0;return;
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
