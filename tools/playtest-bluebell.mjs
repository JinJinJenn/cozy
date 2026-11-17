import assert from 'node:assert/strict';
import path from 'node:path';

export async function playBluebell(host,guest,checkLateJoin,shots){
  const original=host.viewportSize();
  await guest.locator('#directions-open').click();
  await guest.locator('#destination').selectOption('house');
  await guest.locator('#home-invite').click();
  await host.setViewportSize({width:1100,height:700});
  await host.locator('#build-open').click();
  await host.locator('#build-lot').selectOption('l108');
  // Let the visitor clear the doorway first. A wall legitimately stops if the
  // test starts dragging as the guest crosses its sweep.
  await guest.waitForFunction(()=>{
    const s=window.__cozy.street.session,a=s.actors.get(s.id),bea=s.actors.get('resident1');
    return a.homeVisit&&a.outing==='chat'&&a.activity==='sit'&&bea.activity==='sit'&&bea.cup;
  },null,{timeout:65000});
  const grip=await host.locator('#wall-grip').boundingBox();
  const delta=await host.evaluate(async()=>{
    const {Vector3}=await import('three'),{toWorld}=await import('./src/street-world.js');
    const c=window.__cozy,b=c.street.buildLot;
    function screen(x,z){const q=toWorld(b,x,z);return new Vector3(q.x,b.y+2.25,q.z).project(c.camera);}
    const start=screen(b.w/2,b.d/2),end=screen(b.w/2+1,b.d/2+.5);
    return [(end.x-start.x)*innerWidth/2,(start.y-end.y)*innerHeight/2];
  });
  const x=grip.x+grip.width/2,y=grip.y+grip.height/2;
  await host.mouse.move(x,y);await host.mouse.down();await host.mouse.move(x+delta[0],y+delta[1],{steps:6});await host.mouse.up();
  await guest.waitForFunction(()=>{const h=window.__cozy.street.session.layout.homes.l108;return h?.wall===.5&&h.side===1;});
  await host.locator('#side-offset').fill('1.5');await host.locator('#apply-wall').click();
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session;return s.layout.homes.l108.side===1.5&&s.actors.get(s.id).outing==='chat';});
  if(shots){
    await host.screenshot({path:path.join(shots,'bluebell-remodel.jpg'),quality:86});
    await guest.bringToFront();
    await guest.setViewportSize({width:1100,height:700});
    await guest.evaluate(()=>{const c=window.__cozy,b=c.street.plots.find(p=>p.kind==='house'),t=c.controls.target;
      c.camera.position.set(t.x+b.c*3.8+b.s*4,t.y+3.2,t.z-b.s*3.8+b.c*4);c.controls.update();c.street.render();});
    await guest.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await guest.screenshot({path:path.join(shots,'tea-at-bluebell.jpg'),quality:88});
    await guest.setViewportSize(original);
  }
  await checkLateJoin();
  await guest.locator('#coffee-action').click();
  await guest.waitForFunction(()=>!window.__cozy.street.session.actors.get(window.__cozy.street.session.id).homeVisit);
  const old=await guest.evaluate(()=>window.__cozy.street.session.hostBoot);
  await host.reload({waitUntil:'domcontentloaded',timeout:120000});
  await guest.waitForFunction(boot=>{const s=window.__cozy.street.session;return s.connected&&s.hostBoot!==boot&&s.layout.homes.l108.side===1.5;},old,{timeout:60000});
  await host.locator('#build-open').click();await host.locator('#build-lot').selectOption('l108');
  await host.locator('#undo-wall').click();await guest.waitForFunction(()=>window.__cozy.street.session.layout.homes.l108.side===1);
  await host.locator('#undo-wall').click();await guest.waitForFunction(()=>{const h=window.__cozy.street.session.layout.homes.l108;return !h.side&&!h.wall&&!h.undo.length;});
  await host.locator('#build-open').click();await host.setViewportSize(original);
  console.log('PASS guest visited Bea for tea, corner drag replicated both walls, seated visit continued, reload and undo restored both dimensions');
}
