import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {testNostrRelay} from './test-nostr-relay.mjs';
import {server} from './serve.mjs';
import {playAddresses} from './playtest-addresses.mjs';
import {playPlayers} from './playtest-players.mjs';
import {playPublicStudio} from './playtest-studio.mjs';
import {playFlowers} from './playtest-flowers.mjs';
import {playAdmission} from './playtest-admission.mjs';
import {playBand} from './playtest-band.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium,firefox}=createRequire(process.env.PLAYWRIGHT_FROM||import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const live=process.argv.includes('--live'),relay=process.argv.includes('--relay');
const software=process.argv.includes('--software');
const band=process.argv.includes('--band');
const mixed=process.argv.includes('--mixed');
// Hosted-code verification uses isolated signalling. CI public-relay runs use
// a unique deployment origin so playtest avatars never enter a player's lobby.
assert.ok(!(live&&relay));
const localServer=mixed&&!live;
if(localServer)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=live?'https://jinjinjenn.github.io/cozy/':localServer?'http://127.0.0.1:'+server.address().port+'/':'https://cozy-'+randomUUID()+'.test/cozy/';
const installRelay=testNostrRelay(),errors=[];
let release;
const signalling=new Promise(resolve=>release=resolve);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE||undefined,
  args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--mute-audio',
    ...(software?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const wait=(p,condition,arg)=>p.waitForFunction(condition,arg,{polling:125,timeout:90000});
const ready=p=>wait(p,()=>window.__cozy?.ready&&window.__cozy.street?.session?.ready);
const inspect=p=>p.evaluate(()=>{
  const s=window.__cozy.street.session;
  return {space:s.space,owner:s.owner,id:s.id,pub:s.pub,connected:s.connected,actors:[...s.actors.keys()],
    residents:s.town.people.length,received:s.residentTargets?.length,peers:[...s.peers.keys()],signed:s.verifiedSeq,
    stored:Object.keys(localStorage).filter(k=>k.includes('waterfront-v1')).sort(),revision:s.layout.revision};
});
async function profile(signalGate,engine=browser){
  // Each profile has its own full island. Keep the pointer viewport intact
  // while sharing the hosted runner's software renderer across all three.
  const viewport=process.env.COZY_FLOWER_SHOT?{width:1320,height:790}:{width:960,height:580};
  const ctx=await engine.newContext({viewport,deviceScaleFactor:process.env.CI ? .45 : 1});
  if(software)await ctx.addInitScript(()=>{
    // Three independent towns share one software GPU on the hosted runner.
    // Pace their presentation. WebRTC, Web Audio and town timers run normally.
    const raf=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>setTimeout(()=>raf(callback),90);
  });
  await ctx.addInitScript(()=>localStorage.setItem('cozy.graphics','low'));
  if(!relay)await installRelay(ctx,signalGate);
  await ctx.route(localServer?'**/trystero-nostr.min.js':'**/*',async route=>{
    const url=new URL(route.request().url());
    if(!url.href.startsWith(origin))return route.continue();
    if(url.pathname.endsWith('/trystero-nostr.min.js'))await signalling;
    if(live||localServer)return route.continue();
    const file=path.resolve(root,url.pathname.slice('/cozy/'.length)||'index.html');assert.ok(file.startsWith(root));
    await route.fulfill({body:await readFile(file),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.mp3':'audio/mpeg'}[path.extname(file)]});
  });
  const page=await ctx.newPage();page.on('pageerror',e=>{errors.push(e.message);if(mixed)console.error(engine.browserType().name(),e.message);});return page;
}
const paired=p=>wait(p,()=>{
  const s=window.__cozy.street.session;
  return s.space==='public'&&(s.owner||s.connected)&&[...s.actors.keys()].filter(id=>!id.startsWith('resident')).length===2;
});
async function navigate(page,selector){
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator(selector).click()]);
  await ready(page);
}
let secondEngine;
try{
  if(mixed)secondEngine=await firefox.launch({headless:true,executablePath:process.env.FIREFOX_EXE||undefined,
    firefoxUserPrefs:{'media.peerconnection.ice.obfuscate_host_addresses':false,'media.peerconnection.ice.loopback':true}});
  const pages=await Promise.all([profile(),profile(undefined,secondEngine)]);
  await Promise.all(pages.map(async p=>{await p.goto(origin,{waitUntil:'domcontentloaded'});await ready(p);}));
  const starts=await Promise.all(pages.map(inspect));
  assert.ok(starts.every(s=>s.space==='public'&&s.owner&&s.stored.length===0));
  assert.notEqual(starts[0].pub,starts[1].pub);
  release();
  await Promise.all(pages.map(paired));
  const snapshots=await Promise.all(pages.map(inspect));
  assert.equal(snapshots[0].pub,snapshots[1].pub);
  assert.notEqual(snapshots[0].owner,snapshots[1].owner);
  const hostIndex=snapshots.findIndex(s=>s.owner),host=pages[hostIndex],guest=pages[1-hostIndex];
  const remote=snapshots[1-hostIndex],authority=snapshots[hostIndex];
  assert.equal(remote.received,authority.residents);assert.ok(remote.received>400);
  assert.ok(remote.signed>0&&authority.peers.some(p=>p.startsWith('trystero-nostr/')));
  assert.deepEqual(remote.actors.sort(),authority.actors.sort());
  if(mixed){
    const addressLists=await Promise.all(pages.map(p=>p.evaluate(()=>window.__cozy.island.homes.map(h=>h.id))));
    assert.deepEqual(addressLists[0],addressLists[1]);assert.equal(addressLists[0].length,459);
    for(const id of ['frontage-r40-3-r','frontage-r40-0-r','frontage-r49-2-r']){
      await guest.evaluate(place=>window.__cozy.street.session.command({type:'teleport',place}),id);
      await wait(guest,place=>window.__cozy.street.openRoof===place,id);
      await wait(host,([place,peer])=>{
        const c=window.__cozy,s=c.street.session,h=c.island.homesById.get(place),a=s.actors.get(peer);
        return a&&Math.hypot(a.x-h.inside.x,a.z-h.inside.z)<3;
      },[id,remote.id]);
    }
    assert.deepEqual(errors,[]);console.log('PASS Chromium and Firefox share one ordered town, 459 resident poses and all three previously divergent home addresses over native WebRTC.');
  }else if(band){
    await playBand({host,guest,profile,ready,wait});assert.deepEqual(errors,[]);
  }else if(process.argv.includes('--door')){
    await playAdmission({host,guest,wait,ready,navigate,profile});assert.deepEqual(errors,[]);
  }else if(process.argv.includes('--flowers')){
    try{await playFlowers({host,guest,wait,ready,navigate});assert.deepEqual(errors,[]);}
    catch(error){
      for(const page of [host,guest])console.error(await page.evaluate(()=>{
        const st=window.__cozy.street,s=st.session,b=st.destination;
        return {space:s.space,ready:s.ready,owner:s.owner,connected:s.connected,bed:b?.id,entry:b?.entry,cut:s.layout.cutFlowerBeds,
          players:[...s.actors.values()].filter(a=>!a.id.startsWith('resident')).map(a=>({x:a.x,z:a.z,activity:a.activity,travel:a.travelSeq,using:a.using?.object,feedback:a.feedback,flower:a.profile?.flower})),
          notice:document.querySelector('#street-note').textContent};
      }).catch(()=>null));
      throw error;
    }
  }else if(process.argv.includes('--studio')){
    await playPublicStudio({host,guest,wait,navigate});assert.deepEqual(errors,[]);
  }else if(process.argv.includes('--players')){
    await playPlayers({host,guest,paired,ready,wait,navigate,profile,isolatedRelay:!relay});assert.deepEqual(errors,[]);
  }else if(process.argv.includes('--addresses')){
    await playAddresses({host,guest,paired,ready,wait,navigate,profile});assert.deepEqual(errors,[]);
  }else{
  assert.equal(await host.evaluate(()=>window.__cozy.street.session.edit(.5)),false);
  const start=await guest.evaluate(()=>{const s=window.__cozy.street.session;return s.actors.get(s.id);});
  await guest.keyboard.down('d');
  try{
    await wait(host,({id,x,z})=>{const a=window.__cozy.street.session.actors.get(id);return a&&Math.hypot(a.x-x,a.z-z)>1.25;},start);
  }finally{await guest.keyboard.up('d');}
  if(process.env.COZY_PUBLIC_SHOT){
    await mkdir(path.dirname(process.env.COZY_PUBLIC_SHOT),{recursive:true});
    await host.screenshot({path:process.env.COZY_PUBLIC_SHOT,type:'jpeg',quality:89});
  }
  console.log('PASS simultaneous ordinary arrivals and delayed signalling converge over native WebRTC, with remote movement and',remote.received,'resident poses');
  await navigate(host,'#build-open');
  await host.locator('#build-pane').waitFor({state:'visible'});
  const privateState=await inspect(host);
  assert.equal(privateState.space,'personal');assert.ok(privateState.owner);assert.notEqual(privateState.pub,authority.pub);
  await host.locator('#wall-offset').fill('0.5');await host.locator('#apply-wall').click();
  await wait(host,()=>window.__cozy.street.session.layout.revision===1);
  const saved=await host.evaluate(()=>JSON.stringify(window.__cozy.street.session.layout));
  await host.locator('#social-open').click();await host.locator('#copy-street').click();
  const invite=await host.locator('#invite-url').inputValue();
  assert.equal(new URL(invite).searchParams.get('visit'),privateState.pub);
  const visitor=await profile();await visitor.goto(invite);await ready(visitor);
  await wait(visitor,()=>window.__cozy.street.session.connected);
  const privateGuest=await inspect(visitor);assert.equal(privateGuest.space,'visit');assert.equal(privateGuest.revision,1);
  await wait(guest,()=>window.__cozy.street.session.owner&&window.__cozy.street.session.actors.size===3);
  assert.equal((await inspect(guest)).revision,0);assert.deepEqual((await inspect(guest)).stored,[]);
  await visitor.context().close();
  await navigate(host,'#public-street');await Promise.all([paired(host),paired(guest)]);
  assert.equal((await inspect(host)).revision,0);
  await host.locator('#social-open').click();await navigate(host,'#personal-street');
  assert.equal((await inspect(host)).pub,privateState.pub);
  assert.equal(await host.evaluate(()=>JSON.stringify(window.__cozy.street.session.layout)),saved);
  assert.deepEqual(errors,[]);
  console.log('PASS public host departure, private owner build, legacy invite, isolated public layout and private save recovery');
  }
}finally{release();await secondEngine?.close();await browser.close();if(localServer)server.close();}
