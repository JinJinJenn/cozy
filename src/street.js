import {neighborName} from './street-activities.js';
import {presentWalker} from './street-motion.js';
import * as THREE from 'three';
import {avatar,disposeGroup,places,streetArt,townExteriors} from './street-art.js';
import {cameraClearance,floorAt,gardenForStreet,frontAt,hasEditableFront,plotsForStreet,toRoom,toWorld,wallState} from './street-world.js';
import {stationsFor,StreetSession} from './street-session.js';
import {StreetMusic} from './street-music.js';

const $=id=>document.getElementById(id);
const names={garden:'Sit on the bench',cafe:'Switch café lanterns',restaurant:'Take a table',club:'Join the music',spa:'Relax',gym:'Work out',cottage:'Sit down',house:'Sit down'};
const directions=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);
export class Street {
  constructor(island,scene,camera,controls,town){
    Object.assign(this,{island,scene,camera,controls,town});
    this.plots=plotsForStreet(island);this.clearExteriors=townExteriors(island,this.plots,scene);
    if(!this.plots.length)return;
    this.art=streetArt(island,this.plots,scene);this.meshes=new Map();this.keys=new Set();
    this.music=new StreetMusic();this.abort=new AbortController();this.joy={x:0,z:0};this.cafe=this.plots.find(b=>b.cafe);
    this.editable=this.plots.filter(b=>b.cafe||hasEditableFront(b));
    $('build-lot').replaceChildren(...this.editable.map(b=>new Option(places[b.kind][0],b.id)));
    this.ray=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,1,0));
    this.walkMarker=new THREE.Mesh(new THREE.RingGeometry(.37,.45,32).rotateX(-Math.PI/2),
      new THREE.MeshBasicMaterial({color:'#fff1bd',side:THREE.DoubleSide,depthWrite:false,
        polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
    this.walkMarker.visible=false;scene.add(this.walkMarker);
    this.point=new THREE.Vector3();this.rayPoint=new THREE.Vector3();
    this.destinations=[...this.plots,gardenForStreet(this.cafe)];
    $('destination').replaceChildren(new Option('Choose a place',''),...this.destinations.map(b=>new Option(places[b.kind][0],b.kind)));
    const listen=(el,type,fn)=>el.addEventListener(type,fn,{signal:this.abort.signal});
    // After a captured wall drag, Chromium can suppress the next compatibility
    // click. Complete a stationary single-finger tap once, on its original button.
    const panel=$('street-panel');let tap=null;
    listen(panel,'touchstart',e=>{
      const button=e.target.closest('button'),finger=e.changedTouches[0];
      tap=e.touches.length===1&&button&&!button.disabled&&button.id!=='wall-grip'?
        {button,id:finger.identifier,x:finger.clientX,y:finger.clientY}:null;
    });
    listen(panel,'touchcancel',()=>{tap=null;});
    listen(panel,'touchmove',e=>{
      if(!tap)return;const f=e.touches[0];
      if(e.touches.length!==1||Math.hypot(f.clientX-tap.x,f.clientY-tap.y)>10)tap=null;
    });
    panel.addEventListener('touchend',e=>{
      const start=tap;tap=null;if(!start||!e.cancelable)return;
      const f=e.changedTouches[0],hit=document.elementFromPoint(f.clientX,f.clientY);
      if(start.id!==f.identifier||!start.button.contains(hit)||Math.hypot(f.clientX-start.x,f.clientY-start.y)>10)return;
      e.preventDefault();start.button.click();
    },{signal:this.abort.signal,passive:false});
    listen(window,'keydown',e=>{
      if(!this.active)return;
      if(e.code==='ShiftLeft'||e.code==='ShiftRight')this.sprint=true;
      if(e.code==='Escape'){this.closePanels();return;}
      if(e.target.matches('input,select,textarea'))return;
      if(directions.has(e.code)){e.preventDefault();$('world-choice').hidden=true;this.keys.add(e.code);this.input();}
      if(e.code==='KeyE'&&!e.repeat&&!this.buildLot){e.preventDefault();this.use();}
    });
    listen(window,'keyup',e=>{this.keys.delete(e.code);if(e.code.startsWith('Shift'))this.sprint=false;if(this.active)this.input();});listen(window,'blur',()=>this.clearInput());
    listen($('use-place'),'click',()=>this.use());
    listen($('directions-open'),'click',()=>{const open=$('directions-pane').hidden;this.closePanels();$('directions-pane').hidden=!open;});
    listen($('destination'),'change',()=>{this.destination=this.destinations.find(b=>b.kind===$('destination').value);$('go-place').disabled=!this.destination;this.nextUI=0;});
    listen($('go-place'),'click',()=>{
      const b=this.destination;if(!b)return;
      const goal=b.entry??toWorld(b,0,frontAt(b,this.session.layout)+1.4);
      this.session.command({type:'walk',...goal});this.closePanels();
    });
    listen($('coffee-action'),'click',()=>this.session.command({type:'coffee'}));
    listen($('beach-action'),'click',()=>this.session.command({type:'beach'}));
    listen($('cancel-action'),'click',()=>this.session.command({type:'cancel'}));
    listen($('world-action'),'click',()=>{
      $('world-choice').hidden=true;
      if(this.choice){void this.music.unlock();this.session.command(this.choice);this.choice=null;}
    });
    listen($('world-dismiss'),'click',()=>{$('world-choice').hidden=true;this.choice=null;});
    const canvas=this.controls.domElement;
    let press=null;
    listen(canvas,'pointerdown',e=>{
      if(!e.isPrimary||e.button!==0){press=null;return;}
      if(this.active&&!this.buildLot)press={id:e.pointerId,x:e.clientX,y:e.clientY};
    });
    listen(canvas,'pointermove',e=>{if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>5)press=null;});
    listen(canvas,'pointercancel',()=>{press=null;});
    listen(canvas,'pointerup',e=>{
      const tap=press;press=null;
      if(tap&&tap.id===e.pointerId&&this.active&&!this.buildLot)this.walkAtPointer(e);
    });
    listen($('build-open'),'click',()=>{
      const open=$('build-pane').hidden;this.closePanels();
      if(!open||!this.session?.owner||!this.session.ready)return;
      const local=this.session.actors.get(this.session.id),near=this.session.near(local);
      this.returnOffset=this.camera.position.clone().sub(this.controls.target);
      $('build-pane').hidden=false;this.selectLot(this.editable.includes(near)?near:this.cafe);
    });
    listen($('build-lot'),'change',()=>this.selectLot(this.editable.find(b=>b.id===$('build-lot').value)));
    listen($('wall-offset'),'input',()=>{this.notice('');this.preview();});
    listen($('apply-wall'),'click',()=>this.commitWall());
    listen($('undo-wall'),'click',()=>this.commitWall(true));
    const grip=$('wall-grip');
    listen(grip,'pointerdown',e=>{
      if(!this.buildLot||this.drag||e.button!==0)return;
      const start=this.pointerZ(e);if(start===null)return;
      e.preventDefault();this.notice('');grip.setPointerCapture(e.pointerId);
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
  walkAtPointer(e){
    if(!this.session?.ready)return;
    $('world-choice').hidden=true;this.choice=null;
    const rect=this.controls.domElement.getBoundingClientRect();
    const eye=this.camera.position.clone(),t=this.cameraFraction();
    this.camera.position.lerp(this.controls.target,1-t);this.camera.updateMatrixWorld();
    this.ray.setFromCamera({x:2*(e.clientX-rect.left)/rect.width-1,y:1-2*(e.clientY-rect.top)/rect.height},this.camera);
    this.camera.position.copy(eye);this.camera.updateMatrixWorld();
    const ray=this.ray.ray,pt=this.rayPoint;
    const pick=this.pickAction(ray);
    if(pick){
      this.choice=pick.command;
      const menu=$('world-choice');$('world-action').textContent=pick.label;menu.hidden=false;
      menu.style.left=Math.max(6,Math.min(innerWidth-menu.offsetWidth-6,e.clientX+6))+'px';
      menu.style.top=Math.max(6,Math.min(innerHeight-menu.offsetHeight-6,e.clientY-menu.offsetHeight-5))+'px';
      return;
    }
    // Intersect the sampled island floor. The aim ignores scenery above it.
    let lo=0;
    for(let hi=.5;hi<Math.min(1000,this.island.size);hi+=Math.max(.5,hi*.025)){
      ray.at(hi,pt);
      if(pt.y>floorAt(this.island,this.plots,pt.x,pt.z,this.session.layout)){lo=hi;continue;}
      let end=hi;for(let j=0;j<12;j++){const mid=(lo+end)/2;ray.at(mid,pt);
        if(pt.y>floorAt(this.island,this.plots,pt.x,pt.z,this.session.layout))lo=mid;else end=mid;}
      ray.at(end,pt);this.session.command({type:'walk',x:pt.x,z:pt.z});return;
    }
  }
  pickAction(ray){
    const s=this.session,local=s.actors.get(s.id);let best=null,depth=Infinity;
    const offer=(p,radius,command,label)=>{
      if(ray.distanceSqToPoint(p)>radius*radius)return;
      const distance=ray.origin.distanceTo(p);if(distance>=depth)return;
      if(this.plots.some(b=>b.id!==this.openRoof&&cameraClearance(ray.origin,p,{...b,height:5})<1))return;
      depth=distance;best={command,label};
    };
    if(!local?.outing)for(const [id,m] of this.meshes){
      if(!id.startsWith('resident'))continue;
      const a=s.actors.get(id);if(!a||a.invitedBy)continue;
      const command={type:'coffee',friend:id},label='Invite '+neighborName(id)+' for coffee';
      for(const h of [.55,1.02,1.48])offer(this.point.set(m.position.x,m.position.y+h,m.position.z),.37,command,label);
    }
    const b=this.destinations.find(b=>b.id===this.openRoof);
    if(b?.cafe&&!local?.outing){
      for(const x of [-1.7,0,1.7]){
        const q=toWorld(b,x,-3.14);
        offer(this.point.set(q.x,b.y+.93,q.z),1.05,{type:'coffee'},'Order two coffees');
      }
    }
    if(b)for(const q of stationsFor(b)){
      const y=floorAt(this.island,this.plots,q.x,q.z,s.layout);
      const label=q.part?'Play '+q.part:q.action==='dance'?'Dance':names[b.kind];
      offer(this.point.set(q.x,y+.55,q.z),.70,{type:'furniture',lot:b.id,index:q.index},label);
    }
    return best;
  }
  advance(now=performance.now()){
    if(!this.session)return;
    const dt=Math.min(.15,Math.max(0,(now-this.lastAdvance)/1000));this.lastAdvance=now;
    if(this.active)this.input();this.session.tick(dt);
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
    $('street-panel').classList.add('building');
    $('build-open').textContent='Done building';this.nextUI=0;
    $('wall-label').textContent=b.cafe?'Partition':'Front wall';this.notice('');
    const eye=toWorld(b,4,-8);
    this.controls.target.set(b.x,b.y+.35,b.z);this.camera.position.set(eye.x,b.y+11,eye.z);
    const fit=Math.max(1,.89/this.camera.aspect);
    this.camera.position.sub(this.controls.target).multiplyScalar(fit).add(this.controls.target);
    this.controls.update();this.resetPreview();this.render();
  }
  resetPreview(){
    if(!this.buildLot)return;
    const state=wallState(this.session.layout,this.buildLot);
    $('wall-offset').value=state.wall;
    $('undo-wall').disabled=!state.undo.length;
    this.preview();
  }
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
    const lot=this.buildLot;if(!lot)return;
    const value=Number($('wall-offset').value),current=wallState(this.session.layout,lot).wall;
    const {offset,reason}=value===current?{offset:current}:this.session.limitFor(lot,value);
    $('wall-readout').textContent=value.toFixed(1)+' m';
    const limit=$('wall-limit');limit.hidden=!reason;
    if(reason){
      const message=(reason==='parcel'?'Lot boundary':'Someone is in the way')+' · Wall stops at '+offset.toFixed(1)+' m';
      if(limit.textContent!==message)limit.textContent=message;
    }
    this.previewOffset=offset;
    this.art.preview(lot,offset,offset!==current);
    this.positionGrip();
  }
  positionGrip(){
    const b=this.buildLot,offset=this.previewOffset;
    const p=toWorld(b,-b.w*.25,(b.cafe?0:b.d/2)+offset);
    const projected=this.point.set(p.x,b.y+2.25,p.z).project(this.camera),r=this.controls.domElement.getBoundingClientRect();
    const grip=$('wall-grip');grip.hidden=projected.z< -1||projected.z>1;
    grip.style.left=(r.left+(projected.x+1)*r.width/2)+'px';grip.style.top=(r.top+(1-projected.y)*r.height/2)+'px';
  }
  closePanels(){
    for(const id of ['build-pane','social-pane','directions-pane','wall-grip','world-choice'])$(id).hidden=true;
    if(this.buildLot){
      this.drag=null;this.buildLot=null;this.art.preview(null,0,false);
      $('street-panel').classList.remove('building');
      $('build-open').textContent='Build';this.clearInput();this.nextUI=0;
      this.camera.position.copy(this.controls.target).add(this.returnOffset);this.controls.update();
    }
  }
  clearInput(){this.sprint=false;this.keys?.clear();this.joy={x:0,z:0};this.session?.setInput(0,0);}
  use(){if(!this.session?.ready)return;void this.music.unlock();this.session.use();}
  activate(){
    if(!this.art)return false;
    if(!this.session){
      this.session=new StreetSession(this.island,this.plots,t=>this.notice(t),this.town);
      this.lastAdvance=performance.now();
      this.timer=setInterval(()=>{const now=performance.now();
        if(document.hidden||now-this.lastAdvance>120)this.advance(now);
      },60);
    }
    this.active=true;this.closePanels();this.clearInput();this.nextUI=0;
    document.body.classList.add('in-street');$('street-panel').hidden=false;$('street-note').textContent='';
    $('build-open').hidden=!this.session.owner;$('owner-room').hidden=!this.session.owner;$('invite-url').hidden=true;
    const p=this.session.actors.get(this.session.id)||this.session.spawn;
    const y=floorAt(this.island,this.plots,p.x,p.z,this.session.layout),off=toWorld(this.cafe,7.7,7.7);
    this.controls.minDistance=2.6;this.controls.maxDistance=45;this.controls.enablePan=false;
    this.camera.far=650;this.camera.near=.13;this.camera.updateProjectionMatrix();
    this.controls.target.set(p.x,y+1.48,p.z);this.camera.position.set(p.x+off.x-this.cafe.x,y+6.4,p.z+off.z-this.cafe.z);
    this.controls.update();this.render();return true;
  }
  deactivate(){if(!this.active)return;this.active=false;this.walkMarker.visible=false;this.clearInput();this.closePanels();this.art.update({x:Infinity,z:Infinity},this.session.layout);
    document.body.classList.remove('in-street');$('street-panel').hidden=true;
    this.controls.enablePan=true;this.controls.minDistance=8;this.controls.maxDistance=4200;
    this.camera.far=9000;this.camera.near=1;this.camera.updateProjectionMatrix();}
  input(){
    if(this.buildLot){this.session.setInput(0,0);return;}
    const keys=this.keys,down=(a,b)=>Number(keys.has(a)||keys.has(b));
    const forward=down('KeyW','ArrowUp')-down('KeyS','ArrowDown')+this.joy.z;
    const side=down('KeyD','ArrowRight')-down('KeyA','ArrowLeft')+this.joy.x;
    const dx=this.controls.target.x-this.camera.position.x,dz=this.controls.target.z-this.camera.position.z,n=Math.hypot(dx,dz)||1;
    const pace=this.sprint?1:.73;
    this.session.setInput(pace*(forward*dx-side*dz)/n,pace*(forward*dz+side*dx)/n);
  }
  cameraFraction(){
    if(!this.active||this.buildLot)return 1;
    const eye=this.camera.position,at=this.controls.target;
    let limit=1;
    for(const b of this.plots){
      const offset=hasEditableFront(b)?wallState(this.session.layout,b).wall:0;
      const center=toWorld(b,0,offset/2);
      limit=Math.min(limit,cameraClearance(at,eye,{...b,...center,d:b.d+offset,height:b.cafe?5.42:4.82}));
    }
    const x0=Math.floor(Math.min(at.x,eye.x)/32),x1=Math.floor(Math.max(at.x,eye.x)/32);
    const z0=Math.floor(Math.min(at.z,eye.z)/32),z1=Math.floor(Math.max(at.z,eye.z)/32);
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)
      for(const b of this.island.footprintCells.get(x+','+z)||[])limit=Math.min(limit,cameraClearance(at,eye,b));
    return limit<1?Math.max(.02,limit-.16/Math.max(1,at.distanceTo(eye))):1;
  }
  render(now=performance.now()){
    const s=this.session;if(!s||!this.active)return;
    const local=s.actors.get(s.id);if(!local)return;
    const dt=Math.max(0,Math.min(.18,(now-(this.lastRender??now))/1000));this.lastRender=now;
    for(const [id,a] of s.actors){
      let mesh=this.meshes.get(id);
      if(!mesh){const npc=id.startsWith('resident');mesh=avatar(id===s.id?'#c55b61':npc?(id==='resident1'?'#94799b':'#659681'):'#6687bd',id==='resident1'?'#996941':'#d9a779');this.scene.add(mesh);this.meshes.set(id,mesh);}
      const pose=presentWalker(s,a,mesh.userData.motion??={},now,dt);
      const y=floorAt(this.island,this.plots,pose.x,pose.z,s.layout);
      mesh.position.set(pose.x,y,pose.z);mesh.rotation.y=pose.yaw;
      mesh.setStride(pose.distance,dt,!!a.activity,!!a.cup,a.outing==='chat'||!!a.invitedBy);
      const seated=['sit','dine','relax','piano'].includes(a.activity);
      mesh.setSeated(seated,a.part,s.time);mesh.scale.y=a.activity==='train'?.86+.14*Math.sin(s.time*4):1;
      mesh.rotation.z=(a.activity==='piano'||a.activity==='dance')?.09*Math.sin(s.time*6):0;
    }
    for(const [id,m] of this.meshes)if(!s.actors.has(id)){this.scene.remove(m);disposeGroup(m);this.meshes.delete(id);}
    const m=this.meshes.get(s.id),target=this.controls.target;
    if(this.buildLot)this.positionGrip();
    else{
      this.camera.position.x+=m.position.x-target.x;this.camera.position.y+=m.position.y+1.48-target.y;this.camera.position.z+=m.position.z-target.z;
      target.set(m.position.x,m.position.y+1.48,m.position.z);
    }
    this.openRoof=this.art.update(m.position,s.layout,this.camera.position,this.buildLot?.id);
    this.walkMarker.visible=!this.buildLot&&local.walking===true&&Array.isArray(local.goal);
    if(this.walkMarker.visible){
      const [x,z]=local.goal;this.walkMarker.position.set(x,floorAt(this.island,this.plots,x,z,s.layout)+.20,z);
      this.walkMarker.scale.setScalar(1+.075*Math.sin(now*.007));
    }
    this.art.updateMeters(s.time,s.actors.values());
    const near=s.near(local);if(near?.kind==='club')this.music.play(s.time,s.actors.values());
    if(this.nextUI>now)return;this.nextUI=now+150;
    if(this.buildLot&&Number($('wall-offset').value)!==wallState(s.layout,this.buildLot).wall)this.preview();
    $('place').textContent=this.buildLot?places[this.buildLot.kind][0]:near?places[near.kind][0]:'Harbor Town';
    $('walk-hint').textContent=this.buildLot?'Drag the wall handle, or set an offset below.':
      'Click ground, people or furniture · WASD to steer · Shift to jog · Drag to orbit';
    const friend=neighborName(local.friend),outing=local.outing,coffee=$('coffee-action');
    coffee.hidden=!!this.buildLot||(!outing&&near?.kind!=='cafe')||!!outing&&!['carry','chat','bay'].includes(outing);
    coffee.disabled=!s.ready||(!s.owner&&!s.connected);
    coffee.textContent=outing==='carry'?'Join '+friend+' at Harbor Green':outing==='bay'?'Finish visit':outing==='chat'?'Finish coffee':'Coffee with a neighbor';
    $('beach-action').hidden=!!this.buildLot||outing!=='chat';
    const status={beach:'Walking to the beach with '+friend,bay:friend+' · “You can see the café from down here.”',counter:'Walking to the café counter',brewing:'Preparing two coffees',carry:'Two coffees ready · '+friend+' is meeting you at Harbor Green',
      garden:'Taking coffee to Harbor Green',waiting:'Waiting for '+friend,chat:friend+(local.visits>1?' · “Our usual spot. Walk to the beach again?”':' · “Want to take the path down to the water?”')};
    const label=$('live-action'),text=local.feedback||status[outing]||(local.walking?'Walking to your destination':'');
    label.hidden=!text||!!this.buildLot;label.querySelector('span').textContent=text;
    $('cancel-action').hidden=!local.walking&&!outing||outing==='chat'||outing==='bay';
    const waypoint=$('waypoint');waypoint.hidden=!this.destination;
    if(this.destination){const b=this.destination,p=b.entry??toWorld(b,0,frontAt(b,s.layout)+1.6),dx=p.x-local.x,dz=p.z-local.z,dist=Math.hypot(dx,dz);
      const heading=Math.atan2(dx,dz)-Math.atan2(this.controls.target.x-this.camera.position.x,this.controls.target.z-this.camera.position.z);
      $('bearing').style.transform='rotate('+-heading+'rad)';$('range').textContent=places[b.kind][0]+' · '+(dist<2.5?'at the entrance':Math.round(dist)+' m');}
    const people=[...s.actors.keys()].filter(id=>!id.startsWith('resident')).length;
    $('party').textContent=s.error?'Room unavailable':s.owner?(people>1?people+' players':'Your street'):s.connected?people+' players':'Waiting for the owner';
    $('build-open').hidden=!s.owner;$('owner-room').hidden=!s.owner;
    const spot=s.station(local,near),use=$('use-place');use.hidden=!!this.buildLot||!!outing||(!spot&&!local.activity);use.disabled=!s.ready||(!s.owner&&!s.connected);
    if(near)use.textContent=local.part?'Stop playing '+local.part:local.activity?'Finish '+({train:'workout',relax:'resting',sit:'sitting',dine:'dining',dance:'dancing'}[local.activity]||local.activity):spot?.part?'Play '+spot.part:spot?.action==='dance'?'Dance':names[near.kind];
    $('undo-wall').disabled=!this.buildLot||!wallState(s.layout,this.buildLot).undo.length;$('list-street').checked=s.listed;
    if(this.browsing&&!$('social-pane').hidden)this.showRooms();
  }
  dispose(){this.deactivate();clearInterval(this.timer);this.abort?.abort();this.music?.dispose();this.session?.dispose();
    for(const m of this.meshes?.values()||[]){this.scene.remove(m);disposeGroup(m);}this.art?.dispose();if(this.walkMarker){this.scene.remove(this.walkMarker);disposeGroup(this.walkMarker);}this.clearExteriors();}
}
