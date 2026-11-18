import {moveWalker,walkable} from './street-world.js';
import {moveVehicle} from './street-travel.js';

export function presentWalker(session,actor,state,now,dt){
  const guest=!session.owner,local=actor.id===session.id;
  const reset=!state.ready||state.epoch!==session.poseEpoch||state.travelSeq!==actor.travelSeq||state.vehicle!==actor.vehicle||Math.hypot(actor.x-state.x,actor.z-state.z)>3||
    state.activity!==actor.activity||state.revision!==session.layout.revision&&!walkable(session.island,session.plots,session.layout,state);
  const oldX=state.x,oldZ=state.z;
  if(reset){state.roll=0;state.pitch=0;state.rollRate=0;state.pitchRate=0;}
  if(reset||!guest){
    state.x=actor.x;state.z=actor.z;state.yaw=reset?actor.yaw:state.yaw;
    state.speed=actor.speed||0;state.steer=actor.steer||0;state.reverseHold=actor.reverseHold||0;
    state.gearSeq=session.verifiedSeq;state.gear=actor.gear;state.shiftLeft=actor.shiftLeft;state.engineLoad=actor.engineLoad;
    state.sideSpeed=actor.sideSpeed||0;state.yawRate=actor.yawRate||0;
    state.longAccel=actor.longAccel||0;state.lateralAccel=actor.lateralAccel||0;
    state.roadPitch=actor.roadPitch||0;
  }else if(local&&actor.vehicle==='car'&&session.connected){
    state.id=actor.id;
    moveVehicle(session,state,session.keys,Math.min(dt,.1));
    if(actor.motion===undefined||actor.motion>=session.motion){
      const age=Math.min(.10,Math.max(0,(now-session.lastFrame)/1000));
      const gain=1-Math.exp(-dt*12);
      state.x+=(actor.x+(actor.vx||0)*age-state.x)*gain;
      state.z+=(actor.z+(actor.vz||0)*age-state.z)*gain;
      // Import the host's gear and shift clock together after it acknowledges the input.
      if(actor.gear!==undefined&&state.gearSeq!==session.verifiedSeq){
        state.gearSeq=session.verifiedSeq;state.gear=actor.gear;state.shiftLeft=Math.max(0,(actor.shiftLeft||0)-age);
      }
      state.speed+=(actor.speed-state.speed)*gain;
      state.sideSpeed+=((actor.sideSpeed||0)-state.sideSpeed)*gain;
      state.yawRate+=((actor.yawRate||0)-state.yawRate)*gain;
    }
  }else if(local&&!actor.vehicle&&(session.keys.x||session.keys.z||!actor.walking)&&!actor.activity&&session.connected){
    const {keys}=session;
    const facing=state.yaw;
    moveWalker(session.island,session.plots,session.layout,state,keys,Math.min(dt,.12));
    state.yaw=facing;
    if(actor.motion===undefined||actor.motion>=session.motion){
      const age=Math.min(.12,Math.max(0,(now-session.lastFrame)/1000));
      const gain=1-Math.exp(-dt*12);
      const x=state.x+(actor.x+(actor.vx||0)*age-state.x)*gain;
      const z=state.z+(actor.z+(actor.vz||0)*age-state.z)*gain;
      if(walkable(session.island,session.plots,session.layout,{x,z})){state.x=x;state.z=z;}
      else{state.x=actor.x;state.z=actor.z;}
    }
  }else{
    if(state.seq!==session.verifiedSeq){
      state.fromX=state.x;state.fromZ=state.z;
      state.duration=Math.min(160,Math.max(32,session.lastFrame-(state.packetAt??(session.lastFrame-85))));
      state.packetAt=session.lastFrame;state.seq=session.verifiedSeq;
    }
    const t=Math.min(1,Math.max(0,(now-state.packetAt)/state.duration));
    state.x=state.fromX+(actor.x-state.fromX)*t;state.z=state.fromZ+(actor.z-state.fromZ)*t;
  }
  // Camera and avatar consume this same presented position.
  const heading=local&&!actor.vehicle&&(session.keys.x||session.keys.z)?Math.atan2(session.keys.x,session.keys.z):actor.yaw;
  const angle=Math.atan2(Math.sin(heading-state.yaw),Math.cos(heading-state.yaw));
  if(!guest||!local||actor.vehicle!=='car'||actor.motion===undefined||actor.motion>=session.motion)
    state.yaw+=angle*(1-Math.exp(-dt*17));
  state.distance=reset?0:Math.hypot(oldX-state.x,oldZ-state.z);
  state.ready=true;state.activity=actor.activity;state.travelSeq=actor.travelSeq;state.vehicle=actor.vehicle;state.epoch=session.poseEpoch;state.revision=session.layout.revision;
  return state;
}
