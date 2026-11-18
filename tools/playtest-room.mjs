import assert from 'node:assert/strict';

export async function playtestRoom({host,guest,guestId,open,out}){
  const lot=await host.evaluate(id=>{
    const c=window.__cozy,s=c.street.session,b=c.island.homes.find(b=>b.name==='Home 58');
    for(const a of [s.actors.get(s.id),s.actors.get(id)]){s.activities.finish(a);Object.assign(a,b.inside);}
    c.render();return b.id;
  },guestId);
  await guest.waitForFunction(id=>window.__cozy.street.openRoof===id,lot);
  await guest.evaluate(lot=>{
    const s=window.__cozy.street.session,b=s.island.homesById.get(lot);
    s.command({type:'furniture',lot,index:b.uses.findIndex(u=>u.action==='sit'&&u.object==='sofa')});
  },lot);
  await host.waitForFunction(id=>window.__cozy.street.session.actors.get(id)?.using?.object==='sofa',guestId);
  const seat=await host.evaluate(id=>window.__cozy.street.session.actors.get(id).using.index,guestId);
  await host.locator('#build-open').click();
  assert.equal(await host.locator('#build-lot').inputValue(),lot);
  assert.ok(await host.locator('#room-tools').isVisible());
  assert.equal(await guest.locator('#build-open').isVisible(),false);
  // Use the actual range and rotate controls. The chosen vertical wall has
  // its doorway on the centreline of this particular generated footprint.
  if(!await host.evaluate(()=>window.__cozy.street.homeEditor.turn))await host.locator('#room-rotate').click();
  for(const [id,value] of [['room-line','2'],['room-door','0']])await host.locator('#'+id).fill(value);
  assert.ok(await host.locator('#room-apply').isEnabled(),await host.locator('#room-status').innerText());
  assert.equal(await guest.evaluate(lot=>window.__cozy.island.homesById.get(lot).walls.some(w=>w.divider),lot),false);
  await host.locator('#room-apply').click();
  const presented=async p=>p.waitForFunction(lot=>{
    const c=window.__cozy,i=c.street.clearExteriors.interiors;
    return i.open?.id===lot&&i.dividerMesh?.children.some(m=>m.isInstancedMesh&&m.count>0)&&c.island.homesById.get(lot).walls.filter(r=>r.divider).length===2;
  },lot,{timeout:25000});
  await presented(host);await presented(guest);
  await host.locator('#build-open').click();
  assert.equal(await guest.evaluate(()=>{const s=window.__cozy.street.session;return s.actors.get(s.id).using.index;}),seat);
  await host.evaluate(async lot=>{
    const c=window.__cozy,b=c.island.homesById.get(lot),{homeWorld}=await import('./src/home-plan.js');
    const eye=homeWorld(b,4,b.d/2+5),aim=homeWorld(b,0,0);
    await c.setCamera([eye.x,b.y+9,eye.z],[aim.x,b.y+.85,aim.z]);c.render();
  },lot);
  await host.screenshot({path:out+'/home-divider.jpg',type:'jpeg',quality:91});
  await host.locator('#build-open').click();await host.locator('#room-remove').click();
  await guest.waitForFunction(()=>!window.__cozy.street.clearExteriors.interiors.dividerMesh);
  await host.locator('#room-undo').click();await presented(guest);
  await host.locator('#build-open').click();
  const trip=await guest.evaluate(async lot=>{
    const s=window.__cozy.street.session,b=s.island.homesById.get(lot),{homeWorld,homeLocal}=await import('./src/home-plan.js');
    const exit=homeLocal(b,s.actors.get(s.id).using.exit),goal=homeWorld(b,1+(exit.x<1?.62:-.62),0);
    s.command({type:'walk',...goal});return goal;
  },lot);
  await guest.waitForFunction(goal=>{
    const s=window.__cozy.street.session,a=s.actors.get(s.id);return !a.walking&&!a.using&&Math.hypot(a.x-goal.x,a.z-goal.z)<.25;
  },trip,{timeout:20000});
  await guest.context().close();await host.reload();
  await host.waitForFunction(lot=>window.__cozy?.street?.session?.ready&&window.__cozy.island.homesById.get(lot).divider?.[1]===2,lot,{timeout:120000});
  const fresh=await open(await host.evaluate(()=>window.__cozy.street.session.invite()));
  await fresh.waitForFunction(lot=>window.__cozy.street.session.connected&&window.__cozy.island.homesById.get(lot).divider?.[1]===2,lot,{timeout:45000});
  return {lot,seat,previewStayedLocal:true,bothRendered:true,guestRetainedSeat:true,removeAndUndo:true,walkedAcross:true,ownerReload:true,newGuest:true};
}
