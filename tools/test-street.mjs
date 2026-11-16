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
  const late=await visit(link,relay?await testContext():context);
  await late.waitForFunction(()=>window.__cozy.street.session.connected&&window.__cozy.street.session.layout.wall===1);
  assert.equal(await late.evaluate(()=>window.__cozy.street.session.layout.lights),false);
  await late.close();
  console.log('Late join received geometry and lantern state');
  await host.locator('#undo-wall').click();await guest.waitForFunction(()=>window.__cozy.street.session.layout.wall===0);
  await host.locator('#wall-offset').fill('-0.5');await host.locator('#apply-wall').click();
  await guest.waitForFunction(()=>window.__cozy.street.session.layout.wall===-.5);
  const oldBoot=await guest.evaluate(()=>window.__cozy.street.session.hostBoot);
  await host.reload({waitUntil:'domcontentloaded',timeout:120000});await ready(host);assert.equal(await host.evaluate(()=>window.__cozy.street.session.layout.wall),-.5);
  await guest.waitForFunction(old=>window.__cozy.street.session.connected&&window.__cozy.street.session.hostBoot!==old,oldBoot);
  await host.locator('#island-map').click();await host.locator('#walk-street').click();
  assert.equal(await host.evaluate(()=>window.__cozy.street.session.layout.wall),-.5);
  assert.deepEqual(errors,[]);
  console.log('PASS owner invite, guest movement through café door, shared lights, owner-only edit, late join, undo, reload and map return');
}finally{await browser.close();}
