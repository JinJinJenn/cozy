import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {testNostrRelay} from './test-nostr-relay.mjs';

const {chromium}=createRequire(process.env.PLAYWRIGHT_FROM||import.meta.url)('playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),live=process.argv.includes('--live');
const software=process.argv.includes('--software');
const origin=live?'https://jinjinjenn.github.io/cozy/':'https://travel-'+randomUUID()+'.test/cozy/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE||undefined,
  args:[...(software?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]),'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--mute-audio']});
const relay=testNostrRelay(),errors=[];
const until=(p,fn,arg)=>p.waitForFunction(fn,arg,{polling:80,timeout:45000});
async function profile(){
  const ctx=await browser.newContext({viewport:{width:1050,height:660},deviceScaleFactor:software?.6:1});
  if(software)await ctx.addInitScript(()=>{
    // Give native input and WebRTC a turn between software-rendered frames.
    // Keep CSS coordinates and the game's simulation clock at their normal values.
    const frame=requestAnimationFrame.bind(window);
    window.requestAnimationFrame=fn=>setTimeout(()=>frame(fn),90);
  });
  await ctx.addInitScript(()=>localStorage.setItem('cozy.graphics','low'));await relay(ctx);
  if(!live)await ctx.route(origin+'**',async route=>{
    const file=path.resolve(root,new URL(route.request().url()).pathname.slice(6)||'index.html');
    assert.ok(file.startsWith(root));
    await route.fulfill({body:await readFile(file),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]});
  });
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);
  await until(p,()=>window.__cozy?.street?.session?.ready);return p;
}
const actor=p=>p.evaluate(()=>{const s=window.__cozy.street.session;return s.actors.get(s.id);});
const synced=(p,id,vehicle)=>until(p,({id,vehicle})=>{
  const street=window.__cozy.street,a=street.session.actors.get(id),mesh=street.meshes.get(id);
  return a&&mesh&&(a.vehicle||null)===vehicle&&!!mesh.userData.ride===!!vehicle;
},{id,vehicle});
async function mount(p,kind){await p.locator('#directions-open').click();await p.locator('#take-'+kind).click();}
async function screenAt(p,point){
  return p.evaluate(({x,y,z})=>{
    const s=window.__cozy.street,c=s.camera.clone(),rect=s.controls.domElement.getBoundingClientRect();
    c.position.lerp(s.controls.target,1-s.cameraFraction());c.updateMatrixWorld();
    const v=c.position.clone().set(x,y,z).project(c);
    return {x:(v.x+1)*rect.width/2+rect.left,y:(1-v.y)*rect.height/2+rect.top};
  },point);
}
const pages=[];
try{
  const first=await profile();pages.push(first);
  const second=await profile();pages.push(second);
  await Promise.all(pages.map(p=>until(p,()=>{const s=window.__cozy.street.session;
    return s.owner?s.peers.size>0:s.connected;})));
  const owner=await first.evaluate(()=>window.__cozy.street.session.owner)?first:second;
  const visitor=owner===first?second:first;
  await visitor.bringToFront();
  const clamped=await visitor.evaluate(()=>{
    const c=window.__cozy,{camera,controls}=c.street,eye=camera.position.clone();
    try{
      camera.position.copy(controls.target);camera.position.x+=4;camera.position.z+=3;
      controls.update();const before=camera.position.y;c.render();
      const targetDirection=controls.target.clone().sub(camera.position).normalize();
      return {rise:camera.position.y-before,angle:camera.getWorldDirection(eye.clone()).angleTo(targetDirection)};
    }finally{camera.position.copy(eye);controls.update();}
  });
  assert.ok(clamped.rise>.1&&clamped.angle<.00001,'the first terrain-clamped frame still points at the selected target: '+JSON.stringify(clamped));
  const cameraPose=()=>visitor.evaluate(()=>{const {controls,camera}=window.__cozy.street;
    return {radius:controls.getDistance(),angle:controls.getAzimuthalAngle(),offset:camera.position.clone().sub(controls.target).toArray()};});
  const initial=await cameraPose();
  await visitor.keyboard.press('Period');
  assert.ok(Math.abs((await cameraPose()).angle-initial.angle)>.15);
  await visitor.keyboard.press('Comma');
  assert.ok(Math.abs((await cameraPose()).angle-initial.angle)<.03);
  for(let i=0;i<32;i++)await visitor.keyboard.press('Minus');
  const wide=await cameraPose();
  assert.ok(wide.radius>3000,'street zoom reached the island scale');
  await visitor.keyboard.press('Equal');
  const keyboardZoom=(await cameraPose()).radius;assert.ok(keyboardZoom<wide.radius*.83);
  const surface=await visitor.waitForFunction(()=>{
    const canvas=document.querySelector('#gl'),r=canvas.getBoundingClientRect();
    for(const fy of [.38,.24,.56,.72])for(const fx of [.63,.48,.82,.26]){
      const x=Math.round(r.left+r.width*fx),y=Math.round(r.top+r.height*fy);
      if(document.elementFromPoint(x,y)===canvas)return {x,y};
    }
  },null,{polling:125,timeout:45000});
  const wheelPoint=await surface.jsonValue();await surface.dispose();
  await visitor.mouse.move(wheelPoint.x,wheelPoint.y);
  await visitor.mouse.wheel(0,-160);
  await until(visitor,d=>window.__cozy.street.controls.getDistance()<d*.99,keyboardZoom);
  await visitor.evaluate(async()=>{await window.__cozy.flushChunks();});
  const roof=await visitor.evaluate(()=>{
    const s=window.__cozy.street,rect=s.controls.domElement.getBoundingClientRect();
    const camera=s.camera.clone();camera.position.lerp(s.controls.target,1-s.cameraFraction());camera.updateMatrixWorld();
    for(const b of s.island.homes){
      const point=camera.position.clone().set(b.x,b.y+b.height+.12,b.z);
      if(point.distanceTo(camera.position)<1100)continue;
      const ndc=point.project(camera),x=Math.round(rect.left+(ndc.x+1)*rect.width/2),y=Math.round(rect.top+(1-ndc.y)*rect.height/2);
      if(document.elementFromPoint(x,y)!==s.controls.domElement)continue;
      const ray=s.pointerRay({clientX:x,clientY:y}),ground=s.floorPoint(ray,s.camera.far);
      if(ground&&s.pickAction(ray,true,ground)?.label==='Enter '+b.name)return {x,y,name:b.name};
    }
  });
  assert.ok(roof,'a distant roof is selectable at island scale');
  if(process.env.COZY_WIDE_SHOT)await visitor.screenshot({path:process.env.COZY_WIDE_SHOT,type:'jpeg',quality:92});
  for(const button of ['left','right']){
    await visitor.mouse.click(roof.x,roof.y,{button});
    assert.equal(await visitor.locator('#world-action').innerText(),'Enter '+roof.name);
    assert.equal(await visitor.locator('#world-jump').isVisible(),button==='right');
    await visitor.keyboard.press('Escape');
  }
  await visitor.keyboard.press('Enter');
  assert.ok((await cameraPose()).radius<20,'Enter returns to a character-scale view');
  await visitor.evaluate(offset=>{const s=window.__cozy.street;s.camera.position.fromArray(offset).add(s.controls.target);s.controls.update();},initial.offset);
  console.log('PASS keyboard orbit, keyboard and wheel zoom, and both pointer buttons on',roof.name,'from island scale. Maximum street radius',wide.radius.toFixed(0),'m.');
  const driver=(await actor(visitor)).id,cyclist=(await actor(owner)).id;
  await mount(visitor,'car');await Promise.all(pages.map(p=>synced(p,driver,'car')));
  await mount(owner,'bike');await Promise.all(pages.map(p=>synced(p,cyclist,'bike')));
  // Leave the actual peer connected and pause only its outgoing controls.
  // The host must preserve the ride once the former seven-second limit passes.
  await visitor.evaluate(()=>{window.__cozy.street.session.sendInput=()=>{};});
  try{
    await until(owner,id=>{
      const s=window.__cozy.street.session,last=s.controls.get(id)?.at;
      return performance.now()-last>8000&&s.actors.get(id)?.vehicle==='car';
    },driver);
  }finally{
    await visitor.evaluate(()=>{const s=window.__cozy.street.session;delete s.sendInput;s.sendInput();});
  }
  console.log('PASS driver kept the car through an eight-second input stall on an open connection.');
  if(process.env.COZY_TRAVEL_SHOT)await visitor.screenshot({path:process.env.COZY_TRAVEL_SHOT,type:'jpeg',quality:92});
  const start=await actor(visitor);
  await visitor.keyboard.down('w');
  try{await until(owner,({id,x,z})=>{const a=window.__cozy.street.session.actors.get(id);
    return a.speed>2&&Math.hypot(x-a.x,z-a.z)>2;},start);
    await visitor.keyboard.down('a');
    try{await until(owner,({id,yaw})=>Math.abs(window.__cozy.street.session.actors.get(id).yaw-yaw)>.09,start);}
    finally{await visitor.keyboard.up('a');}
  }finally{await visitor.keyboard.up('w');}
  await visitor.locator('#use-place').click();await Promise.all(pages.map(p=>synced(p,driver,null)));
  const bike=await actor(owner);
  await owner.keyboard.down('w');
  try{await until(visitor,({id,x,z})=>{const s=window.__cozy.street,a=s.session.actors.get(id);
    return a.speed>1&&Math.hypot(x-a.x,z-a.z)>.9&&s.meshes.get(id).userData.ride.children[0].children[0].rotation.x!==0;},bike);}
  finally{await owner.keyboard.up('w');}
  await owner.keyboard.press('e');await Promise.all(pages.map(p=>synced(p,cyclist,null)));
  console.log('PASS guest drove and steered, host cycled, both saw animated vehicles and dismounts.');

  const dest=visitor.locator('#destination');await visitor.locator('#directions-open').click();
  const homeId=await dest.selectOption({label:'Home 58'});await visitor.locator('#jump-place').click();
  await until(visitor,id=>window.__cozy.street.openRoof===id,homeId[0]);
  const arrived=await actor(visitor);
  await until(owner,({id,x,z,travelSeq})=>{const a=window.__cozy.street.session.actors.get(id);
    return a.travelSeq===travelSeq&&Math.hypot(x-a.x,z-a.z)<.1;},arrived);
  // Click the visible lamp (or another reachable furnishing) through the same ray as a player.
  const target=await visitor.evaluate(async id=>{
    const s=window.__cozy.street,b=s.island.homesById.get(id);
    const {stationsFor}=await import('./src/street-session.js');
    const all=stationsFor(b).filter(v=>v.target);
    for(const v of all){
      const c=s.camera.clone();c.position.lerp(s.controls.target,1-s.cameraFraction());c.updateMatrixWorld();
      const point=c.position.clone().set(v.target.x,v.target.y,v.target.z),dir=point.clone().sub(c.position).normalize();
      const hit=s.pickAction(s.ray.ray.clone().set(c.position,dir));
      const ndc=point.project(c);
      if(hit?.command.type==='furniture'&&Math.abs(ndc.x)<.75&&Math.abs(ndc.y)<.61)return {...v.target,label:hit.label};
    }
  },homeId[0]);assert.ok(target,'a visible furnishing');
  const xy=await screenAt(visitor,target);await visitor.mouse.click(xy.x,xy.y);
  await visitor.locator('#world-action').waitFor();assert.equal(await visitor.locator('#world-action').textContent(),target.label);
  assert.equal(await visitor.locator('#world-jump').isVisible(),false);
  await visitor.keyboard.press('Escape');
  await visitor.mouse.click(xy.x,xy.y,{button:'right'});await visitor.locator('#world-look').click();
  await until(visitor,()=>!!window.__cozy.street.cameraFocus);await visitor.keyboard.press('Enter');
  await until(visitor,()=>!window.__cozy.street.cameraFocus);
  for(const button of ['left','right','middle']){
    const before=await visitor.evaluate(()=>window.__cozy.controls.getAzimuthalAngle());
    await visitor.mouse.move(545,260);await visitor.mouse.down({button});await visitor.mouse.move(620,264,{steps:8});await visitor.mouse.up({button});
    await until(visitor,a=>Math.abs(window.__cozy.controls.getAzimuthalAngle()-a)>.02,before);
    assert.equal(await visitor.locator('#world-choice').isVisible(),false);
    assert.equal(!!(await actor(visitor)).walking,false);
  }
  await visitor.keyboard.press('m');await until(visitor,()=>!window.__cozy.street.active);
  await visitor.keyboard.press('m');await until(visitor,()=>window.__cozy.street.active);
  const localMesh=await visitor.evaluate(()=>{const s=window.__cozy.street,m=s.meshes.get(s.session.id);return {x:m.position.x,y:m.position.y+.95,z:m.position.z};});
  const me=await screenAt(visitor,localMesh);await visitor.mouse.click(me.x,me.y,{button:'right'});
  assert.equal(await visitor.locator('#world-look').textContent(),'Follow me');
  await visitor.locator('#world-look').click();await until(visitor,()=>!!window.__cozy.street.cameraFocus?.actor);
  await visitor.keyboard.press('Enter');
  // Find a clear floor point in the current camera view. Exercise both ground
  // buttons with native pointer input and observe the resulting host state.
  let ground;
  for(const [x,y] of [[535,376],[501,360],[600,310],[502,403],[450,381],[560,340],[525,330]]){
    await visitor.mouse.click(x,y,{button:'right'});
    if(await visitor.locator('#world-action').isVisible()&&await visitor.locator('#world-action').textContent()==='Walk here'){
      ground={x,y};break;
    }
  }
  assert.ok(ground,'ground menu');const aim=await visitor.evaluate(()=>window.__cozy.street.aimPoint);
  await visitor.locator('#world-jump').click();
  await until(owner,({id,x,z,seq})=>{const a=window.__cozy.street.session.actors.get(id);return a.travelSeq>seq&&Math.hypot(a.x-x,a.z-z)<1.6;},
    {id:driver,...aim,seq:arrived.travelSeq});
  await visitor.keyboard.press('m');await until(visitor,()=>!window.__cozy.street.active);
  const road=await visitor.evaluate(()=>{
    const s=window.__cozy.street,pt=s.session.spawn;
    const segments=s.island.plan.roads.flatMap(r=>r.pts.slice(1).map(([x,z],i)=>{
      const [px,pz]=r.pts[i],len=Math.hypot(x-px,z-pz);
      return {x:(px+x)/2,z:(pz+z)/2,dx:(x-px)/len,dz:(z-pz)/len,len};
    })).filter(p=>p.len>9&&s.island.sample(p.x,p.z)>1);
    const p=segments.sort((a,b)=>Math.hypot(a.x-pt.x,a.z-pt.z)-Math.hypot(b.x-pt.x,b.z-pt.z))[0];
    return {...p,y:s.island.sample(p.x,p.z)};
  });
  const mapPoint=await screenAt(visitor,road);await visitor.mouse.click(mapPoint.x,mapPoint.y,{button:'right'});
  const pin=await visitor.evaluate(()=>window.__cozy.street.mapDestination);
  assert.ok(pin&&Math.hypot(pin.x-road.x,pin.z-road.z)<9,'street under the island-scale map pixel '+JSON.stringify({pin,road,mapPoint}));
  const confirm=await visitor.locator('#map-jump').evaluate(button=>{
    const rect=button.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    return !button.disabled&&document.elementFromPoint(x,y)===button?{x,y}:null;
  });
  assert.ok(confirm,'the enabled map travel confirmation receives pointer input');
  await visitor.mouse.click(confirm.x,confirm.y);
  await until(visitor,({x,z})=>{const s=window.__cozy.street,a=s.session.actors.get(s.session.id);
    const drawn=s.meshes.get(a.id)?.position,t=s.controls.target;
    return s.active&&drawn&&Math.hypot(a.x-x,a.z-z)<2.6&&Math.hypot(drawn.x-a.x,drawn.z-a.z)<.25&&Math.hypot(t.x-a.x,t.z-a.z)<.25;},pin);
  console.log('PASS map click selected the road and confirmed travel at the map pin.');
  const roadStart=await actor(visitor);
  const step=await visitor.evaluate(async({dx,dz})=>{
    const s=window.__cozy.street,a=s.session.actors.get(s.session.id);
    const {walkable}=await import('./src/street-world.js');
    const heading=Math.atan2(dx,dz);
    for(const distance of [3,2.4,4.1])for(let i=0;i<16;i++){
      const angle=heading+i*Math.PI/8,x=a.x+Math.sin(angle)*distance,z=a.z+Math.cos(angle)*distance;
      const y=s.island.deckHeight?.(x,z)??s.island.sample(x,z);
      const c=s.camera.clone();c.position.lerp(s.controls.target,1-s.cameraFraction());c.updateMatrixWorld();
      const target=c.position.clone().set(x,y,z),ndc=target.clone().project(c);
      const at={x:(ndc.x+1)*innerWidth/2,y:(1-ndc.y)*innerHeight/2};
      if(document.elementFromPoint(at.x,at.y)?.id!=='gl')continue;
      const ray=s.ray.ray.clone().set(c.position,target.sub(c.position).normalize()),ground=s.floorPoint(ray,1000);
      if(ground&&Math.hypot(ground.x-x,ground.z-z)<.4&&walkable(s.island,s.plots,s.session.layout,ground)&&!s.pickAction(ray,false,ground))return at;
    }
  },road);assert.ok(step,'a visible road under the pointer');
  await visitor.mouse.click(step.x,step.y);
  await until(owner,({id,x,z})=>{const a=window.__cozy.street.session.actors.get(id);return Math.hypot(a.x-x,a.z-z)>1;},roadStart);
  await until(visitor,()=>{const s=window.__cozy.street.session;return !s.actors.get(s.id).walking;});
  const cdp=await visitor.context().newCDPSession(visitor);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:525,y:355}]});
  await new Promise(resolve=>setTimeout(resolve,550));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await visitor.locator('#world-look').waitFor();await visitor.locator('#world-dismiss').click();
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  const facade=await visitor.evaluate(()=>{
    const s=window.__cozy.street,a=s.session.actors.get(s.session.id);
    const b=s.island.homes.filter(h=>Math.hypot(h.x-a.x,h.z-a.z)>15).sort((h,k)=>
      Math.hypot(h.x-a.x,h.z-a.z)-Math.hypot(k.x-a.x,k.z-a.z))[0];
    s.cameraFocus={x:b.x,z:b.z};s.controls.target.set(b.x,b.y+1.48,b.z);
    s.camera.position.set(b.x+b.s*(b.d/2+5),b.y+3.4,b.z+b.c*(b.d/2+5));s.controls.update();
    return {id:b.id,name:b.name,x:b.x+b.c*b.w*.24+b.s*b.d/2,y:b.y+2,z:b.z-b.s*b.w*.24+b.c*b.d/2};
  });
  const wall=await screenAt(visitor,facade);await visitor.mouse.move(wall.x,wall.y);
  await until(visitor,name=>document.querySelector('#gl').title==='Enter '+name,facade.name);
  await visitor.mouse.click(wall.x,wall.y,{button:'right'});
  assert.equal(await visitor.locator('#world-action').innerText(),'Enter '+facade.name);
  await visitor.locator('#world-jump').click();await until(visitor,id=>window.__cozy.street.openRoof===id,facade.id);
  console.log('PASS Home 58 and map-pin travel, furniture selection, left-click walking, ground teleport, avatar follow, recenter, all three orbit buttons, map toggle and touch hold.');
  assert.deepEqual(errors,[]);
}catch(err){
  for(const p of pages)console.error(await p.evaluate(()=>{const s=window.__cozy?.street;return {actor:s?.session?.actors.get(s.session.id),
    menu:document.querySelector('#world-choice')?.innerText,focus:s?.cameraFocus,roof:s?.openRoof};}).catch(()=>null));
  console.error(errors);throw err;
}finally{await browser.close();}
