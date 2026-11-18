import {moveWalker,walkable} from './street-world.js';

export function presentWalker(session,actor,state,now,dt){
  const guest=!session.owner,local=actor.id===session.id;
  const reset=!state.ready||state.epoch!==session.poseEpoch||state.travelSeq!==actor.travelSeq||state.vehicle!==actor.vehicle||Math.hypot(actor.x-state.x,actor.z-state.z)>3||
    state.activity!==actor.activity||state.revision!==session.layout.revision&&!walkable(session.island,session.plots,session.layout,state);
  const oldX=state.x,oldZ=state.z;
  if(reset||!guest){
    state.x=actor.x;state.z=actor.z;state.yaw=reset?actor.yaw:state.yaw;
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
  state.yaw+=angle*(1-Math.exp(-dt*17));
  state.distance=reset?0:Math.hypot(oldX-state.x,oldZ-state.z);
  state.ready=true;state.activity=actor.activity;state.travelSeq=actor.travelSeq;state.vehicle=actor.vehicle;state.epoch=session.poseEpoch;state.revision=session.layout.revision;
  return state;
}
