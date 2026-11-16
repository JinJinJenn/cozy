import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';

const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=createRequire(process.env.PLAYWRIGHT_FROM||import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE||undefined,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--mute-audio']});
const origin='https://cozy.test/cozy/',errors=[];
try{
  const relay=process.argv.includes('--relay');
  const testContext=async()=>{
    const context=await browser.newContext({viewport:{width:720,height:432}});
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
      console.error(await p.evaluate(()=>({ready:window.__cozy?.ready,session:window.__cozy?.street?.session?.error,info:document.getElementById('info')?.textContent})));throw e;}
    return p;
  }
  function ready(p){return p.waitForFunction(()=>window.__cozy?.ready&&window.__cozy.street?.session?.ready,null,{timeout:120000});}
  const host=await visit(relay?origin:origin+'?net=local');
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
  try{await guest.waitForFunction(()=>window.__cozy.street.session.connected,null,{timeout:relay?45000:25000});}
  catch(e){if(relay)console.error('Public relay did not connect two independent browser contexts.');throw e;}
  console.log('Host and guest connected over '+(relay?'WebRTC':'BroadcastChannel'));
  assert.equal(await guest.locator('#build-open').isVisible(),false);
  assert.equal(await guest.evaluate(()=>window.__cozy.street.session.edit(1)),false);
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
  for(const [kind,x,z] of [['cafe',0,7.7],['house',0,6.8],['house',0,.5],['house',.87,.38]]){
    await guest.evaluate(async([kind,x,z])=>{
      const c=window.__cozy,s=c.street.session,b=s.plots.find(p=>p.kind===kind);
      const tx=b.x+b.c*x+b.s*z,tz=b.z-b.s*x+b.c*z,end=performance.now()+23000;
      const key=type=>document.body.dispatchEvent(new KeyboardEvent(type,{code:'KeyW',bubbles:true}));
      const pause=()=>new Promise(r=>setTimeout(r,45));
      document.activeElement.blur();key('keydown');
      try{while(performance.now()<end){const a=s.actors.get(s.id),dx=tx-a.x,dz=tz-a.z,len=Math.hypot(dx,dz);
        if(len<.42)return;
        c.camera.position.set(c.controls.target.x-dx/len*8,c.controls.target.y+4,c.controls.target.z-dz/len*8);c.controls.update();await pause();}
        throw Error('Walk to '+kind+' timed out');
      }finally{key('keyup');}
    },[kind,x,z]);
  }
  await guest.getByRole('button',{name:'Sit down'}).click();
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
  await late.waitForFunction(()=>window.__cozy.street.session.connected&&window.__cozy.street.session.layout.wall===1);
  assert.equal(await late.evaluate(()=>window.__cozy.street.session.layout.lights),false);
  assert.equal(await late.evaluate(()=>window.__cozy.street.session.layout.homes.l106.wall),1);
  await late.close();
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
}finally{await browser.close();}
