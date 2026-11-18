import {baseNote,bindings,keyLabel,keyShape,pressedKeys} from './piano.js';
import {toRoom} from './street-world.js';

const el=id=>document.getElementById(id);

export function pickPiano(ray,club,actor){
  if(!club||ray.direction.y>=-.001)return null;
  // Test raised accidentals before the longer white keys underneath them.
  for(const black of [true,false]){
    const y=club.y+(black?.925:.87),distance=(y-ray.origin.y)/ray.direction.y;
    if(distance<0)continue;
    const point={x:ray.origin.x+ray.direction.x*distance,z:ray.origin.z+ray.direction.z*distance},local=toRoom(club,point);
    const part=local.x<0?'melody':'bass',x=local.x+(part==='melody'?1.7:-1.7);
    const key=keyShape.findIndex(k=>k.black===black&&Math.abs(x-k.x)<=k.w/2+.003&&Math.abs(local.z-k.z)<=k.d/2);
    if(key<0)continue;
    if(actor.part===part&&actor.piano)return {point,y,distance,command:{type:'strike-key',key},label:'Play '+keyLabel(part,key)};
    return {point,y,distance,command:{type:'furniture',lot:club.id,index:part==='melody'?0:1},label:'Play '+part};
  }
  return null;
}

export class PianoMenu{
  constructor(street,listen){
    this.street=street;this.octave=0;this.keys=[];
    const row=el('piano-keys');
    let whites=0;
    for(const [i,binding] of bindings.entries()){
      const key=document.createElement('button'),name=document.createElement('b'),shortcut=document.createElement('small');
      key.type='button';key.className=keyShape[i].black?'black':'white';
      if(keyShape[i].black)key.style.left=whites*12.5+'%';
      else whites++;
      shortcut.textContent=binding;key.append(name,shortcut);this.keys.push(key);
      listen(key,'pointerdown',e=>{if(e.button===0){e.preventDefault();this.strike(this.octave+i);}});
      listen(key,'click',e=>{if(e.detail===0)this.strike(this.octave+i);});
    }
    row.replaceChildren(...this.keys);
    listen(el('piano-mode'),'click',()=>{
      const s=street.session;void street.music.unlock();s.command({type:'free-play',enabled:!s.actors.get(s.id)?.piano});
    });
    listen(el('piano-octave'),'change',()=>{this.octave=Number(el('piano-octave').value);this.labels='';this.refresh();});
    listen(el('piano-sound'),'click',()=>{
      const music=street.music;
      if(music.ctx?.state==='running'&&music.sample&&!music.muted)music.mute(true);
      else{music.mute(false);void music.unlock();}
      this.refresh();
    });
  }
  strike(key){
    const s=this.street.session,a=s?.actors.get(s.id);
    if(!s?.strikeKey(key))return;
    const music=this.street.music,note=baseNote(a.part)+key;
    if(music.sample)music.sound(note);
    else void music.unlock().then(()=>{if(this.street.active&&a.piano)music.sound(note);});
    const button=this.keys[key-this.octave];
    if(button){button.classList.add('pressed');button.dataset.until=performance.now()+180;}
  }
  keydown(e){
    if(el('piano-keys').hidden||el('piano-controls').hidden||
      ['social-pane','directions-pane','build-pane','world-choice'].some(id=>!el(id).hidden))return false;
    const i=bindings.indexOf(e.code.startsWith('Key')?e.code.slice(3):'');
    if(i<0)return false;
    e.preventDefault();if(!e.repeat)this.strike(this.octave+i);return true;
  }
  refresh(near){
    const s=this.street.session,a=s.actors.get(s.id),seated=a?.activity==='piano',music=this.street.music;
    const listening=near?.kind==='club'||seated;
    el('piano-sound').hidden=!listening||!!this.street.buildLot;
    if(listening){
      const label=music.ctx?.state==='running'&&music.sample&&!music.muted?'Mute stage':'Listen to stage';
      if(el('piano-sound').textContent!==label)el('piano-sound').textContent=label;
    }
    el('piano-controls').hidden=!seated||!!this.street.buildLot;
    if(!seated){
      this.labels='';
      if(this.octave){this.octave=0;el('piano-octave').value='0';}
      return;
    }
    const free=!!a.piano;
    const title=a.part==='melody'?'Melody keyboard':'Bass keyboard',mode=free?'Resume house tune':'Play freely';
    if(el('piano-title').textContent!==title)el('piano-title').textContent=title;
    if(el('piano-mode').textContent!==mode)el('piano-mode').textContent=mode;
    el('piano-keys').hidden=el('piano-register').hidden=!free;
    if(!free)return;
    const labels=a.part+this.octave,mask=pressedKeys(a.piano.notes,s.time),now=performance.now();
    this.keys.forEach((button,i)=>{
      const key=this.octave+i;
      if(labels!==this.labels){
        const name=keyLabel(a.part,key);button.firstChild.textContent=name;
        button.setAttribute('aria-label','Play '+name);button.setAttribute('aria-keyshortcuts',bindings[i]);
      }
      button.classList.toggle('pressed',Boolean(mask&(1<<key))||Number(button.dataset.until)>now);
    });
    this.labels=labels;
  }
}
