import * as THREE from 'three';
import {homeLocal,homeWorld} from './home-plan.js';
import {furnishingPreview} from './home-art.js';
import {catalog,catalogItem,furnishings,furnitureName,originalPose,placeItem,samePose,storedPose} from './furniture-pose.js';
import {editedItems,occupantLimit,planInterior} from './home-furnishing.js';
import {paintingStage} from './home-fixtures.js';

const el=id=>document.getElementById('furniture-'+id);
export class FurnishingEditor{
  constructor(street,listen){
    this.street=street;
    listen(el('item'),'change',()=>this.select());
    for(const axis of ['x','z'])listen(el(axis),'input',()=>this.change());
    listen(el('rotate'),'click',()=>this.rotate());
    listen(el('apply'),'click',()=>this.commit());
    listen(el('undo'),'click',()=>this.commit(true));
    listen(el('pack'),'click',()=>this.commit(false,true));
    listen(el('canvas'),'click',()=>{
      if(this.street.session.replaceCanvas(this.home,this.id))this.street.notice('Fresh linen on the easel.');
      this.refresh();
    });
    listen(window,'keydown',e=>{
      if(!this.home||e.ctrlKey||e.altKey||e.metaKey||e.repeat||!['Comma','Period'].includes(e.code))return;
      e.preventDefault();this.rotate(e.code==='Comma'?-1:1);
    });
  }
  open(home){
    this.home=home;
    this.material=new THREE.MeshBasicMaterial({transparent:true,opacity:.62,depthWrite:false});
    this.items();
    this.select();
    this.frameRoom();
    this.resize=new ResizeObserver(()=>this.frameRoom());
    this.resize.observe(this.street.controls.domElement);this.resize.observe(document.querySelector('.street-actions'));
  }
  items(selected){
    const room=document.createElement('optgroup'),store=document.createElement('optgroup');
    room.label='In this room';store.label='In storage';
    for(const f of this.home.furniture){
      if(Object.hasOwn(furnishings,f.id)||Object.hasOwn(catalog,f.id))room.append(new Option(furnitureName(f.id),f.id));
    }
    for(const [id,item] of Object.entries(catalog))if(!this.home.placements?.[id])store.append(new Option(item.name,id));
    const select=el('item');select.replaceChildren(room);if(store.children.length)select.append(store);
    if(selected)select.value=selected;
  }
  frameRoom(){
    if(!this.home)return;
    const camera=this.street.camera,view=this.street.controls.domElement.getBoundingClientRect(),panel=document.querySelector('.street-actions').getBoundingClientRect();
    if(view.width>=1000&&view.height>=640){
      if(this.shifted)camera.clearViewOffset();
      this.shifted=false;return;
    }
    // Frame the room in the part of the canvas a player can actually click.
    // Use the same projection for rendering and floor picking.
    const portrait=view.height>view.width,w=view.width,h=w/camera.aspect;
    const available=portrait?(panel.top-view.top)/view.height:(view.right-panel.right)/w;
    const scale=Math.max(.35,Math.min(1,available)),cw=w/scale,ch=h/scale;
    const dx=portrait?0:(1-available)*cw/2,dy=portrait?(1-available)*ch/2:0;
    camera.setViewOffset(w,h,(w-cw)/2-dx,(h-ch)/2+dy,cw,ch);this.shifted=true;
  }
  clearGhost(){
    if(!this.ghost)return;
    this.ghost.removeFromParent();
    for(const mesh of this.ghost.children)mesh.dispose();
    this.ghost=null;
  }
  close(){
    this.resize?.disconnect();this.resize=null;
    if(this.shifted)this.street.camera.clearViewOffset();this.shifted=false;
    this.clearGhost();this.material?.dispose();this.material=null;this.home=null;this.checked=null;
  }
  select(){
    this.clearGhost();
    this.id=el('item').value;
    this.source=catalogItem(this.id)||(this.home.generatedFurniture||this.home.furniture).find(f=>f.id===this.id);
    const [x,z,turn]=this.home.placements?.[this.id]||originalPose;
    for(const [axis,size,value] of [['x',this.home.w,x],['z',this.home.d,z]]){
      const input=el(axis);
      input.min=Math.max(-64,Math.ceil((-size/2-this.source[axis])*4));
      input.max=Math.min(64,Math.floor((size/2-this.source[axis])*4));input.value=value;
    }
    this.ghost=furnishingPreview(this.home,this.source,this.material);this.street.scene.add(this.ghost);
    this.turn=turn;this.change();
  }
  rotate(direction=1){this.turn=(this.turn+direction+4)%4;this.change();}
  aim(e){
    const st=this.street;st.plane.constant=-this.home.y;
    const hit=st.pointerRay(e).intersectPlane(st.plane,st.point);if(!hit)return;
    const p=homeLocal(this.home,hit);
    if(Math.abs(p.x)>this.home.w/2||Math.abs(p.z)>this.home.d/2)return;
    for(const axis of ['x','z'])el(axis).value=Math.round((p[axis]-this.source[axis])*4);
    this.change();
  }
  change(){
    this.draft=[Number(el('x').value),Number(el('z').value),this.turn];
    this.revision=this.street.session.layout.revision;this.checked=null;
    const at=placeItem(this.source,this.draft),world=homeWorld(this.home,at.x,at.z);
    this.ghost.position.set(world.x,this.home.y+.035,world.z);this.ghost.rotation.y=this.home.yaw+this.turn*Math.PI/2;
    for(const [i,axis] of ['x','z'].entries())el(axis+'-value').textContent=(this.draft[i]/4).toFixed(2)+' m';
    this.street.notice('');this.refresh();
  }
  refresh(){
    const s=this.street.session,h=this.home,previous=storedPose(h.placements,this.id),changed=!samePose(previous,this.draft);
    const pack=el('pack');pack.hidden=!Object.hasOwn(catalog,this.id)||!previous;
    if(!pack.hidden)pack.disabled=s.furnitureInUse(h,this.id);
    const canvas=el('canvas');
    canvas.hidden=!previous||this.source.type!=='easel'||!paintingStage(s.layout,h.id,this.id);
    if(!canvas.hidden)canvas.disabled=pack.disabled;
    let reason='';
    if(changed){
      if(!this.checked||this.checkedAt!==s.layout.revision){
        this.checked=planInterior(h,editedItems(h.placements,this.id,this.draft),h.divider);
        this.checkedAt=s.layout.revision;
      }
      reason=s.furnitureInUse(h,this.id)?'Someone is using this item or walking to it.':
        this.checked.reason||occupantLimit(h,this.checked.next,this.id,s.roomOccupants(h));
    }
    this.material.color.set(reason?'#c45749':'#5bbfa5');this.ghost.visible=changed;
    el('apply').disabled=!changed||!!reason;el('undo').disabled=s.layout.furnishings?.last?.[0]!==h.id;
    el('status').textContent=reason||(changed?'Facing '+(90*this.turn)+'°. Place the item to share this arrangement.':'Click the floor to move. Right-click to rotate.');
  }
  commit(undo=false,pack=false){
    const s=this.street.session;
    if(s.editFurniture(this.home.id,this.id,pack?null:this.draft,this.revision,undo)){
      this.items(this.id);this.select();this.street.notice(undo?'Furniture edit undone.':furnitureName(this.id)+(pack?' put away.':' placed.'));
    }else{this.revision=s.layout.revision;this.refresh();}
  }
}
