import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {testNostrRelay} from './test-nostr-relay.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.COZY_DOMESTIC_REPORT||path.join(root,'test-results/domestic');
await mkdir(out,{recursive:true});
const {chromium}=createRequire(process.env.PLAYWRIGHT_FROM||import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE||undefined,args:['--mute-audio','--disable-background-timer-throttling']});
const report={errors:[],transport:'Native RTCDataChannel, local signalling fixture'},relay=testNostrRelay(),origin='https://cozy.test/cozy/';
try{
 const context=async()=>{const ctx=await browser.newContext({viewport:{width:1440,height:900}});await relay(ctx);
   await ctx.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!=='https://cozy.test')return r.abort();
     const file=path.resolve(root,u.pathname.slice('/cozy/'.length)||'index.html');assert.ok(file.startsWith(root));
     await r.fulfill({body:await readFile(file),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]});});return ctx;};
 const open=async(url)=>{const p=await(await context()).newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(url);await p.waitForFunction(()=>window.__cozy?.ready&&window.__cozy.street.session?.ready,null,{timeout:120000});return p;};
 const host=await open(origin),guest=await open(await host.evaluate(()=>window.__cozy.street.session.invite()));
 await guest.waitForFunction(()=>window.__cozy.street.session.connected,null,{timeout:45000});
 report.peerKinds=await host.evaluate(()=>[...window.__cozy.street.session.peers.keys()]);
 assert.ok(report.peerKinds.some(k=>k.startsWith('trystero-nostr/')));
 const guestId=await guest.evaluate(()=>window.__cozy.street.session.id);
 report.population=await host.evaluate(()=>window.__cozy.street.town.people.length);assert.ok(report.population>400);
 report.home=await host.evaluate(async()=>{
   const c=window.__cozy,s=c.street.session,b=c.island.homes.find(b=>b.name==='Home 58'),a=s.actors.get(s.id);
   Object.assign(a,b.inside);s.activities.finish(a);c.render();
   const {homeWorld}=await import('./src/home-plan.js'),eye=homeWorld(b,5,b.d/2+7),aim=homeWorld(b,0,0);
   await c.setCamera([eye.x,b.y+10,eye.z],[aim.x,b.y+1,aim.z]);c.render();
   const {stationsFor}=await import('./src/street-session.js'),{Vector3}=await import('three');
   const bed=stationsFor(b).find(u=>u.action==='rest'),p=new Vector3(bed.target.x,bed.target.y,bed.target.z).project(c.camera);
   return {id:b.id,click:{x:(p.x*.5+.5)*innerWidth,y:(.5-p.y*.5)*innerHeight}};
 });
 await host.mouse.click(report.home.click.x,report.home.click.y);
 assert.equal(await host.locator('#world-action').innerText(),'Rest on the bed');await host.locator('#world-action').click();
 const finishRoute=async id=>host.evaluate(id=>{const s=window.__cozy.street.session,a=s.actors.get(id||s.id);for(let i=0;i<1500&&a.walking;i++)s.activities.advance(a,.05);return {activity:a.activity,using:a.using,feedback:a.feedback};},id);
 assert.equal((await finishRoute()).activity,'rest');await host.screenshot({path:out+'/home-rest.jpg',type:'jpeg',quality:88});
 await host.evaluate(({id,lot})=>{const s=window.__cozy.street.session;Object.assign(s.actors.get(id),s.island.homesById.get(lot).inside);},{id:guestId,lot:report.home.id});
 await guest.evaluate(id=>{const s=window.__cozy.street.session,b=s.island.homesById.get(id);s.command({type:'furniture',lot:id,index:b.uses.findIndex(u=>u.action==='rest')});},report.home.id);
 await guest.waitForFunction(()=>/Someone else/.test(window.__cozy.street.session.actors.get(window.__cozy.street.session.id)?.feedback),null,{timeout:10000});
 await host.evaluate(lot=>{const s=window.__cozy.street.session;s.use();s.command({type:'walk',...s.island.homesById.get(lot).inside});},report.home.id);
 await finishRoute();
 await guest.evaluate(id=>{const s=window.__cozy.street.session,b=s.island.homesById.get(id);s.command({type:'furniture',lot:id,index:b.uses.findIndex(u=>u.action==='rest')});},report.home.id);
 await host.waitForFunction(id=>window.__cozy.street.session.actors.get(id)?.walking,guestId,{timeout:10000});
 assert.equal((await finishRoute(guestId)).activity,'rest');
 await guest.waitForFunction(()=>window.__cozy.street.session.actors.get(window.__cozy.street.session.id)?.activity==='rest',null,{timeout:10000});
 report.rest={clicked:true,exclusive:true,guestReceivedPose:true};
 await guest.evaluate(()=>window.__cozy.street.session.use());
 await host.waitForFunction(id=>!window.__cozy.street.session.actors.get(id)?.using,guestId,{timeout:10000});
 report.actions=[];
 for(const action of ['read','write','cook','wash','stretch','shower','bathroom','eat']){
   const result=await host.evaluate(action=>{
     const c=window.__cozy,s=c.street.session,b=c.island.homes.find(b=>b.name==='Home 58'&&b.uses.some(u=>u.action===action))||c.island.homes.find(b=>b.uses.some(u=>u.action===action));
     const a=s.actors.get(s.id);s.activities.finish(a);Object.assign(a,b.inside);a.activity='';
     s.command({type:'furniture',lot:b.id,index:b.uses.findIndex(u=>u.action===action)});
     for(let i=0;i<1500&&a.walking;i++)s.activities.advance(a,.05);c.render();return {action,actual:a.activity,home:b.id,feedback:a.feedback};
   },action);
   assert.equal(result.actual,action,JSON.stringify(result));report.actions.push(result);
   if(['read','cook'].includes(action))await host.screenshot({path:out+'/home-'+action+'.jpg',type:'jpeg',quality:88});
 }
 // Run the complete live simulation, including routes through real home doors.
 report.simulation=await host.evaluate(async()=>{
   const c=window.__cozy,t=c.street.town,before=t.current;let blocked=0;
   const {walkable}=await import('./src/street-world.js');
   for(let i=0;i<120;i++){
     while(t.workerBusy)await new Promise(r=>setTimeout(r,5));
     t.advance(.5);while(t.workerBusy)await new Promise(r=>setTimeout(r,5));
     blocked+=t.current.filter(p=>!walkable(c.island,c.street.plots,c.street.session.layout,p)).length;
   }
   const after=t.current,ticks=t.workerTimes.slice().sort((a,b)=>a-b);
   return {worker:!!t.worker,workerError:t.workerError,residents:after.length,blocked,
     moved:after.filter((p,i)=>Math.hypot(p.x-before[i].x,p.z-before[i].z)>1).length,p50:ticks[Math.floor(ticks.length*.5)],p95:ticks[Math.floor(ticks.length*.95)],max:ticks.at(-1)};
 });
 assert.ok(report.simulation.worker);assert.ok(report.simulation.moved>200);assert.equal(report.simulation.blocked,0);assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.error=e.stack;report.passed=false;process.exitCode=1;}
finally{await writeFile(out+'/review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
