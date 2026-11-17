import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {testNostrRelay} from './test-nostr-relay.mjs';
import {playTerrace} from './playtest-terrace.mjs';
import {playBluebell} from './playtest-bluebell.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=createRequire(process.env.PLAYWRIGHT_FROM||import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE||undefined,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--mute-audio']});
const origin='https://cozy.test/cozy/',errors=[];
try{
  const loopback=process.argv.includes('--rtc-loopback');
  const relay=loopback||process.argv.includes('--relay');
  const installRelay=loopback&&testNostrRelay();
  const testContext=async(options={})=>{
    // Keep the CSS viewport intact for pointer tests while three isolated
    // WebRTC profiles share the CI runner's software rasterizer.
    const photo=process.argv.some(arg=>arg.endsWith('-shot')||arg==='--shot');
    const scale=relay && !photo ? 0.6 : 1;
    const context=await browser.newContext({viewport:{width:720,height:432},deviceScaleFactor:scale,...options});
    if(installRelay)await installRelay(context);
    // Software WebGL shares the test machine across three live tabs.
    await context.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame=callback=>setTimeout(()=>raf(callback),90);});
    await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(relay&&!url.href.startsWith(origin))return route.continue();
    assert.ok(url.href.startsWith(origin));
    const f=path.resolve(root,url.pathname.slice('/cozy/'.length)||'index.html');assert.ok(f.startsWith(root));
    const mime={'.css':'text/css','.html':'text/html','.js':'text/javascript','.json':'application/json','.mp3':'audio/mpeg'};
    await route.fulfill({body:await readFile(f),contentType:mime[path.extname(f)]});
    });return context;
  };
  const context=await testContext();
  async function visit(url,ctx=context){
    const p=await ctx.newPage();p.on('pageerror',err=>{errors.push(err.message);console.error(err.message);});
    await p.goto(url,{waitUntil:'domcontentloaded',timeout:120000});try{await ready(p);}catch(e){
      console.error(await p.evaluate(()=>({viewer:window.__cozy?.ready,street:!!window.__cozy?.street,
        session:!!window.__cozy?.street?.session,ready:window.__cozy?.street?.session?.ready,
        visibility:document.visibilityState,notice:document.getElementById('street-notice')?.textContent})));throw e;}
    return p;
  }
  function ready(p){return p.waitForFunction(()=>window.__cozy?.ready&&window.__cozy.street?.session?.ready,null,{timeout:120000,polling:100});}
  const host=await visit(relay?origin:origin+'?net=local');
  async function readPace(diagonal,jog){
    if(jog)await host.keyboard.down('Shift');
    await host.keyboard.down('w');if(diagonal)await host.keyboard.down('d');
    try{return await host.evaluate(()=>{const {x,z}=window.__cozy.street.session.keys;return Math.hypot(x,z);});}
    finally{if(diagonal)await host.keyboard.up('d');await host.keyboard.up('w');if(jog)await host.keyboard.up('Shift');}
  }
  const walk=await readPace(false,false),jog=await readPace(false,true);
  assert.ok(walk>.7&&jog>walk&&Math.abs(await readPace(true,false)-walk)<.00001&&Math.abs(await readPace(true,true)-jog)<.00001);
  console.log('PASS stride length is consistent across straight and diagonal walking and jogging');
  const town=await host.evaluate(()=>{const {island,street}=window.__cozy;return {plots:island.plan.lots.length,exteriors:island.streetFootprints.length,places:street.plots.map(p=>p.kind),roads:island.plan.roads.length};});
  assert.deepEqual(town.places,['cottage','cafe','house','spa','gym','club','restaurant']);assert.ok(town.exteriors>50);
  console.log('Island',JSON.stringify(town));
  if(process.argv.includes('--shot')){
    await host.setViewportSize({width:1280,height:720});await host.waitForTimeout(500);
    const dir=path.join(root,'docs/shots/2026-11-16');await mkdir(dir,{recursive:true});
    await host.screenshot({path:path.join(dir,'harbor-street.jpg'),type:'jpeg',quality:84});
    await host.evaluate(async()=>{const c=window.__cozy,p=c.street.cafe;c.setView('top');
      await c.setCamera([p.x+168,175,p.z+125],[p.x+15,5,p.z-38]);});
    await host.screenshot({path:path.join(dir,'harbor-neighborhood.jpg'),type:'jpeg',quality:84});
    await host.locator('#walk-street').click();
    await host.setViewportSize({width:900,height:540});
  }
  await host.getByRole('button',{name:'Multiplayer'}).click();
  await host.getByRole('button',{name:'Invite a guest'}).click();
  await host.locator('#invite-url').waitFor({state:'visible'});
  const link=await host.locator('#invite-url').inputValue();assert.ok(link.includes('visit='));
  await host.locator('#list-street').check();
  const guest=await visit(link,relay?await testContext():context);
  async function waitForGuest(page){
    const joined=()=>page.waitForFunction(()=>window.__cozy?.street?.session?.connected,null,{polling:200,timeout:relay?45000:25000});
    try{await joined();}
    catch(e){
      if(!relay||loopback)throw e;
      // A peer can connect while Playwright waits for the reconnect button,
      // which then disappears. In that case the existing connection is usable.
      const reconnect=page.getByRole('button',{name:'Reconnect to owner'});
      if(await reconnect.isVisible()){
        try{await reconnect.click({timeout:5000});}catch(error){
          if(!await page.evaluate(()=>window.__cozy?.street?.session?.connected))throw error;
        }
      }
      await ready(page);await joined();
    }
  }
  await waitForGuest(guest);
  console.log('Host and guest connected over '+(relay?'WebRTC':'BroadcastChannel'));
  if(relay)await host.waitForFunction(()=>[...window.__cozy.street.session.peers.keys()].some(k=>k.startsWith('trystero-nostr/')));
  assert.equal(await guest.locator('#build-open').isVisible(),false);
  assert.equal(await guest.evaluate(()=>window.__cozy.street.session.edit(1)),false);
  await guest.locator('#directions-open').click();
  await guest.locator('#destination').selectOption('restaurant');
  await guest.locator('#dinner-visit').click();
  await guest.locator('#order-fish').click({timeout:90000});
  const guestAtDinner=await guest.evaluate(()=>window.__cozy.street.session.id);
  await host.waitForFunction(id=>{const a=window.__cozy.street.session.actors.get(id);
    return a?.outing==='preparing'||a?.outing==='ordered';},guestAtDinner);
  await host.locator('#build-open').click();await host.locator('#build-lot').selectOption('l104');
  await host.locator('#wall-offset').fill('0.5');await host.locator('#apply-wall').click();
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session;
    return s.layout.restaurant?.wall===.5&&s.actors.get(s.id).outing==='eating';},null,{timeout:90000});
  await host.waitForFunction(id=>{const a=window.__cozy.street.session.actors.get(id);
    return a?.activity==='dine'&&a.dish==='fish'&&a.outing==='eating';},guestAtDinner);
  if(process.argv.includes('--dinner-shot')){
    const dir=path.join(root,'docs/shots/2026-11-17');await mkdir(dir,{recursive:true});
    const original=guest.viewportSize();await guest.bringToFront();await guest.setViewportSize({width:1100,height:700});
    await guest.evaluate(()=>{const c=window.__cozy,b=c.street.plots.find(p=>p.kind==='restaurant'),t=c.controls.target;
      c.camera.position.set(t.x+b.c*3.8+b.s*3.8,t.y+2.95,t.z-b.s*3.8+b.c*3.8);c.controls.update();c.street.render();});
    await guest.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await guest.screenshot({path:path.join(dir,'bay-kitchen.jpg'),quality:88});await guest.setViewportSize(original);
  }
  await host.locator('#undo-wall').click();await guest.waitForFunction(()=>window.__cozy.street.session.layout.restaurant?.wall===0);
  await guest.getByRole('button',{name:'Finish meal'}).click();
  await guest.waitForFunction(()=>!window.__cozy.street.session.actors.get(window.__cozy.street.session.id).outing);
  await host.locator('#build-open').click();
  console.log('PASS guest ordered grilled fish, cook delivered, owner moved and restored the dining-room entrance during service');
  if(process.argv.includes('--dinner-only')){assert.deepEqual(errors,[]);await browser.close();process.exit(0);}
  await playBluebell(host,guest,async()=>{
    const late=await visit(link,relay?await testContext():context);
    try{
      await waitForGuest(late);
      await late.waitForFunction(()=>{const s=window.__cozy.street.session,h=s.layout.homes.l108;
        return h?.wall===.5&&h.side===1.5&&[...s.actors.values()].some(a=>a.homeVisit&&a.outing==='chat');});
    }finally{if(relay)await late.context().close();else await late.close();}
  },process.argv.includes('--bluebell-shot')?path.join(root,'docs/shots/2026-11-16'):null);
  if(process.argv.includes('--bluebell-only')){assert.deepEqual(errors,[]);await browser.close();process.exit(0);}
  await playTerrace(host,guest);
  await guest.locator('#use-place').click();
  await host.waitForFunction(()=>!window.__cozy.street.session.layout.lights);
  // Orient the normal orbit camera toward the door, then walk through it using W.
  await guest.evaluate(()=>{const {street:s,camera,controls}=window.__cozy,b=s.cafe;
    camera.position.set(controls.target.x+b.s*8,controls.target.y+4,controls.target.z+b.c*8);controls.update();});
  const guestId=await guest.evaluate(()=>window.__cozy.street.session.id);
  await host.locator('#build-open').click();
  await host.locator('#wall-offset').fill('1');
  await guest.keyboard.down('w');
  try{await host.waitForFunction(id=>{const s=window.__cozy.street.session,a=s.actors.get(id),b=s.cafe;
    return a&&(a.x-b.x)*b.s+(a.z-b.z)*b.c<2.4;},guestId,{timeout:20000});
    await host.getByRole('button',{name:'Move wall and door'}).click();
    await guest.waitForFunction(()=>{const s=window.__cozy.street.session,a=s.actors.get(s.id),b=s.cafe;
      return s.layout.wall===1&&(a.x-b.x)*b.s+(a.z-b.z)*b.c<-.2;});
  }finally{await guest.keyboard.up('w');}
  console.log('Guest crossed the café entrance and received the owner edit');
  // Walk the visitor out of the café and into the chair in Bluebell House.
  // The test steers the orbit camera. Movement still goes through normal guest input.
  async function walkTo(page,kind,x,z){
    await page.evaluate(async([kind,x,z])=>{
      const c=window.__cozy,s=c.street.session,b=s.plots.find(p=>p.kind===kind);
      const tx=b.x+b.c*x+b.s*z,tz=b.z-b.s*x+b.c*z,end=performance.now()+65000;
      const key=type=>document.body.dispatchEvent(new KeyboardEvent(type,{code:'KeyW',bubbles:true}));
      const pause=()=>new Promise(r=>setTimeout(r,45));
      document.activeElement.blur();key('keydown');
      try{while(performance.now()<end){const a=s.actors.get(s.id),dx=tx-a.x,dz=tz-a.z,len=Math.hypot(dx,dz);
        if(len<.42)return;
        c.camera.position.set(c.controls.target.x-dx/len*8,c.controls.target.y+4,c.controls.target.z-dz/len*8);c.controls.update();await pause();}
        const a=s.actors.get(s.id);
        throw Error('Walk to '+kind+' timed out '+JSON.stringify({owner:s.owner,delta:[tx-a.x,tz-a.z],keys:s.keys,activity:a.activity,building:c.street.buildLot?.id,connected:s.connected}));
      }finally{key('keyup');}
    },[kind,x,z]);
  }
  for(const point of [['cafe',0,7.7],['house',0,6.8],['house',0,.5],['house',.87,.38]])await walkTo(guest,...point);
  const chair=await guest.evaluate(async()=>{
    const {Vector3}=await import('three'),{toWorld}=await import('./src/street-world.js');
    const c=window.__cozy,b=c.street.plots.find(p=>p.kind==='house'),q=toWorld(b,1.38,-.14);
    const camera=c.camera.clone();camera.position.lerp(c.controls.target,1-c.street.cameraFraction());camera.updateMatrixWorld();
    const point=new Vector3(q.x,b.y+.55,q.z).project(camera);
    return {x:(1+point.x)*innerWidth/2,y:(1-point.y)*innerHeight/2};
  });
  await guest.mouse.click(chair.x,chair.y);
  await guest.getByRole('button',{name:'Sit down',exact:true}).and(guest.locator('#world-action')).click();
  await host.waitForFunction(id=>window.__cozy.street.session.actors.get(id)?.activity==='sit',guestId);
  if(process.argv.includes('--renovation-shot'))await host.setViewportSize({width:1280,height:720});
  await host.locator('#build-lot').selectOption('l106');
  // Move the on-world handle by a measured metre in the cottage's facing direction.
  const grip=host.locator('#wall-grip'),bounds=await grip.boundingBox();assert.ok(bounds);
  const delta=await host.evaluate(async()=>{
    const {Vector3}=await import('three'),c=window.__cozy,b=c.street.buildLot;
    const project=z=>new Vector3(b.x-b.c*b.w*.25+b.s*z,b.y+2.25,b.z+b.s*b.w*.25+b.c*z).project(c.camera);
    const start=project(b.d/2),end=project(b.d/2+1.02);
    return [(end.x-start.x)*innerWidth/2,(start.y-end.y)*innerHeight/2];
  });
  const sx=bounds.x+bounds.width/2,sy=bounds.y+bounds.height/2;
  await host.mouse.move(sx,sy);await host.mouse.down();await host.mouse.move(sx+delta[0],sy+delta[1],{steps:6});
  assert.equal(await host.locator('#wall-offset').inputValue(),'1');
  assert.equal(await guest.evaluate(()=>window.__cozy.street.session.layout.homes.l106?.wall??0),0);
  if(process.argv.includes('--renovation-shot')){
    const dir=path.join(root,'docs/shots/2026-11-16');await mkdir(dir,{recursive:true});
    await host.screenshot({path:path.join(dir,'peach-cottage-renovation.jpg'),type:'jpeg',quality:89});
  }
  await host.mouse.up();
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session;
    return s.layout.homes.l106?.wall===1&&s.actors.get(s.id).activity==='sit';});
  if(process.argv.includes('--renovation-shot')){
    await guest.setViewportSize({width:1280,height:720});
    await guest.evaluate(()=>{const c=window.__cozy,b=c.street.plots.find(p=>p.kind==='house'),t=c.controls.target;
      c.camera.position.set(t.x+b.c*3.8+b.s*3.9,t.y+3.5,t.z-b.s*3.8+b.c*3.9);c.controls.update();c.street.render();});
    await guest.screenshot({path:path.join(root,'docs/shots/2026-11-16/bluebell-guest.jpg'),type:'jpeg',quality:89});
    await guest.setViewportSize({width:720,height:432});
  }
  await host.locator('#build-lot').selectOption('l108');await host.locator('#wall-offset').fill('-0.5');await host.locator('#apply-wall').click();
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session;return s.layout.homes.l108?.wall===-.5&&s.actors.get(s.id).activity==='sit';});
  await host.locator('#undo-wall').click();await guest.waitForFunction(()=>{const s=window.__cozy.street.session;
    return s.layout.homes.l108.wall===0&&s.layout.homes.l106.wall===1&&s.actors.get(s.id).activity==='sit';});
  await host.locator('#build-lot').selectOption('l107');
  const late=await visit(link,relay?await testContext():context);
  await waitForGuest(late);
  await late.waitForFunction(()=>window.__cozy.street.session.connected&&window.__cozy.street.session.layout.wall===1);
  assert.equal(await late.evaluate(()=>window.__cozy.street.session.layout.lights),false);
  assert.equal(await late.evaluate(()=>window.__cozy.street.session.layout.homes.l106.wall),1);
  if(relay)await late.context().close();else await late.close();
  console.log('Late join received geometry and lantern state');
  await host.locator('#undo-wall').click();await guest.waitForFunction(()=>window.__cozy.street.session.layout.wall===0);
  await host.locator('#wall-offset').fill('-0.5');await host.locator('#apply-wall').click();
  await guest.waitForFunction(()=>window.__cozy.street.session.layout.wall===-.5);
  const oldBoot=await guest.evaluate(()=>window.__cozy.street.session.hostBoot);
  await host.reload({waitUntil:'domcontentloaded',timeout:120000});await ready(host);assert.equal(await host.evaluate(()=>window.__cozy.street.session.layout.wall),-.5);
  assert.equal(await host.evaluate(()=>window.__cozy.street.session.layout.homes.l106.wall),1);
  await guest.waitForFunction(old=>window.__cozy.street.session.connected&&window.__cozy.street.session.hostBoot!==old,oldBoot);
  await host.locator('#island-map').click();await host.locator('#walk-street').click();
  assert.equal(await host.evaluate(()=>window.__cozy.street.session.layout.wall),-.5);
  assert.deepEqual(errors,[]);
  console.log('PASS guest walking and sitting, on-world renovation drag, independent home undo, late join, owner reload and map return');
  await guest.locator('#coffee-action').click();
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session;return s.actors.get(s.id).outing==='carry';},null,{timeout:45000});
  await guest.locator('#coffee-action').click();
  await host.locator('#build-open').click();
  await host.locator('#build-lot').selectOption('l108');
  await host.locator('#wall-offset').fill('0.5');await host.locator('#apply-wall').click();
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session,a=s.actors.get(s.id);
    return s.layout.homes.l108?.wall===.5&&a.outing==='chat'&&s.actors.get(a.friend)?.cup;
  },null,{timeout:65000});
  await host.waitForFunction(id=>window.__cozy.street.session.actors.get(id)?.activity==='sit',guestId);
  await host.locator('#undo-wall').click();await host.locator('#build-open').click();
  await guest.locator('#beach-action').click();
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session;return s.actors.get(s.id).outing==='bay';},null,{timeout:65000});
  await guest.locator('#coffee-action').click();
  await guest.locator('#directions-open').click();await guest.locator('#destination').selectOption('cafe');
  await guest.locator('#go-place').click();
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session,a=s.actors.get(s.id);
    return !a.walking&&s.near(a)?.cafe&&!a.outing;},null,{timeout:65000});
  console.log('PASS guest coffee pickup, two reserved benches during renovation, beach walk and return to café');
  async function joinBand(page,x,part){
    await page.locator('#directions-open').click();await page.locator('#destination').selectOption('club');await page.locator('#go-place').click();
    await page.waitForFunction(()=>{const s=window.__cozy.street.session,a=s.actors.get(s.id);return !a.walking&&s.near(a)?.kind==='club';},null,{timeout:75000});
    for(const point of [['club',0,1],['club',x,-.8]])await walkTo(page,...point);
    await page.getByRole('button',{name:'Play '+part,exact:true}).click();
  }
  await Promise.all([joinBand(host,-.85,'melody'),joinBand(guest,.85,'bass')]);
  const performing=wall=>{
    const {session:s,music}=window.__cozy.street;
    const parts=[...s.actors.values()].map(a=>a.part);
    return s.layout.club.wall===wall&&parts.includes('melody')&&parts.includes('bass')&&music.sample&&music.ctx.state==='running';
  };
  await guest.waitForFunction(performing,0);
  await host.locator('#build-open').click();await host.locator('#build-lot').selectOption('l102');
  await host.locator('#wall-offset').fill('1');await host.locator('#apply-wall').click();
  await guest.waitForFunction(performing,1);
  if(process.argv.includes('--club-shot')){
    const dir=path.join(root,'docs/shots/2026-11-16');await mkdir(dir,{recursive:true});
    await guest.setViewportSize({width:1280,height:720});
    // Freeze the follow camera for the stage photograph. Both players reached the seats through live input.
    await guest.evaluate(()=>{
      const c=window.__cozy,street=c.street,b=street.plots.find(b=>b.kind==='club'),t=c.controls.target;
      street.render();street.active=false;
      t.set(b.x-.87*b.s,b.y+1.20,b.z-.87*b.c);
      c.camera.position.set(t.x+b.c*1.05+b.s*5.65,t.y+1.69,t.z-b.s*1.05+b.c*5.65);
      c.controls.update();street.art.update(street.session.actors.get(street.session.id),street.session.layout,c.camera.position);
    });
    await guest.screenshot({path:path.join(dir,'moon-room-duet.jpg'),type:'jpeg',quality:89});
    await guest.evaluate(()=>{window.__cozy.street.active=true;});
    await host.setViewportSize({width:1280,height:720});
    await host.locator('#wall-offset').fill('-0.5');await host.waitForTimeout(240);
    await host.screenshot({path:path.join(dir,'moon-room-renovation.jpg'),type:'jpeg',quality:88});
  }
  await host.locator('#undo-wall').click();await guest.waitForFunction(performing,0);
  assert.deepEqual(errors,[]);
  console.log('PASS two players walked to the club, loaded the piano and kept melody and bass through renovation and undo');
  for(const point of [['club',0,1],['club',0,4.65],['club',2.25,4.65]])await walkTo(guest,...point);
  await host.locator('#wall-offset').fill('1');
  await host.locator('#wall-limit').waitFor({state:'visible'});
  assert.match(await host.locator('#wall-limit').innerText(),/Someone is in the way/);
  const allowed=await host.evaluate(()=>window.__cozy.street.previewOffset);
  assert.ok(allowed<1);
  if(process.argv.includes('--corner-shot')){
    await host.setViewportSize({width:1280,height:720});
    await host.screenshot({path:path.join(root,'docs/shots/2026-11-16/club-wall-clearance.jpg'),type:'jpeg',quality:88});
  }
  assert.equal(await guest.evaluate(()=>window.__cozy.street.session.layout.club.wall),0);
  await walkTo(guest,'club',2.25,7);
  await host.locator('#wall-limit').waitFor({state:'hidden'});
  await host.locator('#apply-wall').click();
  await guest.waitForFunction(()=>window.__cozy.street.session.layout.club.wall===1);
  console.log('PASS wall preview stopped at the guest and cleared when the guest walked away');
  await context.close();
  if(!relay){
    const mobile=await testContext({isMobile:true,hasTouch:true,viewport:{width:393,height:852}});
    const phone=await visit(origin+'?net=local',mobile);
    await phone.locator('#build-open').tap();await phone.locator('#build-lot').selectOption('l106');
    await phone.locator('#wall-offset').fill('0.5');await phone.locator('#apply-wall').tap();
    await phone.waitForFunction(()=>window.__cozy.street.session.layout.homes.l106?.wall===.5);
    const box=await phone.locator('#wall-grip').boundingBox();assert.ok(box);
    const delta=await phone.evaluate(async()=>{
      const {Vector3}=await import('three'),c=window.__cozy,b=c.street.buildLot;
      const v=z=>new Vector3(b.x-b.c*b.w*.25+b.s*z,b.y+2.25,b.z+b.s*b.w*.25+b.c*z).project(c.camera);
      const a=v(b.d/2+.5),d=v(b.d/2+1.5);return [(d.x-a.x)*innerWidth/2,(a.y-d.y)*innerHeight/2];
    });
    const device=await mobile.newCDPSession(phone),x=box.x+box.width/2,y=box.y+box.height/2;
    await device.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await device.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+delta[0],y:y+delta[1]}]});
    await device.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await phone.waitForFunction(()=>window.__cozy.street.session.layout.homes.l106.wall===1.5);
    if(process.argv.includes('--renovation-shot'))
      await phone.screenshot({path:path.join(root,'docs/shots/2026-11-16/cottage-touch.jpg'),type:'jpeg',quality:89});
    await phone.locator('#undo-wall').tap();
    await phone.waitForFunction(()=>window.__cozy.street.session.layout.homes.l106.wall===.5);
    await phone.locator('#build-open').tap();await phone.locator('#build-pane').waitFor({state:'hidden'});
    assert.equal(await phone.evaluate(()=>window.__cozy.street.session.layout.revision),3);
    await phone.locator('#build-open').tap();await phone.locator('#build-lot').selectOption('l107');await phone.locator('#terrace-open').tap();
    await phone.locator('#terrace-apply').tap();
    await phone.waitForFunction(()=>window.__cozy.street.session.layout.terrace.tables.length===2);
    await phone.locator('#terrace-undo').tap();await phone.waitForFunction(()=>window.__cozy.street.session.layout.terrace.tables.length===1);
    await mobile.close();assert.deepEqual(errors,[]);console.log('PASS touch wall drag, terrace placement and one-tap undo');
  }
}finally{await browser.close();}
