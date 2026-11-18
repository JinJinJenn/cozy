import {canGesture,defaultProfile,gesturePhase,shirts} from './player-profile.js';

const el=id=>document.getElementById(id);
export class PlayerMenu {
  constructor(street,listen){
    this.street=street;
    listen(el('ask-to-enter'),'change',()=>street.session.setAdmission(el('ask-to-enter').checked));
    listen(el('answer-door'),'click',()=>{
      if(el('social-pane').hidden)el('social-open').click();
      el('door-requests').querySelector('button')?.focus();
    });
    listen(el('door-requests'),'click',event=>{
      const button=event.target.closest('button');
      if(button&&street.session.canBuild)street.session.admission.decide(button.parentElement.dataset.key,button.value==='admit');
      this.refresh();
    });
    el('profile-shirt').replaceChildren(...Object.keys(shirts).map(color=>new Option(color[0].toUpperCase()+color.slice(1),color)));
    listen(el('player-profile'),'submit',event=>{
      event.preventDefault();
      if(!street.session.changeProfile({...street.session.profile,name:el('profile-name').value,shirt:el('profile-shirt').value})){
        el('profile-name').setCustomValidity('Choose a name between 1 and 24 characters.');
        el('profile-name').reportValidity();return;
      }
      el('profile-name').value=street.session.profile.name;
      el('profile-options').open=false;this.refresh();
    });
    listen(el('profile-name'),'input',()=>el('profile-name').setCustomValidity(''));
    listen(el('remove-flower'),'click',()=>{
      const {name,shirt}=street.session.profile;
      street.session.changeProfile({name,shirt});this.refresh();
    });
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
    const session=this.street.session,waiting=session.admission?.waiting||[];
    el('answer-door').hidden=!waiting.length||!el('social-pane').hidden;
    if(waiting.length)el('answer-door').textContent='Answer the door ('+waiting.length+')';
    const wait=el('visit-wait');wait.hidden=!session.visitStatus;
    if(!wait.hidden)wait.firstElementChild.textContent={
      waiting:'Knocked. Waiting for the owner.',declined:'The owner declined this visit.',full:'The street is full. Waiting for a place.'
    }[session.visitStatus];
    if(el('social-pane').hidden)return;
    el('ask-to-enter').checked=!!session.admission?.required;
    const requests=JSON.stringify(waiting.map(v=>[v.key,v.name,v.home]));
    if(this.requests!==requests){
      this.requests=requests;
      el('door-requests').replaceChildren(...waiting.map(v=>{
        const row=document.createElement('div'),home=session.island.homesById.get(v.home);
        row.dataset.key=v.key;
        const name=waiting.some(other=>other!==v&&other.name===v.name)?v.name+' ('+v.actor.slice(0,4)+')':v.name;
        row.append(document.createTextNode(name+(home?' is visiting '+home.name:' is at the door')+'. '));
        for(const [value,label] of [['admit','Let in'],['decline','Decline']]){
          const button=document.createElement('button');button.value=value;button.textContent=label;
          button.setAttribute('aria-label',label+' '+name);row.append(button);
        }
        return row;
      }));
    }
    const s=this.street.session,local=s.actors.get(s.id),online=s.owner||s.connected;
    const remove=el('remove-flower');remove.hidden=!s.profile.flower;
    if(!remove.hidden)remove.textContent='Unpin '+s.profile.flower;
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
