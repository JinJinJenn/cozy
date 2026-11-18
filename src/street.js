import {neighborName} from './street-activities.js';
import {mealStation} from './home-meals.js';
import {tvChannels} from './home-fixtures.js';
import {presentWalker} from './street-motion.js';
import * as THREE from 'three';
import {avatar,disposeGroup,places,streetArt,townExteriors} from './street-art.js';
import {cameraClearance,floorAt,gardenForStreet,frontAt,hasEditableFront,plotsForStreet,shellBounds,toRoom,toWorld,walkable,wallState} from './street-world.js';
import {homeAt} from './home-plan.js';
import {stationsFor,StreetSession} from './street-session.js';
import {StreetMusic} from './street-music.js';
import {vehicleArt} from './vehicle-art.js';
import {TerraceEditor} from './terrace-editor.js';

const $=id=>document.getElementById(id);
const names={home:'Sit on the sofa',wayside:'Sit on the bench',terrace:'Sit at the terrace table',garden:'Sit on the bench',cafe:'Switch café lanterns',restaurant:'Take a table',club:'Join the music',spa:'Relax',gym:'Work out',cottage:'Sit down',house:'Sit down'};
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
    this.destinations=[...this.plots,gardenForStreet(this.cafe),...(island.townSquare?[island.townSquare]:[]),...island.homes];
    $('destination').replaceChildren(new Option('Choose a place',''),...this.destinations.map(b=>new Option(b.name||places[b.kind][0],b.kind==='home'?b.id:b.kind)));
    const listen=(el,type,fn)=>el.addEventListener(type,fn,{signal:this.abort.signal});
    const townURL=new URL('.',location.href);
    const params=new URLSearchParams(location.search);
    for(const key of ['net','v'])if(params.has(key))townURL.searchParams.set(key,params.get(key));
    $('public-street').href=townURL.href;
    townURL.searchParams.set('space','personal');$('personal-street').href=townURL.href;
    this.terraceEditor=new TerraceEditor(this,listen);
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
      if(!this.active){if(e.code==='Escape')$('map-travel').hidden=true;return;}
      if(e.code==='ShiftLeft'||e.code==='ShiftRight')this.sprint=true;
      if(e.code==='Escape'){
        const panelOpen=['world-choice','build-pane','directions-pane','social-pane'].some(id=>!$(id).hidden);
        this.closePanels();
        if(!panelOpen){
          this.cameraFocus=null;
          if(this.session?.actors.get(this.session.id)?.walking)this.session.command({type:'cancel'});
        }
        return;
      }
      if(e.target.matches('input,select,textarea'))return;
      if(e.code==='Enter'&&!e.target.closest('button,a')){e.preventDefault();this.cameraFocus=null;}
      if(directions.has(e.code)){e.preventDefault();this.cameraFocus=null;$('world-choice').hidden=true;this.keys.add(e.code);this.input();}
      if(e.code==='KeyE'&&!e.repeat&&!this.buildLot){e.preventDefault();this.use();}
    });
    listen(window,'keyup',e=>{this.keys.delete(e.code);if(e.code.startsWith('Shift'))this.sprint=false;if(this.active)this.input();});listen(window,'blur',()=>this.clearInput());
    listen($('use-place'),'click',()=>this.use());
    $('tv-channel').replaceChildren(...tvChannels.map((name,i)=>new Option(name,String(i))));
    listen($('tv-channel'),'change',()=>{
      const s=this.session,lot=s.actors.get(s.id)?.using?.lot;
      if(lot)s.command({type:'tv-channel',lot,channel:Number($('tv-channel').value)});
    });
    listen($('directions-open'),'click',()=>{const open=$('directions-pane').hidden;this.closePanels();$('directions-pane').hidden=!open;});
    listen($('destination'),'change',()=>{this.destination=this.destinations.find(b=>(b.kind==='home'?b.id:b.kind)===$('destination').value);$('go-place').disabled=$('jump-place').disabled=!this.destination;
      $('home-invite').hidden=this.destination?.kind!=='house';
      $('dinner-visit').hidden=this.destination?.kind!=='restaurant';this.nextUI=0;});
    listen($('dinner-visit'),'click',()=>{this.session.command({type:'book-dinner'});this.closePanels();});
    for(const dish of ['chowder','fish'])listen($('order-'+dish),'click',()=>this.session.command({type:'order-meal',dish}));
    listen($('home-invite'),'click',()=>{this.session.command({type:'visit-bluebell'});this.closePanels();});
    const travel=cmd=>{this.cameraFocus=null;this.clearInput();this.session.command(cmd);this.closePanels();};
    listen($('jump-place'),'click',()=>{if(this.destination)travel({type:'teleport',place:this.destination.id});});
    for(const kind of ['car','bike'])listen($('take-'+kind),'click',()=>travel({type:'ride',vehicle:kind}));
    listen($('go-place'),'click',()=>{
      const b=this.destination;if(!b)return;
      const goal=b.inside??b.entry??toWorld(b,0,frontAt(b,this.session.layout)+1.4);
      travel({type:'walk',...goal});
    });
    listen($('coffee-action'),'click',()=>this.session.command({type:this.session.actors.get(this.session.id)?.homeVisit?'cancel':'coffee'}));
    listen($('beach-action'),'click',()=>this.session.command({type:'beach'}));
    listen($('patio-coffee'),'click',()=>this.session.command({type:'terrace-coffee',lot:$('patio-destination').value}));
    listen($('cancel-action'),'click',()=>this.session.command({type:'cancel'}));
    listen($('reconnect-street'),'click',()=>{if(!this.session.owner&&!this.session.connected)location.reload();});
    listen($('world-action'),'click',()=>{
      $('world-choice').hidden=true;
      if(this.choice){void this.music.unlock();this.cameraFocus=null;this.session.command(this.choice);this.choice=null;}
    });
    listen($('world-jump'),'click',()=>{if(this.aimPoint)travel({type:'teleport',...this.aimPoint});});
    listen($('world-look'),'click',()=>{this.cameraFocus=this.aimFocus||this.aimPoint;this.closePanels();this.controls.domElement.focus({preventScroll:true});});
    listen($('world-dismiss'),'click',()=>{$('world-choice').hidden=true;this.choice=null;});
    const canvas=this.controls.domElement;
    const clearHover=()=>{clearTimeout(this.hoverTimer);canvas.style.cursor='';canvas.removeAttribute('title');};
    listen(canvas,'pointerleave',clearHover);
    listen(canvas,'wheel',clearHover);
    listen($('map-dismiss'),'click',()=>{$('map-travel').hidden=true;});
    listen($('map-jump'),'click',async()=>{
      const destination=this.mapDestination;
      if(!destination)return;
      $('walk-street').click();
      const s=this.session;
      await s.start;
      if(!s.closed&&this.active&&s.ready)s.command({type:'teleport',...destination});
    });
    let press=null;
    listen(canvas,'contextmenu',e=>e.preventDefault());
    listen(canvas,'pointerdown',e=>{
      clearHover();
      if(!e.isPrimary||![0,2].includes(e.button)){press=null;return;}
      if(!this.buildLot||this.terraceEditor.active){
        $('world-choice').hidden=true;$('map-travel').hidden=true;
        press={id:e.pointerId,x:e.clientX,y:e.clientY,button:e.button,at:e.timeStamp};
      }
    });
    listen(canvas,'pointermove',e=>{
      if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>5)press=null;
      clearHover();
      if(e.buttons||e.pointerType!=='mouse'||!this.active||this.buildLot||!$('world-choice').hidden)return;
      const point={clientX:e.clientX,clientY:e.clientY};
      this.hoverTimer=setTimeout(()=>{
        if(!this.active||this.buildLot||!this.session?.ready||!this.session.actors.has(this.session.id))return;
        const ray=this.pointerRay(point);
        const pick=this.pickAction(ray,false,this.floorPoint(ray,Math.min(1000,this.island.size)));
        if(pick){canvas.style.cursor='pointer';canvas.title=pick.label||pick.followLabel;}
      },90);
    });
    listen(canvas,'pointercancel',()=>{press=null;});
    listen(canvas,'pointerup',e=>{
      const tap=press;press=null;
      if(tap&&tap.id===e.pointerId&&tap.button===e.button&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)<=5){
        if(!this.active)this.mapAtPointer(e);
        else if(this.terraceEditor.active){if(tap.button===0)this.terraceEditor.aim(e);}
        else if(!this.buildLot)this.walkAtPointer(e,tap.button===2||e.pointerType==='touch'&&e.timeStamp-tap.at>=450);
      }
    });
    listen($('build-open'),'click',()=>{
      if(this.session?.space==='public'){
        const url=new URL($('personal-street').href);url.searchParams.set('build','1');location.assign(url);return;
      }
      const open=$('build-pane').hidden;this.closePanels();
      if(!open||!this.session?.owner||!this.session.ready)return;
      const local=this.session.actors.get(this.session.id),near=this.session.near(local);
      this.returnOffset=this.camera.position.clone().sub(this.controls.target);
      $('build-pane').hidden=false;this.selectLot(this.editable.includes(near)?near:this.cafe);
    });
    listen($('build-lot'),'change',()=>this.selectLot(this.editable.find(b=>b.id===$('build-lot').value)));
    listen($('wall-offset'),'input',()=>{this.notice('');this.preview();});
    listen($('side-offset'),'input',()=>{this.notice('');this.preview();});
    listen($('apply-wall'),'click',()=>this.commitWall());
    listen($('undo-wall'),'click',()=>this.commitWall(true));
    const grip=$('wall-grip');
    listen(grip,'pointerdown',e=>{
      if(!this.buildLot||this.drag||e.button!==0)return;
      const start=this.pointerRoom(e);if(start===null)return;
      e.preventDefault();this.notice('');grip.setPointerCapture(e.pointerId);
      this.drag={id:e.pointerId,start,offset:Number($('wall-offset').value),side:Number($('side-offset').value)};
    });
    listen(grip,'pointermove',e=>this.dragWall(e));
    listen(grip,'pointerup',e=>{
      if(this.drag?.id!==e.pointerId)return;
      this.dragWall(e);this.drag=null;
      if(this.previewChanged())this.commitWall();
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
  pointerRay(e){
    const rect=this.controls.domElement.getBoundingClientRect();
    const eye=this.camera.position.clone(),t=this.cameraFraction();
    this.camera.position.lerp(this.controls.target,1-t);this.camera.updateMatrixWorld();
    this.ray.setFromCamera({x:2*(e.clientX-rect.left)/rect.width-1,y:1-2*(e.clientY-rect.top)/rect.height},this.camera);
    this.camera.position.copy(eye);this.camera.updateMatrixWorld();
    return this.ray.ray;
  }
  floorPoint(ray,range){
    const pt=this.rayPoint,layout=this.session?.layout||{};
    let lo=0;
    for(let hi=.5;hi<range;hi+=Math.max(.5,hi*.025)){
      ray.at(hi,pt);
      if(pt.y>floorAt(this.island,this.plots,pt.x,pt.z,layout)){lo=hi;continue;}
      let end=hi;for(let j=0;j<12;j++){const mid=(lo+end)/2;ray.at(mid,pt);
        if(pt.y>floorAt(this.island,this.plots,pt.x,pt.z,layout))lo=mid;else end=mid;}
      ray.at(end,pt);return {x:pt.x,z:pt.z};
    }
  }
  mapAtPointer(e){
    const p=this.floorPoint(this.pointerRay(e),this.camera.far);
    const b=p&&homeAt(this.island,p),layout=this.session?.layout||{};
    this.mapDestination=b?{place:b.id}:p&&walkable(this.island,this.plots,layout,p)?p:null;
    const jump=$('map-jump'),menu=$('map-travel');
    jump.disabled=!this.mapDestination;jump.textContent=b?'Visit '+b.name:this.mapDestination?'Teleport here':'Choose clear ground';
    menu.hidden=false;this.placeMenu(menu,e);
  }
  walkAtPointer(e,context=false){
    if(!this.session?.ready)return;
    $('world-choice').hidden=true;this.choice=null;
    const ray=this.pointerRay(e),point=this.floorPoint(ray,Math.min(1000,this.island.size));
    const pick=this.pickAction(ray,context,point);
    if(pick){this.showWorldChoice(e,pick,context);return;}
    if(point){
      const riding=this.session.actors.get(this.session.id)?.vehicle;
      const command={type:'walk',...point};
      if(context||riding)this.showWorldChoice(e,{command,label:riding?'Get out and walk here':'Walk here',point},context);
      else{this.cameraFocus=null;this.session.command(command);}return;
    }
  }
  showWorldChoice(e,pick,context){
    this.choice=pick.command;this.aimPoint=pick.point;this.aimFocus=pick.focus;
    const menu=$('world-choice');$('world-action').textContent=pick.label;
    $('world-jump').hidden=!context;$('world-look').hidden=!context&&!pick.focus;
    $('world-action').hidden=!pick.command;
    $('world-look').textContent=pick.followLabel||'Look here';
    menu.hidden=false;this.placeMenu(menu,e);
  }
  placeMenu(menu,e){
    menu.style.left=Math.max(6,Math.min(innerWidth-menu.offsetWidth-6,e.clientX+6))+'px';
    menu.style.top=Math.max(6,Math.min(innerHeight-menu.offsetHeight-6,e.clientY-menu.offsetHeight-5))+'px';
  }
  pickAction(ray,context,ground){
    const s=this.session,local=s.actors.get(s.id);
    const range=ground?Math.hypot(ground.x-ray.origin.x,ground.z-ray.origin.z,
      floorAt(this.island,this.plots,ground.x,ground.z,s.layout)-ray.origin.y)+.25:Math.min(1000,this.island.size);
    let best=null,depth=range;
    const offer=(p,radius,command,label,focus,followLabel)=>{
      if(ray.distanceSqToPoint(p)>radius*radius)return;
      const distance=ray.origin.distanceTo(p);if(distance>=depth)return;
      if(this.plots.some(b=>b.id!==this.openRoof&&cameraClearance(ray.origin,p,shellBounds(b,s.layout))<1))return;
      depth=distance;best={command,label,focus,followLabel,point:command?.type==='walk'?{x:command.x,z:command.z}:{x:p.x,z:p.z}};
    };
    for(const [id,m] of this.meshes){
      const invite=id.startsWith('resident')&&!local?.outing&&!local?.vehicle&&!s.actors.get(id)?.invitedBy;
      if(!invite&&!context)continue;
      const command=invite?{type:'coffee',friend:id}:null,label=invite?'Invite '+neighborName(id)+' for coffee':'';
      const followLabel='Follow '+(id===s.id?'me':id.startsWith('resident')?neighborName(id):'player');
      for(const h of [.55,1.02,1.48])offer(this.point.set(m.position.x,m.position.y+h,m.position.z),.37,command,label,{actor:id},followLabel);
    }
    for(const [i,person] of s.town.people.entries()){
      if(!person.visible)continue;
      const p=this.point.copy(person.position);p.y+=.93;
      if(ray.distanceSqToPoint(p)>.68*.68)continue;
      offer(p,.68,null,'',{resident:i},'Follow '+(s.town.current[i]?.name||'resident'));
    }
    const b=this.destinations.find(b=>b.id===this.openRoof);
    if(b?.cafe&&!local?.outing){
      for(const x of [-1.7,0,1.7]){
        const q=toWorld(b,x,-3.14);
        offer(this.point.set(q.x,b.y+.93,q.z),1.05,{type:'coffee'},'Order two coffees');
      }
    }
    for(const place of [b,...s.terraceLots(),...s.waysideNear(local,30)].filter(Boolean))for(const base of stationsFor(place)){
      const q=mealStation(s,place.id,base,local);if(!q||q.alternate)continue;
      const y=floorAt(this.island,this.plots,q.x,q.z,s.layout);
      if(place.kind==='terrace'&&local?.outing==='carry'&&!local.meetingTable){
        offer(this.point.set(q.x,y+.55,q.z),.78,{type:'terrace-coffee',lot:place.id},'Share coffee at this table');continue;
      }
      const label=q.label||(q.part?'Play '+q.part:q.action==='dance'?'Dance':names[place.kind]);
      offer(q.target?this.point.set(q.target.x,q.target.y,q.target.z):this.point.set(q.x,y+.55,q.z),q.radius??.55,{type:'furniture',lot:place.id,index:q.index},label);
    }
    // A closed house can be picked across its facade, even at neighborhood zoom.
    // Only the closest hit may replace an actor or furnishing in front of it.
    const end=ray.at(range,this.rayPoint);
    const shell=(b,bounds)=>{
      if(b.id===this.openRoof)return;
      const height=bounds.roofHeight??bounds.height;
      const center=this.point.set(bounds.x,bounds.y+height/2,bounds.z);
      if(ray.distanceSqToPoint(center)>(bounds.w*bounds.w+bounds.d*bounds.d+height*height)*.30)return;
      const hit=cameraClearance(ray.origin,end,bounds,true);
      if(hit>=1||hit*range>=depth)return;
      depth=hit*range;
      const point=b.inside||toWorld(b,0,frontAt(b,s.layout)-1);
      best={command:{type:'walk',...point},label:'Enter '+(b.name||places[b.kind][0]),point};
    };
    for(const home of this.island.homes)shell(home,home);
    for(const venue of this.plots)shell(venue,shellBounds(venue,s.layout));
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
    this.terraceEditor.close();$('terrace-open').hidden=!b.cafe;
    this.clearInput();this.drag=null;this.buildLot=b;$('build-lot').value=b.id;
    $('street-panel').classList.add('building');
    $('build-open').textContent='Done building';this.nextUI=0;
    $('wall-label').textContent=b.cafe?'Partition':'Front wall';this.notice('');
    const corner=b.kind==='house',handle=corner?'Drag corner':'Drag wall';
    $('side-tools').hidden=!corner;$('wall-grip').querySelector('span').textContent=handle;
    $('wall-grip').setAttribute('aria-label',handle);$('wall-grip').title=handle;
    $('apply-wall').textContent=corner?'Resize room':'Move wall and door';
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
    $('side-offset').value=state.side??0;
    $('undo-wall').disabled=!state.undo.length;
    this.preview();
  }
  commitWall(undo=false){
    if(!this.buildLot)return;
    this.session.edit(Number($('wall-offset').value),undo,this.buildLot.id,Number($('side-offset').value));this.resetPreview();
  }
  pointerRoom(e){
    const rect=this.controls.domElement.getBoundingClientRect();
    this.ray.setFromCamera({x:(e.clientX-rect.left)*2/rect.width-1,y:1-(e.clientY-rect.top)*2/rect.height},this.camera);
    this.plane.constant=-(this.buildLot.y+2.25);
    const p=this.ray.ray.intersectPlane(this.plane,this.point);
    return p?toRoom(this.buildLot,p):null;
  }
  dragWall(e){
    if(!this.drag||this.drag.id!==e.pointerId)return;
    const p=this.pointerRoom(e);if(!p)return;
    $('wall-offset').value=Math.round((this.drag.offset+p.z-this.drag.start.z)*2)/2;
    if(this.buildLot.kind==='house')$('side-offset').value=Math.round((this.drag.side+p.x-this.drag.start.x)*2)/2;
    this.preview();
  }
  previewChanged(){
    const state=wallState(this.session.layout,this.buildLot);
    return Number($('wall-offset').value)!==state.wall||Number($('side-offset').value)!==(state.side??0);
  }
  preview(){
    const lot=this.buildLot;if(!lot)return;
    const value=Number($('wall-offset').value),wantedSide=Number($('side-offset').value),state=wallState(this.session.layout,lot);
    const {offset,side=0,reason}=this.previewChanged()?this.session.limitFor(lot,value,wantedSide):{offset:state.wall,side:state.side};
    $('wall-readout').textContent=value.toFixed(1)+' m';
    $('side-readout').textContent=wantedSide.toFixed(1)+' m';
    const limit=$('wall-limit');limit.hidden=!reason;
    if(reason){
      const cause=reason==='parcel'?'Lot boundary':reason==='furniture'?'Leave space for the seats':'Someone is in the way';
      const message=cause+' · '+(lot.kind==='house'?'Front '+offset.toFixed(1)+' m, right '+side.toFixed(1)+' m':'Wall stops at '+offset.toFixed(1)+' m');
      if(limit.textContent!==message)limit.textContent=message;
    }
    this.previewOffset=offset;this.previewSide=side;
    this.art.preview(lot,offset,offset!==state.wall||side!==(state.side??0),side);
    this.positionGrip();
  }
  positionGrip(){
    const b=this.buildLot,offset=this.previewOffset;
    const p=toWorld(b,b.kind==='house'?b.w/2+this.previewSide:-b.w*.25,(b.cafe?0:b.d/2)+offset);
    const projected=this.point.set(p.x,b.y+2.25,p.z).project(this.camera),r=this.controls.domElement.getBoundingClientRect();
    const grip=$('wall-grip');grip.hidden=projected.z< -1||projected.z>1;
    grip.style.left=(r.left+(projected.x+1)*r.width/2)+'px';grip.style.top=(r.top+(1-projected.y)*r.height/2)+'px';
  }
  closePanels(){
    for(const id of ['build-pane','social-pane','directions-pane','wall-grip','world-choice'])$(id).hidden=true;
    if(this.buildLot){
      this.terraceEditor.close();
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
    $('map-travel').hidden=true;
    if(!this.session){
      this.session=new StreetSession(this.island,this.plots,t=>this.notice(t),this.town);
      this.session.start.then(()=>{
        if(!this.session.closed&&this.active&&this.session.canBuild&&new URLSearchParams(location.search).get('build')==='1')$('build-open').click();
      });
      this.lastAdvance=performance.now();this.joinStarted=this.lastAdvance;
      this.timer=setInterval(()=>{const now=performance.now();
        if(document.hidden||now-this.lastAdvance>120)this.advance(now);
      },60);
    }
    this.active=true;this.closePanels();this.clearInput();this.nextUI=0;
    document.body.classList.add('in-street');$('street-panel').hidden=false;$('street-note').textContent='';
    $('build-open').hidden=this.session.space!=='public'&&!this.session.canBuild;$('owner-room').hidden=!this.session.canBuild;$('invite-url').hidden=true;
    $('personal-street').hidden=this.session.space==='personal'&&this.session.owner;
    $('public-street').hidden=this.session.space==='public';
    const p=this.session.actors.get(this.session.id)||this.session.spawn;
    const y=floorAt(this.island,this.plots,p.x,p.z,this.session.layout),off=toWorld(this.cafe,7.7,7.7);
    this.cameraFocus=null;this.controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;this.controls.mouseButtons.MIDDLE=THREE.MOUSE.ROTATE;
    this.controls.minDistance=2.6;this.controls.maxDistance=420;this.controls.enablePan=false;
    this.camera.far=4500;this.camera.near=.13;this.camera.updateProjectionMatrix();
    this.controls.target.set(p.x,y+1.48,p.z);this.camera.position.set(p.x+off.x-this.cafe.x,y+6.4,p.z+off.z-this.cafe.z);
    this.controls.update();this.render();return true;
  }
  deactivate(){if(!this.active)return;this.active=false;this.walkMarker.visible=false;this.clearInput();this.closePanels();this.art.update({x:Infinity,z:Infinity},this.session.layout);
    this.clearExteriors.update({x:Infinity,z:Infinity},{x:0,z:0});
    document.body.classList.remove('in-street');$('street-panel').hidden=true;
    this.controls.enablePan=true;this.controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;this.controls.minDistance=8;this.controls.maxDistance=4200;
    this.camera.far=9000;this.camera.near=1;this.camera.updateProjectionMatrix();}
  input(){
    if(this.buildLot){this.session.setInput(0,0);return;}
    const keys=this.keys,down=(a,b)=>Number(keys.has(a)||keys.has(b));
    const forward=down('KeyW','ArrowUp')-down('KeyS','ArrowDown')+this.joy.z;
    const side=down('KeyD','ArrowRight')-down('KeyA','ArrowLeft')+this.joy.x;
    if(forward||side)this.cameraFocus=null;
    if(this.session.actors.get(this.session.id)?.vehicle){this.session.setInput(Math.max(-1,Math.min(1,side)),Math.max(-1,Math.min(1,forward)));return;}
    const dx=this.controls.target.x-this.camera.position.x,dz=this.controls.target.z-this.camera.position.z,n=Math.hypot(dx,dz)||1;
    const pace=(this.sprint?1:.73)/Math.max(1,Math.hypot(forward,side));
    this.session.setInput(pace*(forward*dx-side*dz)/n,pace*(forward*dz+side*dx)/n);
  }
  cameraFraction(){
    if(!this.active||this.buildLot)return 1;
    const eye=this.camera.position,at=this.controls.target;
    let limit=1;
    for(const b of this.plots)limit=Math.min(limit,cameraClearance(at,eye,shellBounds(b,this.session.layout)));
    const x0=Math.floor(Math.min(at.x,eye.x)/32),x1=Math.floor(Math.max(at.x,eye.x)/32);
    const z0=Math.floor(Math.min(at.z,eye.z)/32),z1=Math.floor(Math.max(at.z,eye.z)/32);
    const tested=new Set();
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
      const key=x+','+z;
      for(const b of [...this.island.footprintCells.get(key)||[],...this.island.homeCells.get(key)||[]]){
        if(b.id===this.openRoof||tested.has(b))continue;tested.add(b);
        limit=Math.min(limit,cameraClearance(at,eye,b));
      }
    }
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
      mesh.setStride(pose.distance,dt,!!a.activity,!!a.cup,a.outing==='chat'||!!a.invitedBy,a.tray);
      const watching=a.activity==='watch';
      const seated=['sit','dine','relax','piano','bathroom','eat','read'].includes(a.activity)||watching;
      mesh.setSeated(seated||a.vehicle==='car',a.part,s.time);mesh.scale.y=a.activity==='train'?.86+.14*Math.sin(s.time*4):1;
      mesh.rotation.z=(a.activity==='piano'||a.activity==='dance')?.09*Math.sin(s.time*6):0;
      mesh.setDomestic(a.activity,s.time,a.using,!!a.bowlFrom,watching?(s.layout.homeTV?.[a.using?.lot]||0):null);
      if(mesh.userData.vehicle!==a.vehicle){
        const old=mesh.userData.ride;if(old){mesh.remove(old);disposeGroup(old);}
        mesh.userData.vehicle=a.vehicle;mesh.userData.ride=a.vehicle?vehicleArt(a.vehicle):null;
        if(mesh.userData.ride)mesh.add(mesh.userData.ride);
      }
      if(a.vehicle){
        const phase=mesh.userData.ride.updateRide(a.speed||0,dt,id===s.id?s.keys.x:(a.steer||0));
        mesh.setRide(a.vehicle,phase);
      }
    }
    for(const [id,m] of this.meshes)if(!s.actors.has(id)){this.scene.remove(m);disposeGroup(m);this.meshes.delete(id);}
    const m=this.meshes.get(s.id),target=this.controls.target;
    if(this.buildLot){if(!this.terraceEditor.active)this.positionGrip();}
    else{
      const focus=this.cameraFocus;
      const tracked=focus?.actor?this.meshes.get(focus.actor):focus?.resident!==undefined?this.town.people[focus.resident]:null;
      if((focus?.actor||focus?.resident!==undefined)&&!tracked?.visible)this.cameraFocus=null;
      const p=this.cameraFocus?(tracked?.position||this.cameraFocus):m.position;
      const y=this.cameraFocus?floorAt(this.island,this.plots,p.x,p.z,s.layout):m.position.y;
      this.camera.position.x+=p.x-target.x;this.camera.position.y+=y+1.48-target.y;this.camera.position.z+=p.z-target.z;
      target.set(p.x,y+1.48,p.z);
    }
    const detailRoof=this.art.update(m.position,s.layout,this.camera.position,this.buildLot?.id);
    this.openRoof=this.clearExteriors.update(m.position,this.camera.position,s)||detailRoof;
    this.walkMarker.visible=!this.buildLot&&local.walking===true&&Array.isArray(local.goal);
    if(this.walkMarker.visible){
      const [x,z]=local.goal;this.walkMarker.position.set(x,floorAt(this.island,this.plots,x,z,s.layout)+.20,z);
      this.walkMarker.scale.setScalar(1+.075*Math.sin(now*.007));
    }
    this.art.updateMeters(s.time,s.actors.values());
    const near=s.near(local);if(near?.kind==='club')this.music.play(s.time,s.actors.values());
    if(this.nextUI>now)return;this.nextUI=now+150;
    if(this.terraceEditor.active)this.terraceEditor.refresh();
    else if(this.buildLot&&this.previewChanged())this.preview();
    $('place').textContent=this.buildLot?places[this.buildLot.kind][0]:near?(near.name||places[near.kind][0]):'Harbor Town';
    $('walk-hint').textContent=this.terraceEditor.active?'':this.buildLot?.kind==='house'?'Drag the corner, or move either wall below.':this.buildLot?'Drag the wall handle, or set an offset below.':
      local.vehicle?'W/S accelerate or reverse · A/D steer · E to get out':this.cameraFocus?'Enter to return to your character · Drag to orbit':
      'Left-click to walk or interact · Right-click for options · Drag to orbit · M for map';
    const friend=neighborName(local.friend),outing=local.outing,coffee=$('coffee-action');
    coffee.hidden=!!this.buildLot||(!outing&&near?.kind!=='cafe')||!!outing&&!['carry','chat','bay'].includes(outing);
    coffee.disabled=!s.ready||(!s.owner&&!s.connected);
    coffee.textContent=outing==='carry'?'Join '+friend+(local.meetingTable?' on the terrace':' at Harbor Green'):outing==='bay'?'Finish visit':outing==='chat'?'Finish coffee':'Coffee with a neighbor';
    if(local.homeVisit)$('coffee-action').textContent='Finish visit';
    $('beach-action').hidden=!!this.buildLot||outing!=='chat'||!!local.homeVisit;
    $('patio-coffee').hidden=!!this.buildLot||outing!=='carry'||!!local.meetingTable||!s.terraceLots().length;
    const selection=$('patio-destination');selection.hidden=$('patio-coffee').hidden||s.terraceLots().length<2;
    if(!selection.hidden){
      const ids=s.terraceLots().map(b=>b.id).join(',');
      if(selection.dataset.ids!==ids){
        const previous=selection.value;selection.dataset.ids=ids;
        selection.replaceChildren(new Option('Any free table',''),...s.terraceLots().map(b=>new Option('Table '+(Number(b.id.split('-')[1])+1),b.id)));
        selection.value=previous;if(selection.selectedIndex<0)selection.selectedIndex=0;
      }
    }else{selection.value='';selection.dataset.ids='';}
    const status={beach:'Walking to the beach with '+friend,bay:friend+' · "You can see the café from down here."',counter:'Walking to the café counter',brewing:'Preparing two coffees',carry:'Two coffees ready · '+friend+(local.meetingTable?' is meeting you on the terrace':' is meeting you at Harbor Green'),
      garden:'Taking coffee to Harbor Green',terrace:'Meeting '+friend+' on the terrace',waiting:'Waiting for '+friend,chat:friend+(local.visits>1?' · "Our usual spot. Walk to the beach again?"':' · "Want to take the path down to the water?"')};
    const homeStatus=local.homeVisit&&({visiting:'Walking to Bluebell House',waiting:'Bea is making tea',chat:'Tea with Bea at Bluebell House'})[outing];
    const meal=local.dish==='fish'?'grilled fish':'chowder';
    const dinnerStatus={'to-dinner':'Walking to your table at Bay Kitchen',menu:'What would you like to eat?',
      ordered:'Your order is in the kitchen',preparing:friend+' is making your '+meal,eating:'Enjoying '+meal+' at Bay Kitchen'};
    const label=$('live-action'),text=local.feedback||homeStatus||dinnerStatus[outing]||status[outing]||(local.walking?'Walking to your destination':'');
    label.hidden=!text||!!this.buildLot;label.querySelector('span').textContent=text;
    for(const dish of ['chowder','fish'])$('order-'+dish).hidden=outing!=='menu';
    $('cancel-action').textContent=outing==='eating'?'Finish meal':outing==='menu'?'Leave table':'Cancel';
    $('cancel-action').hidden=!local.walking&&!outing||outing==='chat'||outing==='bay';
    const waypoint=$('waypoint');waypoint.hidden=!this.destination||this.openRoof===this.destination.id;
    if(this.destination){const b=this.destination,p=b.entry??toWorld(b,0,frontAt(b,s.layout)+1.6),dx=p.x-local.x,dz=p.z-local.z,dist=Math.hypot(dx,dz);
      const heading=Math.atan2(dx,dz)-Math.atan2(this.controls.target.x-this.camera.position.x,this.controls.target.z-this.camera.position.z);
      $('bearing').style.transform='rotate('+-heading+'rad)';$('range').textContent=(b.name||places[b.kind][0])+' · '+(dist<2.5?'at the entrance':Math.round(dist)+' m');}
    const people=[...s.actors.keys()].filter(id=>!id.startsWith('resident')).length;
    $('party').textContent=s.error?'Room unavailable':s.space==='public'?
      (s.owner||s.connected?'Public town · '+people+(people===1?' player':' players'):'Joining public town'):
      s.owner?(people>1?people+' players':'Your street'):s.connected?people+' players':'Waiting for the owner';
    $('reconnect-street').hidden=s.owner||s.connected||!s.ready||now-Math.max(this.joinStarted,s.lastFrame)<12000;
    $('build-open').hidden=s.space!=='public'&&!s.canBuild;$('owner-room').hidden=!s.canBuild;
    if(s.space==='public')$('build-open').textContent='Build at home';
    const spot=s.station(local,near),use=$('use-place');use.hidden=!!this.buildLot||!!outing||(!spot&&!local.activity);use.disabled=!s.ready||(!s.owner&&!s.connected);
    $('tv-remote').hidden=local.activity!=='watch'||!!this.buildLot;
    if(!$('tv-remote').hidden)$('tv-channel').value=String(s.layout.homeTV?.[local.using.lot]||0);
    if(near)use.textContent=local.activity==='eat'?'Pause meal':local.activity==='cook'?'Stop cooking':local.part?'Stop playing '+local.part:local.activity?'Finish '+({train:'workout',relax:'resting',sit:'sitting',dine:'dining',dance:'dancing',rest:'resting',read:'reading',write:'writing',wash:'washing',shower:'showering',bathroom:'bathroom visit',stretch:'stretching'}[local.activity]||local.activity):spot?.label|| (spot?.part?'Play '+spot.part:spot?.action==='dance'?'Dance':names[near.kind]);
    $('undo-wall').disabled=!this.buildLot||!wallState(s.layout,this.buildLot).undo.length;$('list-street').checked=s.listed;
    if(local.vehicle){use.hidden=false;use.textContent=local.vehicle==='car'?'Get out of car':'Get off bike';}
    if(local.activity==='watch')use.textContent='Stop watching';
    if(this.browsing&&!$('social-pane').hidden)this.showRooms();
  }
  dispose(){this.deactivate();$('map-travel').hidden=true;clearInterval(this.timer);clearTimeout(this.hoverTimer);this.controls.domElement.style.cursor='';this.controls.domElement.removeAttribute('title');this.abort?.abort();this.music?.dispose();this.session?.dispose();
    for(const m of this.meshes?.values()||[]){this.scene.remove(m);disposeGroup(m);}this.art?.dispose();if(this.walkMarker){this.scene.remove(this.walkMarker);disposeGroup(this.walkMarker);}this.clearExteriors();}
}
