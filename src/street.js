import * as THREE from 'three';
import {avatar,disposeGroup,places,streetArt,townExteriors} from './street-art.js';
import {floorAt,frontAt,isHome,plotsForStreet,toRoom,toWorld,wallState} from './street-world.js';
import {StreetSession} from './street-session.js';
import {StreetMusic} from './street-music.js';

const $=id=>document.getElementById(id);
const names={cafe:'Switch café lanterns',restaurant:'Take a table',club:'Join the music',spa:'Relax',gym:'Work out',cottage:'Sit down',house:'Sit down'};
const directions=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);
export class Street {
  constructor(island,scene,camera,controls,town){
    Object.assign(this,{island,scene,camera,controls,town});
    this.plots=plotsForStreet(island);this.clearExteriors=townExteriors(island,this.plots,scene);
    if(!this.plots.length)return;
    this.art=streetArt(island,this.plots,scene);this.meshes=new Map();this.keys=new Set();
    this.music=new StreetMusic();this.abort=new AbortController();this.joy={x:0,z:0};this.cafe=this.plots.find(b=>b.cafe);
    this.editable=this.plots.filter(b=>b.cafe||isHome(b));
    $('build-lot').replaceChildren(...this.editable.map(b=>new Option(places[b.kind][0],b.id)));
    this.ray=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,1,0));
    this.point=new THREE.Vector3();
    $('destination').replaceChildren(new Option('Choose a place',''),...this.plots.map(b=>new Option(places[b.kind][0],b.kind)));
    const listen=(el,type,fn)=>el.addEventListener(type,fn,{signal:this.abort.signal});
    listen(window,'keydown',e=>{
      if(!this.active)return;
      if(e.code==='Escape'){this.closePanels();return;}
      if(e.target.matches('input,select,textarea'))return;
      if(directions.has(e.code)){e.preventDefault();this.keys.add(e.code);}
      if(e.code==='KeyE'&&!e.repeat&&!this.buildLot){e.preventDefault();this.use();}
    });
    listen(window,'keyup',e=>this.keys.delete(e.code));listen(window,'blur',()=>this.clearInput());
    listen($('use-place'),'click',()=>this.use());
    listen($('directions-open'),'click',()=>{const open=$('directions-pane').hidden;this.closePanels();$('directions-pane').hidden=!open;});
    listen($('destination'),'change',()=>{this.destination=this.plots.find(b=>b.kind===$('destination').value);this.nextUI=0;});
    listen($('build-open'),'click',()=>{
      const open=$('build-pane').hidden;this.closePanels();
      if(!open||!this.session?.owner||!this.session.ready)return;
      const local=this.session.actors.get(this.session.id),near=this.session.near(local);
      this.returnOffset=this.camera.position.clone().sub(this.controls.target);
      $('build-pane').hidden=false;this.selectLot(this.editable.includes(near)?near:this.cafe);
    });
    listen($('build-lot'),'change',()=>this.selectLot(this.editable.find(b=>b.id===$('build-lot').value)));
    listen($('wall-offset'),'input',()=>this.preview());
    listen($('apply-wall'),'click',()=>this.commitWall());
    listen($('undo-wall'),'click',()=>this.commitWall(true));
    const grip=$('wall-grip');
    listen(grip,'pointerdown',e=>{
      if(!this.buildLot||this.drag||e.button!==0)return;
      const start=this.pointerZ(e);if(start===null)return;
      e.preventDefault();grip.setPointerCapture(e.pointerId);
      this.drag={id:e.pointerId,start,offset:Number($('wall-offset').value)};
    });
    listen(grip,'pointermove',e=>this.dragWall(e));
    listen(grip,'pointerup',e=>{
      if(this.drag?.id!==e.pointerId)return;
      this.dragWall(e);this.drag=null;
      if(Number($('wall-offset').value)!==wallState(this.session.layout,this.buildLot).wall)this.commitWall();
    });
    listen(grip,'lostpointercapture',()=>{if(this.drag){this.drag=null;this.resetPreview();}});
    listen($('social-open'),'click',()=>{const open=$('social-pane').hidden;this.closePanels();$('social-pane').hidden=!open;});
    listen($('copy-street'),'click',async()=>{
      const url=await this.session.invite();if(!url)return;
      $('invite-url').value=url;$('invite-url').hidden=false;
      try{await navigator.clipboard.writeText(url);this.notice('Invite link copied.');}catch{$('invite-url').select();this.notice('Your invite link is ready to copy.');}
    });
    listen($('list-street'),'change',async()=>{await this.session.setListed($('list-street').checked);$('list-street').checked=this.session.listed;});
    listen($('browse-streets'),'click',async()=>{await this.session.discover();this.browsing=true;this.showRooms();});
    const pad=$('walk-pad'),stick=$('pad-stick');
    const steer=e=>{const r=pad.getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/(r.width*.35),z=(r.top+r.height/2-e.clientY)/(r.height*.35);
      const n=Math.max(1,Math.hypot(x,z));x/=n;z/=n;this.joy={x,z};stick.style.transform='translate('+x*22+'px,'+-z*22+'px)';};
    listen(pad,'pointerdown',e=>{pad.setPointerCapture(e.pointerId);steer(e);});
    listen(pad,'pointermove',e=>{if(pad.hasPointerCapture(e.pointerId))steer(e);});
    listen(pad,'lostpointercapture',()=>{this.joy={x:0,z:0};stick.style.transform='';});
  }
  notice(text){$('street-note').textContent=text;}
  showRooms(){
    const el=$('room-results'),rooms=this.session.rooms(),key=rooms.map(r=>r.url).join();
    if(el.dataset.rooms===key)return;el.dataset.rooms=key;el.replaceChildren();
    if(!rooms.length){el.textContent='No listed streets nearby.';return;}
    for(const [i,r] of rooms.entries()){const link=document.createElement('a');link.href=r.url;link.textContent='Visit Harbor Street '+(i+1);el.append(link);}
  }
  selectLot(b){
    this.clearInput();this.drag=null;this.buildLot=b;$('build-lot').value=b.id;
    $('build-open').textContent='Done building';this.nextUI=0;
    $('wall-label').textContent=b.cafe?'Partition':'Front wall';this.notice('');
    const eye=toWorld(b,4,-8);
    this.controls.target.set(b.x,b.y+.35,b.z);this.camera.position.set(eye.x,b.y+11,eye.z);
    this.controls.update();this.resetPreview();this.render();
  }
  resetPreview(){if(this.buildLot){$('wall-offset').value=wallState(this.session.layout,this.buildLot).wall;this.preview();}}
  commitWall(undo=false){
    if(!this.buildLot)return;
    this.session.edit(Number($('wall-offset').value),undo,this.buildLot.id);this.resetPreview();
  }
  pointerZ(e){
    const rect=this.controls.domElement.getBoundingClientRect();
    this.ray.setFromCamera({x:(e.clientX-rect.left)*2/rect.width-1,y:1-(e.clientY-rect.top)*2/rect.height},this.camera);
    this.plane.constant=-(this.buildLot.y+2.25);
    const p=this.ray.ray.intersectPlane(this.plane,this.point);
    return p?toRoom(this.buildLot,p).z:null;
  }
  dragWall(e){
    if(!this.drag||this.drag.id!==e.pointerId)return;
    const z=this.pointerZ(e);if(z===null)return;
    $('wall-offset').value=Math.round((this.drag.offset+z-this.drag.start)*2)/2;this.preview();
  }
  preview(){
    const value=Number($('wall-offset').value);$('wall-readout').textContent=value.toFixed(1)+' m';
    this.art.preview(this.buildLot,value,!!this.buildLot&&value!==wallState(this.session.layout,this.buildLot).wall);
  }
  positionGrip(){
    const b=this.buildLot,offset=Number($('wall-offset').value);
    const p=toWorld(b,-b.w*.25,(b.cafe?0:b.d/2)+offset);
    const projected=this.point.set(p.x,b.y+2.25,p.z).project(this.camera),r=this.controls.domElement.getBoundingClientRect();
    const grip=$('wall-grip');grip.hidden=projected.z< -1||projected.z>1;
    grip.style.left=(r.left+(projected.x+1)*r.width/2)+'px';grip.style.top=(r.top+(1-projected.y)*r.height/2)+'px';
  }
  closePanels(){
    for(const id of ['build-pane','social-pane','directions-pane','wall-grip'])$(id).hidden=true;
    if(this.buildLot){
      this.drag=null;this.buildLot=null;this.art.preview(null,0,false);
      $('build-open').textContent='Build';this.clearInput();this.nextUI=0;
      this.camera.position.copy(this.controls.target).add(this.returnOffset);this.controls.update();
    }
  }
  clearInput(){this.keys?.clear();this.joy={x:0,z:0};if(this.session)this.session.keys={x:0,z:0};}
  use(){if(!this.session?.ready)return;void this.music.unlock();this.session.use();}
  activate(){
    if(!this.art)return false;
    if(!this.session){
      this.session=new StreetSession(this.island,this.plots,t=>this.notice(t),this.town);
      let last=performance.now();this.timer=setInterval(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,.15);last=now;
        if(this.active)this.input();this.session.tick(dt);},35);
    }
    this.active=true;this.closePanels();this.clearInput();this.nextUI=0;
    document.body.classList.add('in-street');$('street-panel').hidden=false;$('street-note').textContent='';
    $('build-open').hidden=!this.session.owner;$('owner-room').hidden=!this.session.owner;$('invite-url').hidden=true;
    const p=this.session.actors.get(this.session.id)||this.session.spawn;
    const y=floorAt(this.island,this.plots,p.x,p.z,this.session.layout),off=toWorld(this.cafe,6.5,12);
    this.controls.minDistance=2.6;this.controls.maxDistance=45;this.controls.enablePan=false;
    this.camera.near=.13;this.camera.updateProjectionMatrix();
    this.controls.target.set(p.x,y+1.1,p.z);this.camera.position.set(p.x+off.x-this.cafe.x,y+5.9,p.z+off.z-this.cafe.z);
    this.controls.update();this.render();return true;
  }
  deactivate(){if(!this.active)return;this.active=false;this.clearInput();this.closePanels();this.art.update({x:Infinity,z:Infinity},this.session.layout);
    document.body.classList.remove('in-street');$('street-panel').hidden=true;
    this.controls.enablePan=true;this.controls.minDistance=8;this.controls.maxDistance=4200;
    this.camera.near=1;this.camera.updateProjectionMatrix();}
  input(){
    if(this.buildLot){this.session.keys.x=0;this.session.keys.z=0;return;}
    const keys=this.keys,down=(a,b)=>Number(keys.has(a)||keys.has(b));
    const forward=down('KeyW','ArrowUp')-down('KeyS','ArrowDown')+this.joy.z;
    const side=down('KeyD','ArrowRight')-down('KeyA','ArrowLeft')+this.joy.x;
    const dx=this.controls.target.x-this.camera.position.x,dz=this.controls.target.z-this.camera.position.z,n=Math.hypot(dx,dz)||1;
    this.session.keys={x:(forward*dx-side*dz)/n,z:(forward*dz+side*dx)/n};
  }
  render(){
    const s=this.session;if(!s||!this.active)return;
    const local=s.actors.get(s.id);if(!local)return;
    const now=performance.now();
    for(const [id,a] of s.actors){
      let mesh=this.meshes.get(id);
      if(!mesh){const npc=id.startsWith('resident');mesh=avatar(id===s.id?'#c55b61':npc?'#729581':'#6687bd',id==='resident1'?'#996941':'#d9a779');this.scene.add(mesh);this.meshes.set(id,mesh);}
      const y=floorAt(this.island,this.plots,a.x,a.z,s.layout);
      mesh.position.set(a.x,y,a.z);mesh.rotation.y=a.yaw;
      const seated=['sit','dine','relax','piano'].includes(a.activity);
      mesh.setSeated(seated);mesh.scale.y=a.activity==='train'?.86+.14*Math.sin(s.time*4):1;
      mesh.rotation.z=(a.activity==='piano'||a.activity==='dance')?.09*Math.sin(s.time*6):0;
    }
    for(const [id,m] of this.meshes)if(!s.actors.has(id)){this.scene.remove(m);disposeGroup(m);this.meshes.delete(id);}
    const m=this.meshes.get(s.id),target=this.controls.target;
    if(this.buildLot)this.positionGrip();
    else{
      this.camera.position.x+=m.position.x-target.x;this.camera.position.y+=m.position.y+1.1-target.y;this.camera.position.z+=m.position.z-target.z;
      target.set(m.position.x,m.position.y+1.1,m.position.z);
    }
    this.art.update(local,s.layout,this.camera.position,this.buildLot?.id);
    const near=s.near(local);if(near?.kind==='club')this.music.play(s.time,s.actors.values());
    if(this.nextUI>now)return;this.nextUI=now+150;
    $('place').textContent=this.buildLot?places[this.buildLot.kind][0]:near?places[near.kind][0]:'Harbor Town';
    $('walk-hint').textContent=this.buildLot?'Drag the wall handle, or set an offset below.':'WASD to walk · Drag to orbit · E to interact';
    const waypoint=$('waypoint');waypoint.hidden=!this.destination;
    if(this.destination){const b=this.destination,p=toWorld(b,0,frontAt(b,s.layout)+1.6),dx=p.x-local.x,dz=p.z-local.z,dist=Math.hypot(dx,dz);
      const heading=Math.atan2(dx,dz)-Math.atan2(this.controls.target.x-this.camera.position.x,this.controls.target.z-this.camera.position.z);
      $('bearing').style.transform='rotate('+-heading+'rad)';$('range').textContent=places[b.kind][0]+' · '+(dist<2.5?'at the entrance':Math.round(dist)+' m');}
    const people=[...s.actors.keys()].filter(id=>!id.startsWith('resident')).length;
    $('party').textContent=s.error?'Room unavailable':s.owner?(people>1?people+' players':'Your street'):s.connected?people+' players':'Waiting for the owner';
    $('build-open').hidden=!s.owner;$('owner-room').hidden=!s.owner;
    const spot=s.station(local,near),use=$('use-place');use.hidden=!!this.buildLot||(!spot&&!local.activity);use.disabled=!s.ready||(!s.owner&&!s.connected);
    if(near)use.textContent=local.part?'Stop playing '+local.part:local.activity?'Finish '+({train:'workout',relax:'resting',sit:'sitting',dine:'dining',dance:'dancing'}[local.activity]||local.activity):spot?.part?'Play '+spot.part:spot?.action==='dance'?'Dance':names[near.kind];
    $('undo-wall').disabled=!this.buildLot||!wallState(s.layout,this.buildLot).undo.length;$('list-street').checked=s.listed;
    if(this.browsing&&!$('social-pane').hidden)this.showRooms();
  }
  dispose(){this.deactivate();clearInterval(this.timer);this.abort?.abort();this.music?.dispose();this.session?.dispose();
    for(const m of this.meshes?.values()||[]){this.scene.remove(m);disposeGroup(m);}this.art?.dispose();this.clearExteriors();}
}
