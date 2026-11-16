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
  async unlock(){
    try{
      if(!this.ctx)this.ctx=new AudioContext();
      if(this.ctx.state==='suspended')await this.ctx.resume();
      if(!this.loading)this.loading=fetch(new URL('../assets/audio/piano-a3.mp3',import.meta.url)).then(r=>r.arrayBuffer()).then(b=>this.ctx.decodeAudioData(b)).then(b=>this.sample=b);
      await this.loading;
    }catch{this.loading=null;}
  }
  play(time,actors){
    const step=scoreStep(time);
    if(step===this.step||!this.sample||this.ctx.state!=='running')return;
    this.step=step;
    for(const part of new Set([...actors].map(a=>a.part))){
      const note=noteAtStep(part,step);if(note===null)continue;
      const t=this.ctx.currentTime,s=this.ctx.createBufferSource(),gain=this.ctx.createGain();
      s.buffer=this.sample;s.playbackRate.value=2**((note-57)/12);
      gain.gain.setValueAtTime(.2,t);gain.gain.exponentialRampToValueAtTime(.002,t+.7);
      s.connect(gain).connect(this.ctx.destination);s.onended=()=>{s.disconnect();gain.disconnect();};s.start(t);s.stop(t+.72);
    }
  }
  dispose(){if(this.ctx)void this.ctx.close();}
}
