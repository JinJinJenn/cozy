import {exportBackup,installBackup,maxFileBytes,printCollection,readBackup,savedParcel,savedStreets,selectedSave,selectSave} from './private-saves.js';
import {homeAt} from './home-plan.js';
import {syncInteriors} from './home-furnishing.js';

const el=id=>document.getElementById(id);
export class SaveMenu{
  constructor(street,listen){
    this.street=street;this.busy=false;this.epoch=0;
    listen(el('street-saves'),'toggle',()=>{if(el('street-saves').open)this.refresh();else this.clear();});
    listen(el('save-download'),'click',()=>this.run('export'));
    listen(el('save-unlock'),'click',()=>this.run('unlock'));
    listen(el('save-file'),'change',()=>this.resetPreview());
    listen(el('save-pass'),'input',()=>this.resetPreview());
    listen(el('save-restore'),'click',()=>this.run('restore'));
    listen(el('save-switch'),'click',()=>this.run('switch'));
  }
  refresh(){
    const choices=savedStreets(),s=this.street.session;
    el('save-slots').hidden=choices.length<2;
    el('save-slot').replaceChildren(...choices.map(({label,slot})=>new Option(label,slot)));
    el('save-slot').value=s?.localSlot??selectedSave();
  }
  resetPreview(){
    this.preview=null;el('save-restore').hidden=true;el('save-status').textContent='';
  }
  clear(){
    this.epoch++;el('save-pass').value='';el('save-file').value='';this.resetPreview();
  }
  close(){
    el('street-saves').open=false;this.clear();
  }
  openSlot(slot){
    selectSave(slot);
    const url=new URL(el('personal-street').href);
    location.assign(url.href);
  }
  async run(action){
    const s=this.street.session,epoch=this.epoch;
    if(this.busy||!s||s.space==='visit'||action==='export'&&(!s.canBuild||!s.ready||!s.ownerSave))return;
    const current=()=>epoch===this.epoch&&!s.closed&&(action!=='export'||s.canBuild);
    this.busy=true;el('save-fields').disabled=true;
    try{
      if(action==='switch'){this.openSlot(el('save-slot').value);return;}
      if(action==='restore'){
        if(!this.preview)return;
        this.openSlot(installBackup(this.preview));return;
      }
      this.resetPreview();
      const password=el('save-pass').value;
      if(!password.trim())throw Error('Enter the passphrase for this file.');
      if(action==='export'){
        const revision=s.layout.revision;
        const home=homeAt(s.island,s.actors.get(s.id));
        const data=await exportBackup(s.ownerSave.identity,s.layout,s.coffeeVisits,password,home?.id,savedParcel(s.ownerSave.slot),s.admission.required,printCollection(s.ownerSave.slot));
        if(!current())return;
        const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');
        a.href=url;a.download='Cozy-street-r'+revision+'-'+new Date().toISOString().slice(0,10)+'.cozy';
        a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
        el('save-pass').value='';el('save-status').textContent='Backup downloaded. Keep the file and its passphrase for recovery.';
      }else{
        const file=el('save-file').files[0];if(!file)throw Error('Choose a .cozy backup first.');
        if(file.size>maxFileBytes)throw Error('This backup is too large.');
        const data=await readBackup(await file.text(),password);
        if(!current())return;
        const homes=s.island.homesById,home=data.homeLot&&homes.get(data.homeLot);
        if(data.homeLot&&!home||data.parcel&&!homes.has(data.parcel.home)||!syncInteriors(s.island,s.layout,data.layout,true)){
          throw Error('This home layout does not fit the current town.');
        }
        this.preview=data;el('save-pass').value='';
        const dividers=Object.keys(data.layout.rooms?.lots||{}).length;
        const pieces=Object.values(data.layout.furnishings?.lots||{}).reduce((n,items)=>n+Object.keys(items).length,0);
        el('save-status').textContent=(home?home.name+' · ':'')+'Revision '+data.layout.revision+' · '+dividers+' room divider'+(dividers===1?'':'s')+
          (pieces?' · '+pieces+' moved '+(pieces===1?'item':'items'):'')+'. Open as a separate saved street on this device.';
        el('save-restore').hidden=false;
      }
    }catch(error){if(current())el('save-status').textContent=error.message;}
    finally{this.busy=false;el('save-fields').disabled=false;}
  }
}
