import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {testNostrRelay} from './test-nostr-relay.mjs';
import {playtestRoom} from './playtest-room.mjs';
import {playtestFurnishing} from './playtest-furnishing.mjs';
import {playtestLighting} from './playtest-lighting.mjs';
import {playtestStudio} from './playtest-studio.mjs';
import {playtestRecovery} from './playtest-recovery.mjs';
import {playtestTable} from './playtest-table.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.COZY_DOMESTIC_REPORT||path.join(root,'test-results/domestic');
await mkdir(out,{recursive:true});
const {chromium}=createRequire(process.env.PLAYWRIGHT_FROM||import.meta.url)('playwright');
const software=process.argv.includes('--software');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE||undefined,
  args:['--mute-audio','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',...(software?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const live=process.env.COZY_DOMESTIC_LIVE==='1',origin=live?'https://jinjinjenn.github.io/cozy/':'https://cozy.test/cozy/';
const realTrackers=process.argv.includes('--public-trackers');
const report={errors:[],origin,transport:realTrackers?'Native RTCDataChannel, public signalling':'Native RTCDataChannel, local signalling fixture'},relay=testNostrRelay();
try{
 const viewport=software?{width:800,height:600}:{width:1440,height:900};
 // Use the smaller backing buffer from the first frame, including restore and reload.
 const deviceScaleFactor=software && process.env.CI==='true' ? 0.5 : 1;
 const context=async(blockPrimary)=>{const ctx=await browser.newContext({viewport,deviceScaleFactor});
   if(!realTrackers)await relay(ctx);
   if(software)await ctx.addInitScript(()=>localStorage.setItem('cozy.graphics','low'));
   if(software&&process.env.CI==='true'&&process.argv.includes('--studio'))await ctx.addInitScript(()=>{
     const raf=requestAnimationFrame.bind(window);
     window.requestAnimationFrame=fn=>setTimeout(()=>raf(fn),90);
   });
   if(!live)await ctx.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!=='https://cozy.test')return r.abort();
     const file=path.resolve(root,u.pathname.slice('/cozy/'.length)||'index.html');assert.ok(file.startsWith(root));
     await r.fulfill({body:await readFile(file),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]});});
   if(blockPrimary)await ctx.route('**/trystero-nostr.min.js',r=>r.abort());
   return ctx;};
 const open=async(url,blockPrimary=false)=>{const p=await(await context(blockPrimary)).newPage();p.on('pageerror',e=>report.errors.push(e.message));
   p.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|WebGLProgram/.test(m.text()))report.errors.push(m.text());});
   await p.goto(url);await p.waitForFunction(()=>window.__cozy?.ready&&window.__cozy.street.session?.ready,null,{timeout:120000});return p;};
 const host=await open(origin+'?space=personal'),guest=await open(await host.evaluate(()=>window.__cozy.street.session.invite()));
 report.version=await host.locator('#graphics-settings summary span').innerText();
 assert.equal(report.version,'v'+JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version);
 await guest.waitForFunction(()=>window.__cozy.street.session.connected,null,{timeout:45000});
 report.peerKinds=await host.evaluate(()=>[...window.__cozy.street.session.peers.keys()]);
 assert.ok(report.peerKinds.some(k=>/^trystero-(nostr|torrent)\//.test(k)));
 const guestId=await guest.evaluate(()=>window.__cozy.street.session.id);
 report.population=await host.evaluate(()=>window.__cozy.street.town.people.length);assert.ok(report.population>400);
 if(process.argv.includes('--studio')){
   report.studio=await playtestStudio({host,guest,open,out});
 }else if(process.argv.includes('--lighting')){
   report.lighting=await playtestLighting({host,guest,open,out});
 }else if(process.argv.includes('--table')){
   report.table=await playtestTable({host,guest,open,out,blockSpectatorPrimary:realTrackers});
 }else if(process.argv.includes('--furnishing')){
   report.furnishing=await playtestFurnishing({host,guest,guestId,open,out});
 }else if(process.argv.includes('--recovery')){
   report.recovery=await playtestRecovery({host,guest,open,origin,out});
 }else if(process.argv.includes('--room')){
   report.room=await playtestRoom({host,guest,guestId,open,out});
 }else{
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
 for(const [action,object] of [['read'],['write'],['cook'],['wash','kitchen'],['wash','basin'],['stretch'],['shower'],['bathroom']]){
   const result=await host.evaluate(({action,object})=>{
     const match=u=>u.action===action&&(!object||u.object===object);
     const c=window.__cozy,s=c.street.session,b=c.island.homes.find(b=>b.name==='Home 58'&&b.uses.some(match))||c.island.homes.find(b=>b.uses.some(match));
     const a=s.actors.get(s.id);s.activities.finish(a);Object.assign(a,b.inside);a.activity='';
     s.command({type:'furniture',lot:b.id,index:b.uses.findIndex(match)});
     for(let i=0;i<1500&&a.walking;i++)s.activities.advance(a,.05);c.render();
     const appliances=c.street.clearExteriors.interiors.appliances;
     const running=[...appliances.flows].filter(([,mesh])=>mesh.visible).map(([key])=>key);
     return {action,actual:a.activity,home:b.id,feedback:a.feedback,running};
   },{action,object});
   assert.equal(result.actual,action,JSON.stringify(result));report.actions.push(result);
   if(['cook','wash','shower'].includes(action))assert.deepEqual(result.running,[{cook:'kitchen/cook',wash:object+'/wash',shower:'shower/shower'}[action]]);
   if(['read','cook'].includes(action))await host.screenshot({path:out+'/home-'+action+'.jpg',type:'jpeg',quality:88});
 }
 // A guest clicks a modelled lamp. Both players see it switch on and the
 // owner's saved layout restores the same lamp after the host reloads.
 const lampHome=await host.evaluate(id=>{
   const c=window.__cozy,s=c.street.session,b=c.island.homes.find(b=>b.uses.some(u=>u.lamp==='nightstand'));
   for(const a of [s.actors.get(s.id),s.actors.get(id)]){s.activities.finish(a);Object.assign(a,b.inside);}
   c.render();return b.id;
 },guestId);
 await guest.waitForFunction(lot=>window.__cozy.street.openRoof===lot,lampHome,{timeout:15000});
 async function frameLamp(page){
   return page.evaluate(async lot=>{
     const c=window.__cozy,b=c.island.homesById.get(lot),{stationsFor}=await import('./src/street-session.js');
     const {homeWorld}=await import('./src/home-plan.js'),{Vector3}=await import('three');
     const spot=stationsFor(b).find(u=>u.lamp==='desk'),target=spot.target,desk=b.furniture.find(f=>f.type==='desk');
     const eye=homeWorld(b,desk.x-2.5,desk.z+2.8);
     await c.setCamera([eye.x,b.y+3.1,eye.z],[target.x,target.y-.15,target.z]);c.render();
     const p=new Vector3(target.x,target.y,target.z).project(c.camera);
     return {x:(p.x*.5+.5)*innerWidth,y:(.5-p.y*.5)*innerHeight};
   },lampHome);
 }
 const click=await frameLamp(guest);await guest.mouse.click(click.x,click.y);
 assert.equal(await guest.locator('#world-action').innerText(),'Switch desk lamp');
 await guest.locator('#world-action').click();
 const lampOn=async p=>p.waitForFunction(lot=>{
   const c=window.__cozy,app=c.street.clearExteriors.interiors.appliances;
   return Boolean(c.street.session.layout.homeLights?.[lot]&1)&&app?.lamps.find(l=>l.kind==='desk')?.level>.9;
 },lampHome,{timeout:15000});
 await lampOn(host);await lampOn(guest);await frameLamp(host);
 await host.screenshot({path:out+'/home-lamp.jpg',type:'jpeg',quality:90});
 report.lamp={lot:lampHome,guestClicked:true,bothLit:true};
 // Work the same pot and dining set through each browser's world picker.
 async function clickStation(page,action,object,label){
   const at=await page.evaluate(async({lot,action,object})=>{
     const c=window.__cozy,b=c.island.homesById.get(lot),{stationsFor}=await import('./src/street-session.js');
     const {homeWorld}=await import('./src/home-plan.js'),{Vector3}=await import('three');
     const spot=stationsFor(b).find(u=>u.action===action&&(!object||u.object===object)),t=spot.target;
     const eye=homeWorld(b,-1.2,b.d/2+2);
     await c.setCamera([eye.x,b.y+6,eye.z],[t.x,t.y,t.z]);c.render();
     const p=new Vector3(t.x,t.y,t.z).project(c.camera);return {x:(p.x*.5+.5)*innerWidth,y:(.5-p.y*.5)*innerHeight};
   },{lot:lampHome,action,object});
   await page.mouse.click(at.x,at.y);assert.equal(await page.locator('#world-action').innerText(),label);
   await page.locator('#world-action').click();
 }
 const state=(page,condition)=>page.waitForFunction(({lot,condition})=>{
   const s=window.__cozy.street.session,a=s.actors.get(s.id);
   if(condition==='ready')return s.layout.homeMeals?.[lot]===2&&window.__cozy.street.clearExteriors.interiors.appliances?.soup.visible;
   if(condition==='consumed')return s.layout.homeMeals?.[lot]===1&&!a.bowlFrom;
   if(condition==='carrying')return a.bowlFrom===lot;
   return a.activity===condition;
 },{lot:lampHome,condition},{timeout:30000});
 async function expectChannel(page,channel){
   await page.waitForFunction(({lot,channel})=>{
     const c=window.__cozy,screen=c.street.clearExteriors.interiors.appliances?.tv;
     return (c.street.session.layout.homeTV?.[lot]||0)===channel&&screen?.channel===channel&&Boolean(screen.mesh?.visible)===Boolean(channel);
   },{lot:lampHome,channel},{timeout:15000});
 }
 await clickStation(host,'watch','sofa','Watch television');await finishRoute();
 await state(host,'watch');await expectChannel(guest,1);
 await clickStation(guest,'watch','sofa','Watch television');await state(guest,'watch');
 assert.equal(await guest.evaluate(()=>{const s=window.__cozy.street.session;return s.actors.get(s.id).using.object;}),'sofa-end');
 await guest.locator('#tv-channel').selectOption('2');await expectChannel(host,2);await expectChannel(guest,2);
 const frame=await host.evaluate(()=>window.__cozy.street.clearExteriors.interiors.appliances.tv.frame);
 await host.waitForFunction(frame=>window.__cozy.street.clearExteriors.interiors.appliances.tv.frame>=frame+2,frame);
 await host.locator('#tv-channel').selectOption('0');await expectChannel(guest,0);
 await guest.locator('#tv-channel').selectOption('3');await expectChannel(host,3);
 await host.evaluate(async lot=>{
   const c=window.__cozy,b=c.island.homesById.get(lot),{homeWorld}=await import('./src/home-plan.js');
   const {televisionIn}=await import('./src/home-fixtures.js'),set=televisionIn(b),target=homeWorld(b,.15,set.z-.10);
   const eye=homeWorld(b,-2.5*set.side,set.z+7.6);
   c.street.cameraFocus=target;
   await c.setCamera([eye.x,b.y+4.3,eye.z],[target.x,b.y+1.48,target.z]);c.render();
 },lampHome);
 await host.waitForFunction(()=>document.querySelector('#tv-channel').value==='3');
 await host.screenshot({path:out+'/home-television.jpg',type:'jpeg',quality:92});
 await host.evaluate(()=>{window.__cozy.street.cameraFocus=null;});
 await guest.locator('#use-place').click();await host.locator('#use-place').click();
 await state(host,'');await state(guest,'');
 report.television={guestJoined:true,sharedChannel:true,screenAnimated:true,switchedOff:true};
 await clickStation(host,'cook',null,'Cook a meal');await finishRoute();
 await state(host,'cook');await state(host,'ready');
 await host.evaluate(lot=>{const s=window.__cozy.street.session;s.command({type:'walk',...s.island.homesById.get(lot).inside});},lampHome);
 await finishRoute();await state(guest,'ready');
 await clickStation(guest,'serveSoup',null,'Take a bowl of soup');await state(guest,'carrying');
 await clickStation(guest,'sit','chair-back','Eat soup at the table');await state(guest,'eat');
 await clickStation(host,'serveSoup',null,'Take a bowl of soup');await finishRoute();await state(host,'carrying');
 await clickStation(host,'sit','chair-front','Eat soup at the table');assert.equal((await finishRoute()).activity,'eat');
 await host.evaluate(async lot=>{const c=window.__cozy,b=c.island.homesById.get(lot),{homeWorld}=await import('./src/home-plan.js');
   const f=b.furniture.find(f=>f.type==='dining'),eye=homeWorld(b,.85,f.z-2.45),aim=homeWorld(b,0,f.z+.32);
   await c.setCamera([eye.x,b.y+2.9,eye.z],[aim.x,b.y+.95,aim.z]);c.street.nextUI=0;c.render();
 },lampHome);
 await host.screenshot({path:out+'/shared-supper.jpg',type:'jpeg',quality:90});
 // Stop the host before the last bite while the guest finishes. Their bowl
 // remains reserved until the owner reloads, then returns to the pot.
 await host.evaluate(()=>window.__cozy.street.session.use());
 await state(guest,'consumed');
 assert.equal(await host.evaluate(()=>{const s=window.__cozy.street.session;return s.actors.get(s.id).bowlFrom;}),lampHome);
 report.supper={lot:lampHome,guestServedAndAte:true,hostCarried:true};
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
 assert.ok(report.simulation.worker);assert.ok(report.simulation.moved>200);assert.equal(report.simulation.blocked,0);
 await host.reload();await host.waitForFunction(lot=>window.__cozy?.ready&&window.__cozy.street.session.owner&&Boolean(window.__cozy.street.session.layout.homeLights?.[lot]&1),lampHome,{timeout:120000});
 report.lamp.restoredAfterReload=true;
 const fresh=await open(await host.evaluate(()=>window.__cozy.street.session.invite()));
 await fresh.waitForFunction(lot=>{const s=window.__cozy.street.session;return s.connected&&s.layout.homeMeals?.[lot]===1&&!Array.from(s.actors.values()).some(a=>a.bowlFrom);},lampHome,{timeout:45000});
 report.supper.reloadAndNewVisitorSawOneServing=true;
 assert.equal(await fresh.evaluate(lot=>window.__cozy.street.session.layout.homeTV?.[lot],lampHome),3);
 report.television.restoredForNewVisitor=true;
 const visitorId=await fresh.evaluate(()=>window.__cozy.street.session.id);
 const studio=await host.evaluate(id=>{
   const c=window.__cozy,s=c.street.session,b=c.island.homes.find(b=>b.furniture.find(f=>f.type==='sofa').d<1.7);
   for(const a of [s.actors.get(s.id),s.actors.get(id)]){s.activities.finish(a);Object.assign(a,b.inside);}
   const index=b.uses.findIndex(u=>u.action==='watch');s.command({type:'furniture',lot:b.id,index});
   return {lot:b.id,index};
 },visitorId);
 await finishRoute();await state(host,'watch');
 await fresh.waitForFunction(lot=>window.__cozy.street.openRoof===lot,studio.lot);
 await fresh.evaluate(({lot,index})=>window.__cozy.street.session.command({type:'furniture',lot,index}),studio);
 await fresh.waitForFunction(()=>{
   const scene=window.__cozy.street;
   return scene.session.actors.get(scene.session.id).using?.object==='rug'&&scene.meshes.get(scene.session.id)?.getObjectByName('watch-on-rug')?.visible;
 });
 report.television.compactHomeFloorSeat=true;
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.error=e.stack;report.passed=false;process.exitCode=1;}
finally{await writeFile(out+'/review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
