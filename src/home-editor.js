import * as THREE from 'three';
import {dividerLimit,dividerParts,sameDivider} from './room-divider.js';
import {FurnishingEditor} from './furnishing-editor.js';
import {installedLampMask,lamps,printIds,wallPrint} from './home-fixtures.js';
import {printCollection} from './private-saves.js';
import {catalog} from './furniture-pose.js';

const el=id=>document.getElementById(id);
export class HomeEditor{
  constructor(street,listen){
    this.street=street;
    this.furniture=new FurnishingEditor(street,listen);
    listen(el('room-mode'),'change',()=>{
      const mode=el('room-mode').value;
      for(const name of ['divider','furniture','lighting','gallery'])el(name+'-tools').hidden=name!==mode;
      this.ghost.visible=false;
      if(mode==='furniture')this.furniture.open(this.home);
      else{
        this.furniture.close();
        if(mode==='divider')this.change();
        else if(mode==='gallery')this.showGallery();
        else this.showLighting();
      }
    });
    for(const id of ['gallery-print','gallery-frame'])listen(el(id),'change',()=>this.galleryStatus());
    listen(el('gallery-hang'),'click',()=>this.hang(this.gallerySelection()));
    listen(el('gallery-clear'),'click',()=>this.hang(0));
    for(const [kind,lamp] of Object.entries(lamps)){
      const control=el('link-'+kind);
      listen(control,'change',()=>{
        this.street.session.linkEntryLamp(this.home,lamp.bit,control.checked);
        this.showLighting();
      });
    }
    for(const id of ['room-line','room-door'])listen(el(id),'input',()=>this.change());
    listen(el('room-rotate'),'click',()=>{this.turn=1-this.turn;this.ranges();this.change();});
    listen(el('room-apply'),'click',()=>this.commit(this.draft));
    listen(el('room-remove'),'click',()=>this.commit(null));
    listen(el('room-undo'),'click',()=>this.commit(null,true));
  }
  open(home){
    el('room-mode').value='divider';el('divider-tools').hidden=false;el('furniture-tools').hidden=true;el('lighting-tools').hidden=true;el('gallery-tools').hidden=true;
    this.home=home;el('wall-tools').hidden=el('wall-grip').hidden=true;el('room-tools').hidden=false;
    this.material=new THREE.MeshBasicMaterial({color:0x538a75,transparent:true,opacity:.52,depthWrite:false});
    this.geometry=new THREE.BoxGeometry();this.ghost=new THREE.Group();
    for(let i=0;i<2;i++)this.ghost.add(new THREE.Mesh(this.geometry,this.material));
    this.ghost.rotation.y=home.yaw;this.ghost.position.set(home.x,home.y,home.z);this.street.scene.add(this.ghost);
    let plan=home.divider;
    if(!plan){
      const people=this.street.session.roomOccupants(home);
      find:for(const line of [0,-2,2,-4,4,-1,1,-3,3])for(const door of [0,2,-2,1,-1])for(const turn of [0,1]){
        const candidate=[turn,line,door];
        if(!dividerLimit(home,candidate,people)){plan=candidate;break find;}
      }
    }
    this.select(plan||[0,0,0]);
  }
  select([turn,line,door]){
    this.turn=turn;this.ranges();el('room-line').value=line;el('room-door').value=door;this.change();
  }
  ranges(){
    const h=this.home;
    for(const [id,bound] of [['room-line',(this.turn?h.w:h.d)-2.3],['room-door',(this.turn?h.d:h.w)-2.32]]){
      el(id).min=-Math.max(0,Math.floor(bound));el(id).max=Math.max(0,Math.floor(bound));
    }
  }
  change(){
    this.revision=this.street.session.layout.revision;
    this.draft=[this.turn,Number(el('room-line').value),Number(el('room-door').value)];
    for(const [i,r] of dividerParts(this.home,this.draft).entries()){
      const m=this.ghost.children[i];m.position.set(r.x,1.14,r.z);m.scale.set(r.w,2.28,r.d);
    }
    this.street.notice('');this.refresh();
  }
  showLighting(){
    const installed=installedLampMask(this.home),unlinked=this.street.session.layout.unlinkedLamps?.[this.home.id]||0;
    for(const [kind,lamp] of Object.entries(lamps)){
      const control=el('link-'+kind);
      control.parentElement.hidden=!(installed&lamp.bit);
      control.checked=!!(installed&lamp.bit)&&!(unlinked&lamp.bit);
    }
    el('lighting-info').textContent=installed?'The entry switch controls the hall light and the lamps you select.':'The entry switch controls the hall light.';
  }
  showGallery(){
    const s=this.street.session,owned=printCollection(s.localSlot),value=s.layout.wallPrints?.[this.home.id]||0;
    const select=el('gallery-print');select.replaceChildren();
    for(const [i,id] of printIds.entries())if(owned&(1<<i))select.add(new Option(catalog[id].subject,String(i+1)));
    const displayed=printIds.indexOf(wallPrint(value));
    if(displayed>=0&&(owned&(1<<displayed)))select.value=String(1+displayed);
    el('gallery-frame').value=value>2?'1':'0';this.galleryStatus();
  }
  gallerySelection(){
    return el('gallery-print').value?Number(el('gallery-print').value)+2*Number(el('gallery-frame').value):0;
  }
  galleryStatus(){
    const value=this.street.session.layout.wallPrints?.[this.home.id]||0,next=this.gallerySelection();
    el('gallery-frame').disabled=el('gallery-print').disabled=!next;
    el('gallery-hang').disabled=!next||next===value;el('gallery-clear').hidden=!value;
    el('gallery-status').textContent=value?catalog[wallPrint(value)].subject+' hangs between the back windows.':
      next?'Choose a print for the back wall.':'View a finished painting and choose Keep for home to collect your first print.';
  }
  hang(value){
    if(this.street.session.hangPrint(this.home,value))this.galleryStatus();
  }
  refresh(){
    if(['lighting','gallery'].includes(el('room-mode').value))return;
    if(this.furniture.home){this.furniture.refresh();return;}
    const s=this.street.session,existing=this.home.divider??null;
    const changed=!sameDivider(existing,this.draft);
    const reason=changed?dividerLimit(this.home,this.draft,s.roomOccupants(this.home)):'';
    this.material.color.set(reason?'#c45749':'#60bfa0');this.ghost.visible=changed;
    el('room-apply').disabled=!changed||!!reason;el('room-remove').disabled=!existing;
    el('room-undo').disabled=s.layout.rooms?.last?.[0]!==this.home.id;
    el('room-line-value').textContent=(this.draft[1]/2).toFixed(1)+' m';
    el('room-door-value').textContent=(this.draft[2]/2).toFixed(1)+' m';
    el('room-status').textContent=reason||(changed?'Preview only. Apply to share this wall with your guests.':'The divider is in place.');
  }
  commit(plan,undo=false){
    const s=this.street.session;
    if(s.editRoom(this.home.id,plan,this.revision,undo)){
      this.select(this.home.divider||this.draft);this.street.notice(undo?'Room edit undone.':plan?'Divider installed.':'Divider removed.');
    }else{this.revision=s.layout.revision;this.refresh();}
  }
  close(){
    if(!this.home)return;
    this.furniture.close();
    this.ghost.removeFromParent();this.geometry.dispose();this.material.dispose();this.home=null;
    el('room-tools').hidden=true;el('wall-tools').hidden=false;
  }
}
