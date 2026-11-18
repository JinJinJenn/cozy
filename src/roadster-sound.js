import {carSteerAngle,wheelbase} from '../packages/sim/src/roadster.js';

const clamp=(value,lo=0,hi=1)=>Math.max(lo,Math.min(hi,value));
const ratios=[16,10.5,7.4];
const wheelRpm=60/(2*Math.PI*.28);
const range=26;

export function engineFeedback(drive,lastGear=1,pedal=0){
  const forward=drive.speed||0,speed=Math.abs(forward);
  const load=clamp(Math.max((drive.longAccel||0)*Math.sign(forward)/5,pedal*Math.sign(forward||pedal)));
  let gear=forward<-.1?-1:clamp(lastGear,1,3);
  if(gear>0){
    while(gear<3&&speed*wheelRpm*ratios[gear-1]>3400+load*800)gear++;
    while(gear>1&&speed*wheelRpm*ratios[gear-1]<1750+load*250)gear--;
  }
  const rpm=Math.max(820+130*load,speed*wheelRpm*(gear<0?15:ratios[gear-1]));
  const steer=-carSteerAngle(drive.steer||0,forward);
  const frontSide=(drive.sideSpeed||0)+.96*(drive.yawRate||0);
  const rearSide=(drive.sideSpeed||0)-(wheelbase-.96)*(drive.yawRate||0);
  const slip=Math.max(Math.abs(frontSide*Math.cos(steer)-forward*Math.sin(steer)),Math.abs(rearSide));
  const scrub=clamp((slip-.36)/2.6)*clamp((speed-2)/4);
  return {gear,rpm,load,scrub,speed};
}

function newVoice(ctx,out,wave,noise){
  const motor=ctx.createOscillator(),exhaust=ctx.createBiquadFilter(),power=ctx.createGain();
  const tires=ctx.createBufferSource(),rubber=ctx.createBiquadFilter(),friction=ctx.createGain();
  const pan=ctx.createStereoPanner(),level=ctx.createGain();
  motor.setPeriodicWave(wave);exhaust.type='lowpass';exhaust.Q.value=.65;
  tires.buffer=noise;tires.loop=true;rubber.type='bandpass';rubber.Q.value=2;
  power.gain.value=0;friction.gain.value=0;level.gain.value=0;
  motor.connect(exhaust).connect(power).connect(pan);
  tires.connect(rubber).connect(friction).connect(pan);
  pan.connect(level).connect(out);motor.start();tires.start();
  return {
    set(feedback,gain,bearing){
      const {rpm,load,scrub,speed}=feedback,t=ctx.currentTime;
      motor.frequency.setTargetAtTime(rpm/30,t,.075); // two firing pulses per revolution
      exhaust.frequency.setTargetAtTime(210+rpm*.105+load*460,t,.065);
      power.gain.setTargetAtTime(.075+.077*load+.018*clamp(speed/17),t,.055);
      rubber.frequency.setTargetAtTime(740+scrub*1300,t,.045);
      friction.gain.setTargetAtTime(.25*scrub,t,.048);
      pan.pan.setTargetAtTime(bearing,t,.085);
      level.gain.setTargetAtTime(gain,t,.048);
    },
    stop(){
      const t=ctx.currentTime;
      level.gain.setTargetAtTime(0,t,.012);
      motor.stop(t+.07);tires.stop(t+.07);
      motor.onended=()=>{for(const node of [motor,exhaust,power,tires,rubber,friction,pan,level])node.disconnect();};
    }
  };
}

export class RoadsterSound{
  constructor(){
    try{this.muted=localStorage.getItem('cozy.vehicle-muted')==='1';}catch{this.muted=false;}
    this.voices=new Map();
  }
  setMuted(value){
    this.muted=value;
    try{localStorage.setItem('cozy.vehicle-muted',value?'1':'0');}catch{}
    if(value)this.quiet();
  }
  quiet(){
    for(const voice of this.voices.values())voice.stop();
    this.voices.clear();this.next=0;this.lastNeighbor=null;
  }
  play(channel,id,feedback,gain,bearing){
    let voice=this.voices.get(channel);
    if(!feedback){if(voice){voice.stop();this.voices.delete(channel);}return;}
    const ctx=this.ctx;
    if(!this.output){
      this.output=ctx.createGain();this.output.connect(ctx.destination);
      this.wave=ctx.createPeriodicWave(new Float32Array(9),Float32Array.of(0,1,.50,.18,.26,.095,.078,.046,.03));
      this.noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
      const data=this.noise.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    }
    if(!voice){voice=newVoice(ctx,this.output,this.wave,this.noise);this.voices.set(channel,voice);}
    voice.id=id;voice.gear=feedback.gear;voice.set(feedback,gain,bearing);
  }
  update(now,local,drive,pedal,people,actors,camera){
    if(now<(this.next||0))return;
    this.next=now+80;
    this.driver=local.vehicle==='car'?engineFeedback(drive,this.driver?.gear,pedal):null;
    if(!this.ctx||this.ctx.state!=='running'||this.muted)return;
    this.play('local',local.id,this.driver,1,0);
    const passing=this.voices.get('street'),previous=passing?.id;
    let best=range*range,source=null,id=null,dx=0,dz=0;
    function consider(key,point,motion){
      const x=point.x-local.x,z=point.z-local.z,d=x*x+z*z;
      const score=key===previous?d*.8:d;
      if(d>=range*range||score>=best)return;
      best=score;source=motion;id=key;dx=x;dz=z;
    }
    for(const a of actors)if(a.id!==local.id&&a.vehicle==='car')consider(a.id,a,a);
    for(const p of people)if(p.userData.driving)consider(p,p.position,p.userData);
    const d=Math.hypot(dx,dz),right=camera.matrixWorld.elements;
    let motion=source;
    if(source&&typeof id==='object'){
      // Position follows the worker even when this resident is behind the camera.
      const last=this.lastNeighbor,dt=(now-(last?.time??now))/1000;
      let speed=0;
      if(id===last?.id&&dt>0&&dt<.6){
        const measured=Math.hypot(id.position.x-last.x,id.position.z-last.z)/dt;
        if(measured<25)speed=last.speed+(measured-last.speed)*(1-Math.exp(-dt*6));
      }
      motion={speed};this.lastNeighbor={id,time:now,x:id.position.x,z:id.position.z,speed};
    }else this.lastNeighbor=null;
    const feedback=motion?engineFeedback(motion,id===previous?passing?.gear:1):null;
    this.play('street',id,feedback,.62*(1-d/range)**2,clamp((dx*right[0]+dz*right[2])/Math.max(2,d),-1,1));
  }
  dispose(){this.quiet();this.output?.disconnect();}
}
