import assert from 'node:assert/strict';

export async function playtestFurnishing({host,guest,guestId,open,out}){
  const lot=await host.evaluate(id=>{
    const c=window.__cozy,s=c.street.session,b=c.island.homes.find(h=>h.name==='Home 58');
    for(const a of [s.actors.get(s.id),s.actors.get(id)]){s.activities.finish(a);Object.assign(a,b.inside);}
    c.render();return b.id;
  },guestId);
  await guest.waitForFunction(id=>window.__cozy.street.openRoof===id,lot);
  await guest.evaluate(lot=>{
    const s=window.__cozy.street.session,h=s.island.homesById.get(lot);
    s.command({type:'furniture',lot,index:h.uses.findIndex(u=>u.action==='sit'&&u.object==='sofa')});
  },lot);
  await host.waitForFunction(id=>window.__cozy.street.session.actors.get(id)?.using?.object==='sofa',guestId);
  await host.locator('#build-open').click();await host.locator('#room-mode').selectOption('furniture');
  await host.locator('#furniture-item').selectOption('sofa');await host.locator('#furniture-rotate').click();
  assert.equal(await host.locator('#furniture-apply').isEnabled(),false);
  assert.match(await host.locator('#furniture-status').innerText(),/Someone is using/);
  assert.equal(await guest.locator('#build-open').isVisible(),false);
  await host.locator('#furniture-item').selectOption('desk');
  const point=await host.evaluate(async()=>{
    const st=window.__cozy.street,e=st.homeEditor.furniture,b=e.home;
    const {homeWorld}=await import('./src/home-plan.js'),{Vector3}=await import('three');
    const p=homeWorld(b,e.source.x-.5,e.source.z-.5),r=st.controls.domElement.getBoundingClientRect();
    const v=new Vector3(p.x,b.y,p.z).project(st.camera);
    const x=r.left+(v.x+1)*r.width/2,y=r.top+(1-v.y)*r.height/2;
    if(document.elementFromPoint(x,y)!==st.controls.domElement)throw Error('The room editor covers the placement target.');
    return {x,y};
  });
  await host.mouse.click(point.x,point.y);await host.mouse.click(point.x,point.y,{button:'right'});
  assert.deepEqual(await host.evaluate(()=>window.__cozy.street.homeEditor.furniture.draft),[-2,-2,1]);
  await host.keyboard.press('Comma');
  assert.equal(await host.evaluate(()=>window.__cozy.street.homeEditor.furniture.turn),0);
  await host.keyboard.press('Period');
  assert.equal(await host.locator('#furniture-apply').isEnabled(),true,await host.locator('#furniture-status').innerText());
  assert.equal(await guest.evaluate(lot=>!!window.__cozy.island.homesById.get(lot).placements?.desk,lot),false);
  await host.locator('#furniture-apply').click();
  const placed=page=>page.waitForFunction(lot=>{
    const st=window.__cozy.street,h=st.session.island.homesById.get(lot),art=st.clearExteriors.interiors;
    return h.placements?.desk?.join(',')==='-2,-2,1'&&art.drawnFurnitureRevision===h.furnishingRevision&&art.open?.id===lot;
  },lot,{timeout:30000});
  await placed(host);await placed(guest);
  assert.equal(await guest.evaluate(()=>{const s=window.__cozy.street.session;return s.actors.get(s.id).using?.object;}),'sofa');
  await host.locator('#furniture-undo').click();
  await guest.waitForFunction(lot=>!window.__cozy.island.homesById.get(lot).placements?.desk,lot);
  await host.locator('#furniture-x').fill('-2');await host.locator('#furniture-z').fill('-2');
  await host.locator('#furniture-rotate').click();await host.locator('#furniture-apply').click();
  await placed(guest);
  await host.screenshot({path:out+'/furnish-home.jpg',type:'jpeg',quality:91});
  await host.locator('#build-open').click();
  const target=await guest.evaluate(async lot=>{
    const c=window.__cozy,st=c.street,h=c.island.homesById.get(lot);
    const {stationsFor}=await import('./src/street-session.js'),{Vector3}=await import('three'),{homeWorld}=await import('./src/home-plan.js');
    const lamp=st.clearExteriors.interiors.appliances.lamps.find(l=>l.kind==='desk');
    const t=stationsFor(h).find(u=>u.lamp==='desk').target,v=lamp.shade.getWorldPosition(new Vector3());
    const distance=Math.hypot(v.x-t.x,v.y-t.y,v.z-t.z),desk=h.furniture.find(f=>f.id==='desk');
    const eye=homeWorld(h,desk.x-1.8,desk.z+2);
    st.cameraFocus={x:t.x,z:t.z};
    await c.setCamera([eye.x,h.y+3.1,eye.z],[t.x,t.y-.1,t.z]);c.render();
    const r=st.controls.domElement.getBoundingClientRect();v.set(t.x,t.y,t.z).project(c.camera);
    const x=r.left+(v.x+1)*r.width/2,y=r.top+(1-v.y)*r.height/2;
    if(document.elementFromPoint(x,y)!==st.controls.domElement)throw Error('The lamp is covered in the guest view.');
    return {distance,x,y};
  },lot);
  assert.ok(target.distance<.001,'Lamp and click target diverged by '+target.distance);
  await guest.mouse.click(target.x,target.y);assert.equal(await guest.locator('#world-action').innerText(),'Switch desk lamp');
  await guest.locator('#world-action').click();
  for(const page of [host,guest])await page.waitForFunction(lot=>{
    const st=window.__cozy.street;
    return (st.session.layout.homeLights?.[lot]&1)&&st.clearExteriors.interiors.appliances?.lamps.find(l=>l.kind==='desk').level>.9;
  },lot,{timeout:30000});
  assert.ok(await host.evaluate(async lot=>{
    const s=window.__cozy.street.session,{exportBackup,readBackup}=await import('./src/private-saves.js');
    const password=crypto.randomUUID(),backup=await exportBackup(s.ownerSave.identity,s.layout,s.coffeeVisits,password,lot);
    const data=await readBackup(backup,password);return data.layout.furnishings.lots[lot].desk.join(',')==='-2,-2,1';
  },lot));
  const invite=await host.evaluate(()=>window.__cozy.street.session.invite());
  await guest.context().close();await host.reload();
  await host.waitForFunction(lot=>window.__cozy?.street?.session?.ready&&window.__cozy.island.homesById.get(lot).placements?.desk?.[2]===1,lot,{timeout:120000});
  const fresh=await open(invite);
  await fresh.waitForFunction(lot=>{
    const st=window.__cozy.street;return st.session.connected&&Boolean(st.session.layout.homeLights?.[lot]&1)&&st.session.island.homesById.get(lot).placements?.desk?.join(',')==='-2,-2,1';
  },lot,{timeout:45000});
  return {lot,deskOffsetMetres:[-.5,-.5],rotationDegrees:90,occupiedSofaProtected:true,guestHeldSeat:true,undo:true,
    floorClick:true,rightClickRotate:true,lampPickErrorMetres:target.distance,guestSwitchedMovedLamp:true,encryptedBackup:true,ownerReload:true,lateJoin:true};
}
