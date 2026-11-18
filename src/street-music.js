import {baseNote} from './piano.js';
import {frontAt,toRoom} from './street-world.js';
export function withinStage(club,layout,listener){
  if(!club||!listener)return false;
  const p=toRoom(club,listener);
  return Math.abs(p.x)<=club.w/2+1&&p.z>=-club.d/2-1&&p.z<=frontAt(club,layout)+4;
}
const scores = {melody:'o4 l8 e g a r g e d r c e g a g r e r',bass:'o3 l4 c r f g c a f g'};
function readPart(score) {
  let octave=4, duration=2;
  const steps=[];
  for(const token of score.split(' ')) {
    if(token[0]==='o'){octave=Number(token.slice(1));continue;}
    if(token[0]==='l'){duration=8/Number(token.slice(1));continue;}
    const offset={c:0,d:2,e:4,f:5,g:7,a:9,b:11}[token];
    steps.push(offset===undefined?null:12*(octave+1)+offset);
    for(let i=1;i<duration;i++)steps.push(null);
  }
  return steps;
}
const parts=Object.fromEntries(Object.entries(scores).map(([name,mml])=>[name,readPart(mml)]));
export const scoreStep=time=>Math.floor(time/.30);
export function noteAtStep(part,step){
  const notes=parts[part];
  return notes?.[step%notes.length]??null;
}
export class StreetMusic {
  constructor(){this.heard=new Map();this.flashes=new Map();this.muted=false;}
  takeKeyFlash(part,piano){
    const flash=this.flashes.get(part);
    if(!flash)return 0;
    this.flashes.delete(part);
    return flash.id===piano?.id&&performance.now()-flash.at<1500?flash.mask:0;
  }
  async unlock(){
    try{
      if(!this.ctx)this.ctx=new AudioContext();
      if(!this.master){this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:1;this.master.connect(this.ctx.destination);}
      if(this.ctx.state==='suspended')await this.ctx.resume();
      if(!this.loading)this.loading=fetch(new URL('../assets/audio/piano-a3.mp3',import.meta.url)).then(r=>r.arrayBuffer()).then(b=>this.ctx.decodeAudioData(b)).then(b=>this.sample=b);
      await this.loading;
    }catch{this.loading=null;}
  }
  mute(value){this.muted=value;if(this.master)this.master.gain.setTargetAtTime(value?0:1,this.ctx.currentTime,.012);}
  sound(note,delay=0){
    if(this.muted||!this.sample||this.ctx?.state!=='running')return;
    const t=this.ctx.currentTime+delay,s=this.ctx.createBufferSource(),gain=this.ctx.createGain();
    s.buffer=this.sample;s.playbackRate.value=2**((note-57)/12);
    gain.gain.setValueAtTime(.17,t);gain.gain.exponentialRampToValueAtTime(.002,t+.7);
    s.connect(gain).connect(this.master);s.onended=()=>{s.disconnect();gain.disconnect();};s.start(t);s.stop(t+.72);
  }
  play(time,actors,localId,listening){
    if(!listening){this.listening=false;this.flashes.clear();return;}
    const entering=!this.listening;
    this.listening=true;
    const step=scoreStep(time);
    for(const a of actors){
      if(a.activity!=='piano'||!a.part)continue;
      if(a.piano){
        const previous=this.heard.get(a.part),last=previous?.id===a.piano.id?previous.seq:0;
        if(!entering&&last<a.piano.seq){
          let mask=0;
          for(const [seq,key,at] of a.piano.notes){
            if(seq<=last||time-at>.8)continue;
            mask|=1<<key;
            if(a.id!==localId)this.sound(baseNote(a.part)+key,Math.max(0,Math.min(.12,.095+at-time)));
          }
          if(mask){
            const pending=this.flashes.get(a.part),at=performance.now();
            if(pending?.id===a.piano.id&&at-pending.at<300)mask|=pending.mask;
            this.flashes.set(a.part,{id:a.piano.id,mask,at});
          }
        }
        if(previous?.id!==a.piano.id||last!==a.piano.seq)this.heard.set(a.part,{id:a.piano.id,seq:a.piano.seq});
      }else if(step!==this.step){
        const note=noteAtStep(a.part,step);if(note!==null)this.sound(note);
      }
    }
    this.step=step;
  }
  dispose(){if(this.ctx)void this.ctx.close();}
}
