import {carSpec} from './cars.js';

// Three-speed torque-converter automatic. Ratios include the final drive.
const ratios=[16,10.5,7.4],reverseRatio=15,wheelRadius=.28,efficiency=.9;
const wheelRpm=60/(2*Math.PI*wheelRadius),shiftDuration=.19;
const ratioFor=gear=>gear<0?reverseRatio:ratios[gear-1];
export const validGear=gear=>gear===-1||gear===1||gear===2||gear===3;

export function selectGear(speed,previous,load,reverse=speed<-.1){
  if(reverse)return -1;
  let gear=validGear(previous)&&previous>0?previous:1;
  const wheel=Math.abs(speed)*wheelRpm;
  while(gear<3&&wheel*ratioFor(gear)>3400+800*load)gear++;
  while(gear>1&&wheel*ratioFor(gear)<1750+250*load)gear--;
  return gear;
}

export function engineRpm(speed,gear,load){
  // Converter slip lets the engine pick up before the wheels gather speed.
  return Math.max(820+load*720,Math.abs(speed)*wheelRpm*ratioFor(gear));
}

export function driveAcceleration(state,speed,pedal,dt,reverse=speed<-.1){
  const last=state.gear,gear=selectGear(speed,last,pedal,reverse);
  if(last>0&&gear>0&&last!==gear)state.shiftLeft=shiftDuration;
  if(gear<0||last<0)state.shiftLeft=0;
  const remaining=Math.min(state.shiftLeft||0,shiftDuration);
  const end=Math.max(0,remaining-dt);
  // The clutch progressively re-engages. Integrate its torque over the tick
  // so a resident's long simulation tick feels the same shift as a player.
  const clutch=1-.86*(remaining*remaining-end*end)/(2*shiftDuration*dt);
  const governor=Math.min(1,Math.max(0,((gear<0?3.4:17.5)-Math.abs(speed))/.6));
  state.gear=gear;state.shiftLeft=end;state.engineLoad=pedal*clutch*governor;
  const rpm=engineRpm(speed,gear,pedal),ratio=ratioFor(gear);
  const model=carSpec(state.carModel);
  const torque=model.torque*(1-.27*Math.min(1,((rpm-3200)/2600)**2));
  const wheelForce=state.engineLoad*torque*ratio*efficiency/wheelRadius;
  const drag=.14+.0015*speed*speed+(1-pedal)*ratio*.027;
  return (gear<0?-1:1)*wheelForce/model.mass-Math.sign(speed)*drag;
}
