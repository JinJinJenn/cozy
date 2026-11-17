import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(process.env.PLAYWRIGHT_FROM||import.meta.url),{chromium}=require('playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),out=process.env.COZY_HOME_REPORT||path.join(root,'test-results/homes');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE||undefined,args:['--mute-audio','--enable-unsafe-swiftshader']});
const report={errors:[],consoleErrors:[],time:new Date().toISOString()};
try{
 const context=await browser.newContext({viewport:{width:1600,height:900}}),page=await context.newPage(),origin='https://cozy.test/cozy/';
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
 await page.context().route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!=='https://cozy.test')return r.abort();const relative=u.pathname.slice('/cozy/'.length)||'index.html';const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))return r.abort();await r.fulfill({body:await readFile(file),contentType:{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'}[path.extname(file)]});});
 await page.goto(origin+'?net=local&view=street');await page.waitForFunction(()=>window.__cozy?.ready&&window.__cozy?.street?.session?.ready,null,{timeout:120000});
 report.initial=await page.evaluate(()=>window.__cozy.info());
 report.gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown';});
 report.access=await page.evaluate(async()=>{
   const {walkingRoute}=await import('./src/street-route.js'),{walkable}=await import('./src/street-world.js'),{homeWorld}=await import('./src/home-plan.js');
   const c=window.__cozy,s=c.street.session,bad=[];let entrances=0,seats=0;
   for(const b of c.island.homes){
     if(!b.renderHandles){bad.push({id:b.id,reason:'no shell'});continue;}
     const route=walkingRoute(c.island,s.plots,s.layout,b.approach||b.entry,b.inside);
     if(!route)bad.push({id:b.id,reason:'entrance route',w:b.w,d:b.d,entry:b.entry,inside:b.inside,approach:b.approach});else entrances++;
     const chair=b.seats[0],seat=homeWorld(b,chair.x,chair.z);
     if(!walkable(c.island,s.plots,s.layout,seat)||!walkingRoute(c.island,s.plots,s.layout,b.inside,seat))bad.push({id:b.id,reason:'seat route'});else seats++;
     for(const room of b.rooms)if(!walkingRoute(c.island,s.plots,s.layout,b.inside,room.point))bad.push({id:b.id,reason:room.name+' route'});
   }
   return {homes:c.island.homes.length,entrances,seats,bad};
 });
 console.log(JSON.stringify({initial:report.initial,access:report.access}));
 await page.screenshot({path:out+'/street-first.png'});
 report.zoom=await page.evaluate(async()=>{const c=window.__cozy;c.controls.target.copy(c.controls.target);const d=c.camera.position.clone().sub(c.controls.target).normalize();c.camera.position.copy(c.controls.target).add(d.multiplyScalar(180));c.controls.update();await c.flushChunks();return {distance:c.controls.getDistance(),max:c.controls.maxDistance};});
 await page.screenshot({path:out+'/waterfront-wide.png'});
 report.approach=await page.evaluate(async()=>{
   const c=window.__cozy,s=c.street.session,a=s.actors.get(s.id);
   const candidates=c.island.homes.filter(b=>b.id.startsWith('frontage-')).sort((p,q)=>Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(q.x-a.x,q.z-a.z));
   let b;for(const q of candidates){s.command({type:'walk',...q.entry});if(a.walking){b=q;break;}}
   if(!b)return {error:'No reachable frontage home'};
   for(let n=0;n<10000&&a.walking;n++)s.tick(.05);
   c.render();const {homeWorld}=await import('./src/home-plan.js'),door=homeWorld(b,0,b.d/2),eye=homeWorld(b,4,b.d/2+9);
   await c.setCamera([eye.x,b.y+6,eye.z],[door.x,b.y+1.1,door.z]);c.render();
   const {Vector3}=await import('three'),p=new Vector3(door.x,b.y+1.1,door.z).project(c.camera);
   s.commandAt=-Infinity;return {id:b.id,distance:Math.hypot(a.x-b.entry.x,a.z-b.entry.z),click:{x:(p.x*.5+.5)*innerWidth,y:(.5-p.y*.5)*innerHeight}};
 });
 assert.ok(report.approach.distance<.25);
 await page.mouse.click(report.approach.click.x,report.approach.click.y);
 assert.match(await page.locator('#world-action').innerText(),/^Enter Home /);
 await page.locator('#world-action').click();
 report.visit=await page.evaluate(id=>{
   const c=window.__cozy,s=c.street.session,a=s.actors.get(s.id),b=c.island.homesById.get(id);
   for(let n=0;n<10000&&a.walking;n++)s.tick(.05);
   c.render();return {id:b.id,distance:Math.hypot(a.x-b.inside.x,a.z-b.inside.z),open:c.street.openRoof,feedback:a.feedback};
 },report.approach.id);
 await page.evaluate(async()=>{const c=window.__cozy,t=c.controls.target;await c.setCamera([t.x+9,t.y+10,t.z+11],[t.x,t.y,t.z]);c.render();});
 await page.waitForTimeout(250);
 await page.screenshot({path:out+'/home-interior.png'});
 report.sit=await page.evaluate(()=>{const c=window.__cozy,s=c.street.session,b=c.island.homesById.get(c.street.openRoof),a=s.actors.get(s.id);if(!b)return {error:'no open home'};s.commandAt=-Infinity;s.command({type:'furniture',lot:b.id,index:0});for(let n=0;n<500&&a.walking;n++)s.tick(.05);c.render();return {activity:a.activity,feedback:a.feedback,lot:b.id};});
 await page.screenshot({path:out+'/home-seated.png'});
 const invite=await page.evaluate(()=>window.__cozy.street.session.invite()),guest=await page.context().newPage();
 guest.on('pageerror',e=>report.errors.push(e.message));
 await guest.goto(invite);await guest.waitForFunction(()=>window.__cozy?.street?.session?.connected,null,{timeout:30000});
 await guest.evaluate(id=>{const s=window.__cozy.street.session;s.command({type:'furniture',lot:id,index:0});},report.visit.id);
 await page.waitForTimeout(350);
 assert.equal(await guest.evaluate(()=>window.__cozy.street.session.actors.get(window.__cozy.street.session.id).activity==='sit'),false);
 await page.evaluate(()=>{const s=window.__cozy.street.session;s.commandAt=-Infinity;s.command({type:'walk',...s.island.homesById.get(window.__cozy.street.openRoof).inside});for(let i=0;i<800&&s.actors.get(s.id).walking;i++)s.tick(.05);});
 await guest.evaluate(id=>{const s=window.__cozy.street.session;s.commandAt=-Infinity;s.command({type:'furniture',lot:id,index:0});},report.visit.id);
 await page.waitForTimeout(250);
 await page.evaluate(()=>{const s=window.__cozy.street.session;for(let i=0;i<3500;i++)s.tick(.05);});
 await guest.waitForFunction(()=>window.__cozy.street.session.actors.get(window.__cozy.street.session.id)?.activity==='sit',null,{timeout:20000});
 report.multiplayer={transport:'BroadcastChannel',occupiedSeatRejected:true,guestSeated:true};
 await guest.close();
 report.quality={};
 await page.locator('#graphics-settings summary').click();
 for(const mode of ['low','balanced','high']){
   await page.getByLabel('Graphics quality').selectOption(mode);
   report.quality[mode]=await page.evaluate(()=>window.__cozy.info().graphics);
 }
 assert.equal(report.quality.low.shadows,false);assert.equal(report.quality.high.shadows,true);
 assert.ok(report.quality.low.width*report.quality.low.height<=1000000);
 await page.getByLabel('Graphics quality').selectOption('balanced');
 await page.locator('#graphics-settings summary').click();
 await page.locator('#island-map').click();await page.locator('#centre-view').click();
 await page.evaluate(async()=>{await window.__cozy.flushChunks();window.__cozy.render();});
 await page.screenshot({path:out+'/town-centre.png'});
 report.final=await page.evaluate(()=>window.__cozy.info());
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.access.bad,[]);
 assert.ok(report.zoom.distance>150);assert.ok(report.visit.distance<.25);assert.equal(report.sit.activity,'sit');report.passed=true;
}catch(e){report.error=e.stack;report.passed=false;process.exitCode=1;}finally{await writeFile(out+'/review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
