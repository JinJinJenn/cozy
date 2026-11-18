import {canGesture,defaultProfile,gesturePhase,shirts} from './player-profile.js';

const el=id=>document.getElementById(id);
export class PlayerMenu {
  constructor(street,listen){
    this.street=street;
    el('profile-shirt').replaceChildren(...Object.keys(shirts).map(color=>new Option(color[0].toUpperCase()+color.slice(1),color)));
    listen(el('player-profile'),'submit',event=>{
      event.preventDefault();
      if(!street.session.changeProfile({name:el('profile-name').value,shirt:el('profile-shirt').value})){
        el('profile-name').setCustomValidity('Choose a name between 1 and 24 characters.');
        el('profile-name').reportValidity();return;
      }
      el('profile-name').value=street.session.profile.name;
      el('profile-options').open=false;this.refresh();
    });
    listen(el('profile-name'),'input',()=>el('profile-name').setCustomValidity(''));
    for(const gesture of ['wave','cheer'])listen(el('player-'+gesture),'click',()=>{
      street.session.command({type:'gesture',gesture});street.closePanels();
    });
    const follow=event=>{
      const id=event.target.closest('button')?.dataset.player,s=street.session;
      if(!id||!s.actors.has(id))return;
      event.preventDefault();
      if(id===s.id)street.centerOnPlayer();else street.cameraFocus={actor:id};
      street.closePanels();street.controls.domElement.focus({preventScroll:true});
    };
    listen(el('player-roster'),'click',follow);
    listen(el('player-roster'),'contextmenu',follow);
  }
  open(){
    const profile=this.street.session.profile;
    el('profile-name').value=profile.name;el('profile-name').setCustomValidity('');
    el('profile-shirt').value=profile.shirt;this.refresh();
  }
  refresh(){
    if(el('social-pane').hidden)return;
    const s=this.street.session,local=s.actors.get(s.id),online=s.owner||s.connected;
    const disabled=!s.ready||!online||!canGesture(local)||gesturePhase(local,s.time)!==null;
    el('player-wave').disabled=el('player-cheer').disabled=disabled;
    const players=[];
    for(const [id,actor] of s.actors){
      if(id.startsWith('resident')||(!online&&id!==s.id))continue;
      const {name,shirt}=actor.profile||defaultProfile(id);
      players.push({id,name,shirt});
    }
    players.sort((a,b)=>a.id===s.id?-1:b.id===s.id?1:a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
    const key=JSON.stringify(players);
    if(this.key===key)return;
    this.key=key;
    el('player-roster').replaceChildren(...players.map(({id,name,shirt})=>{
      const button=document.createElement('button'),swatch=document.createElement('i');
      const duplicate=players.some(other=>other.id!==id&&other.name===name);
      const label=name+(duplicate?' · '+id.slice(0,4):'')+(id===s.id?' (you)':'');
      swatch.style.backgroundColor=shirts[shirt];swatch.setAttribute('aria-hidden','true');
      button.dataset.player=id;button.title=id===s.id?'Return to my character':'Follow '+label;
      button.setAttribute('aria-label',button.title);button.append(swatch,document.createTextNode(label));return button;
    }));
  }
}
