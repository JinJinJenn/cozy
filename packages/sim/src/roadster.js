import {driveAcceleration} from './powertrain.js';

// Distances are metres, angles are radians. Body-forward is +Z and yaw turns toward +X.
export const wheelbase=2.02;
const frontArm=.96,rearArm=wheelbase-frontArm,gravity=9.81,grip=.96;
const yawInertia=1.12; // yaw inertia divided by mass, in square metres
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const approach=(v,target,step)=>v+clamp(target-v,-step,step);

export function carSteerAngle(steer,speed){
  // Preserve parking lock while keeping a short key press precise at road speed.
  return steer*.60/(1+.014*speed*speed);
}
function lateralForce(slip,load,longitudinal,stiffness){
  const limit=Math.sqrt(Math.max(0,(grip*load)**2-longitudinal**2));
  return limit>0?-limit*Math.tanh(stiffness*slip/limit):0;
}

export function stepRoadster(car,input,dt,grade=0,crossGrade=0){
  const u=car.speed||0,v=car.sideSpeed||0,r=car.yawRate||0,throttle=input.z||0;
  const pressure=throttle*u<0?1:clamp(Number(input.brake)||0,0,1);
  const brake=pressure>0;
  if(brake)car.reverseHold=.2;
  else car.reverseHold=throttle<0?Math.max(0,(car.reverseHold||0)-dt):0;
  const pedal=brake||car.reverseHold?0:Math.abs(throttle);
  const reverse=u<-.1||u<=0&&throttle<0&&!brake&&!car.reverseHold;
  const power=driveAcceleration(car,u,pedal,dt,reverse);
  const demand=brake?(approach(u,0,8.5*pressure*dt)-u)/dt:power;
  const steering=car.steer||0,requested=input.x||0;
  const crossing=steering*requested<0;
  const rateIn=3.8/(1+.025*Math.abs(u));
  car.steer=approach(steering,crossing?0:requested,dt*(crossing||!requested?6:rateIn));
  const delta=-carSteerAngle(car.steer,u),sn=Math.sin(delta),cs=Math.cos(delta);

  // Braking loads the front axle. The rear wheels drive the car, and each
  // axle spends the same available grip on longitudinal and lateral force.
  const forwardLength=Math.hypot(1,grade);
  const normalGravity=gravity/Math.hypot(1,grade,crossGrade);
  const frontLoad=clamp(normalGravity*rearArm/wheelbase-demand*.42/wheelbase,0,normalGravity);
  const rearLoad=normalGravity-frontLoad;
  const frontX=brake?clamp(demand*.66,-grip*frontLoad,grip*frontLoad):0;
  const frontV=v+frontArm*r,rearV=v-rearArm*r;
  const rearSlip=Math.atan2(rearV,Math.max(2,Math.abs(u)));
  const rearGrip=grip*rearLoad;
  let driveLimit=rearGrip;
  if(pedal){
    // Ease off the driven wheels when existing rear slip is using their grip.
    const cornerForce=lateralForce(rearSlip,rearLoad,0,43);
    driveLimit=Math.sqrt(Math.max(0,rearGrip*rearGrip-cornerForce*cornerForce));
  }
  const rearX=clamp(demand-frontX,-driveLimit,driveLimit);
  if(pedal&&Math.abs(demand)>driveLimit)car.engineLoad*=driveLimit/Math.abs(demand);
  const frontY=lateralForce(Math.atan2(frontV*cs-u*sn,Math.max(2,Math.abs(u*cs+frontV*sn))),frontLoad,frontX,37);
  const rearY=lateralForce(rearSlip,rearLoad,rearX,43);
  const frontSide=frontY*cs+frontX*sn;
  const tireSide=frontSide+rearY;
  const accel=frontX*cs+rearX-frontY*sn;
  let speed=u+(accel+v*r-gravity*grade/forwardLength)*dt;
  // A stopped car holds on a hill. The reverse gate also holds the car until
  // an opposing pedal has brought it to rest.
  if(!pedal&&(!u||Math.sign(speed)!==Math.sign(u)||brake&&Math.abs(u)<.10))speed=0;
  car.speed=clamp(speed,-3.4,17.5);

  // Blend into the rolling (no-slip) solution at parking speed, where tire
  // slip angles are undefined at rest. Keep axle inertia at driving speed.
  const crawl=clamp((4-Math.abs(u))/2,0,1)*(1-Math.exp(-dt*24));
  const rollingRate=car.speed*Math.tan(delta)/wheelbase;
  const yaw=r+(frontArm*frontSide-rearArm*rearY)*dt/yawInertia;
  // A rolling tire must generate lateral force on a bank. Keep the static
  // hold at parking speed so a parked car stays where its driver leaves it.
  const downhill=-normalGravity*crossGrade/forwardLength*Math.min(1,Math.abs(u)/2);
  const side=v+(tireSide+downhill-u*r)*dt;
  car.yawRate=yaw+(rollingRate-yaw)*crawl;
  car.sideSpeed=side+(rollingRate*rearArm-side)*crawl;
  if(!car.speed&&Math.abs(car.sideSpeed)<.055&&Math.abs(car.yawRate)<.06){
    car.sideSpeed=0;car.yawRate=0;
  }
  car.longAccel=accel;car.lateralAccel=tireSide;
}

// Set a speed at each route vertex from its curvature. Carry the required
// braking distance back through short segments so drivers slow before a bend.
export function cornerSpeeds(points){
  if(!points.length)return [];
  const speeds=points.map(()=>9);
  for(let i=1;i+1<points.length;i++){
    const [a,b,c]=[points[i-1],points[i],points[i+1]];
    const x=b[0]-a[0],z=b[1]-a[1],dx=c[0]-b[0],dz=c[1]-b[1];
    const product=Math.hypot(x,z)*Math.hypot(dx,dz)*Math.hypot(c[0]-a[0],c[1]-a[1]);
    const curvature=product>.00001?2*Math.abs(x*dz-z*dx)/product:0;
    if(curvature>.001)speeds[i]=Math.min(9,Math.sqrt(3.4/curvature));
  }
  speeds[speeds.length-1]=0;
  for(let i=speeds.length-2;i>=0;i--){
    const distance=Math.hypot(points[i][0]-points[i+1][0],points[i][1]-points[i+1][1]);
    speeds[i]=Math.min(speeds[i],Math.sqrt(speeds[i+1]**2+2*3.5*distance));
  }
  return speeds;
}
