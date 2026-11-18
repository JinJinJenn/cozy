import assert from 'node:assert/strict';

export async function playtestLighting({host,guest,open,out}){
  const lot=await host.evaluate(()=>window.__cozy.island.homes.find(h=>h.name==='Home 5').id);
  async function visit(page){
    await page.locator('#directions-open').click();await page.locator('#destination').selectOption(lot);
    await page.locator('#jump-place').click();
    await page.waitForFunction(id=>window.__cozy.street.openRoof===id,lot);
  }
  async function flip(part){
    const point=await guest.evaluate(async ({id,part})=>{
      const c=window.__cozy,st=c.street,home=c.island.homesById.get(id);
      const {Vector3}=await import('three'),{homeWorld}=await import('./src/home-plan.js');
      const entry=st.clearExteriors.interiors.appliances.entry;
      const object=entry[part],target=object.localToWorld(new Vector3(0,part==='glass'?.13:0,0));
      st.cameraFocus={x:target.x,z:target.z};
      for(const dx of [.24,1.6,-1.4]){
        const eye=homeWorld(home,entry.rocker.position.x+dx,entry.rocker.position.z-3.2);
        await c.setCamera([eye.x,home.y+2.25,eye.z],[target.x,home.y+1.48,target.z]);c.render();
        const camera=st.camera.clone();camera.position.lerp(st.controls.target,1-st.cameraFraction());camera.updateMatrixWorld();
        const ndc=target.clone().project(camera),rect=st.controls.domElement.getBoundingClientRect();
        const x=Math.round(rect.left+(1+ndc.x)*rect.width/2),y=Math.round(rect.top+(1-ndc.y)*rect.height/2);
        if(document.elementFromPoint(x,y)!==st.controls.domElement)continue;
        const ray=st.pointerRay({clientX:x,clientY:y});
        if(st.pickAction(ray,false,st.floorPoint(ray,camera.far))?.label==='Flip entry light switch')return {x,y};
      }
      throw Error('The modeled entry switch could not be picked');
    },{id:lot,part});
    await guest.mouse.click(point.x,point.y);
    await guest.locator('#world-choice').getByRole('button',{name:'Flip entry light switch',exact:true}).click();
  }
  const lit=(page,entry,desk,bed)=>page.waitForFunction(({lot,entry,desk,bed})=>{
    const st=window.__cozy.street,app=st.clearExteriors.interiors.appliances;
    if(app?.home.id!==lot)return false;
    const atLevel=(level,on)=>on?level>.9:level<.1;
    return !!st.session.layout.entryLights?.[lot]===entry&&atLevel(app.entry.level,entry)&&
      ((app.entry.rocker.rotation.x>0)===entry)&&atLevel(app.lamps.find(l=>l.kind==='desk').level,desk)&&
      atLevel(app.lamps.find(l=>l.kind==='nightstand').level,bed);
  },{lot,entry,desk,bed},{timeout:45000}).catch(async error=>{
    const details=await page.evaluate(id=>{
      const st=window.__cozy.street,s=st.session,app=st.clearExteriors.interiors.appliances;
      return {owner:s.owner,lot:app?.home.id,wanted:id,entry:s.layout.entryLights,lamps:s.layout.homeLights,
        levels:app?.lamps.map(l=>[l.kind,l.level]),actors:[...s.actors.values()].filter(a=>!a.id.startsWith('resident'))};
    },lot);
    throw Error(error.message+' '+JSON.stringify(details));
  });
  await visit(host);await visit(guest);
  await flip('rocker');
  await Promise.all([lit(host,true,true,true),lit(guest,true,true,true)]);
  await guest.evaluate(async id=>{
    const c=window.__cozy,st=c.street,h=c.island.homesById.get(id),{homeWorld}=await import('./src/home-plan.js');
    const aim=homeWorld(h,-.45,h.d/2-.75);
    st.cameraFocus=aim;
    for(const [depth,show] of [[h.d/2+4,false],[h.d/2-5,true]]){
      const eye=homeWorld(h,Math.min(h.w/2-.4,2.55),depth);
      await c.setCamera([eye.x,h.y+2.8,eye.z],[aim.x,h.y+1.48,aim.z]);c.render();
      if(h.renderHandles.front.visible!==show)throw Error('The entry wall cutaway faces the wrong camera');
    }
  },lot);
  await guest.screenshot({path:out+'/entry-lantern.jpg',type:'jpeg',quality:92});
  await host.locator('#build-open').click();await host.locator('#room-mode').selectOption('lighting');
  assert.equal(await host.getByLabel('Desk lamp',{exact:true}).isChecked(),true);
  await host.getByLabel('Bedside lamp',{exact:true}).uncheck();
  await guest.waitForFunction(id=>window.__cozy.street.session.layout.unlinkedLamps?.[id]===2,lot);
  assert.equal(await guest.locator('#build-open').isVisible(),false);
  assert.equal(await guest.evaluate(id=>{const s=window.__cozy.street.session;return s.linkEntryLamp(s.island.homesById.get(id),2,true);},lot),false);
  await host.locator('#build-open').click();
  await flip('glass');await Promise.all([lit(host,false,false,true),lit(guest,false,false,true)]);
  assert.equal(await host.evaluate(async id=>{
    const s=window.__cozy.street.session,{exportBackup,readBackup}=await import('./src/private-saves.js');
    const pass=crypto.randomUUID(),data=await readBackup(await exportBackup(s.ownerSave.identity,s.layout,s.coffeeVisits,pass,id),pass);
    return !data.layout.entryLights?.[id]&&data.layout.homeLights?.[id]===2&&data.layout.unlinkedLamps?.[id]===2;
  },lot),true);
  const invite=await host.evaluate(()=>window.__cozy.street.session.invite());
  await guest.context().close();await host.reload();await host.waitForFunction(()=>window.__cozy?.street?.session?.ready);
  const fresh=await open(invite);await lit(fresh,false,false,true);
  assert.equal(await fresh.evaluate(id=>window.__cozy.street.session.layout.unlinkedLamps[id],lot),2);
  return {lot,guestClickedSwitch:true,bothLampsLit:true,unlinkedBedsideStayedOn:true,ownerOnlyLinks:true,
    encryptedBackup:true,ownerReload:true,lateVisitor:true};
}
