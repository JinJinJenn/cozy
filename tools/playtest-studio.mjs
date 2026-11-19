import assert from 'node:assert/strict';

async function clickItem(page,lot,id,label){
  const angles=[[1.7,2.8],[2.2,1.8],[-1.8,2.6],[-2.8,1.7],[.2,2.8]],hits=[];
  for(const [dx,dz] of angles){
    const point=await page.evaluate(async ({lot,id,label,dx,dz})=>{
      const c=window.__cozy,st=c.street,h=c.island.homesById.get(lot);
      const {stationsFor}=await import('./src/street-session.js'),{homeWorld}=await import('./src/home-plan.js'),{Vector3}=await import('three');
      const spot=stationsFor(h).find(u=>u.object===id),item=h.furniture.find(f=>f.id===id),t=spot.target;
      st.cameraFocus={x:t.x,z:t.z};
      const eye=homeWorld(h,item.x+dx,item.z+dz);
      // Aim at the cushion or canvas rather than the higher standing eye line.
      await c.setCamera([eye.x,h.y+2.25,eye.z],[t.x,t.y,t.z]);c.render();
      const cam=c.camera.clone();cam.position.lerp(st.controls.target,1-st.cameraFraction());cam.updateMatrixWorld();
      const rect=st.controls.domElement.getBoundingClientRect();
      for(const dy of [0,.14,-.14]){
        const v=new Vector3(t.x,t.y+dy,t.z).project(cam);
        const x=Math.round(rect.left+(1+v.x)*rect.width/2),y=Math.round(rect.top+(1-v.y)*rect.height/2);
        if(document.elementFromPoint(x,y)!==st.controls.domElement)continue;
        const ray=st.pointerRay({clientX:x,clientY:y});
        if(st.pickAction(ray,false,st.floorPoint(ray,cam.far))?.label===label)return {x,y};
      }
      return null;
    },{lot,id,label,dx,dz});
    if(!point)continue;
    await page.mouse.click(point.x,point.y);
    const choice=page.locator('#world-choice').getByRole('button',{name:label,exact:true});
    if(await choice.isVisible()){await choice.click();return;}
    hits.push(await page.locator('#world-action').textContent());
    await page.keyboard.press('Escape');
  }
  throw Error('Could not click '+label+' in the rendered room. Pointer hits: '+JSON.stringify(hits));
}

export async function playtestStudio({host,guest,open,out}){
  const lot=await host.evaluate(()=>window.__cozy.island.homes.find(b=>b.name==='Home 5').id);
  const gallery=await host.evaluate(()=>window.__cozy.island.homes.find(b=>b.name==='Home 9').id);
  async function visit(page,to=lot){
    await page.locator('#directions-open').click();await page.locator('#destination').selectOption(to);
    await page.locator('#jump-place').click();await page.waitForFunction(id=>window.__cozy.street.openRoof===id,to);
  }
  async function setup(id,x,z,rotate=false){
    await host.locator('#furniture-item').selectOption(id);await host.locator('#furniture-x').fill(String(x));await host.locator('#furniture-z').fill(String(z));
    if(rotate)await host.locator('#furniture-rotate').click();
    assert.ok(await host.locator('#furniture-apply').isEnabled(),await host.locator('#furniture-status').innerText());
    await host.locator('#furniture-apply').click();
    await guest.waitForFunction(({lot,id})=>window.__cozy.island.homesById.get(lot).placements?.[id],{lot,id});
  }
  const stage=(page,n)=>page.waitForFunction(({lot,n})=>{
    const st=window.__cozy.street,s=st.session,art=st.clearExteriors.interiors.appliances;
    return s.connected||s.owner?art?.home.id===lot&&art.easels.find(e=>e.id==='easel-1')?.stage===n:false;
  },{lot,n},{timeout:60000});
  await visit(host);await visit(guest);
  await host.locator('#build-open').click();await host.locator('#room-mode').selectOption('furniture');
  await setup('armchair-1',4,6,true);await setup('easel-1',-6,-4);
  await guest.bringToFront();
  await clickItem(guest,lot,'armchair-1','Sit in the teal club chair');
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session;return s.actors.get(s.id).using?.object==='armchair-1';},null,{polling:125,timeout:60000});
  await host.locator('#furniture-item').selectOption('armchair-1');
  await host.waitForFunction(()=>document.querySelector('#furniture-pack').disabled);
  await guest.locator('#use-place').click();
  await clickItem(guest,lot,'easel-1','Paint Harbor at dawn');
  // The two peers can present different frames of the same stroke. Stop the
  // guest's brush on a visible partial painting, then compare the saved stage.
  const partial=await guest.waitForFunction(lot=>{
    const st=window.__cozy.street,art=st.clearExteriors.interiors.appliances;
    const n=art?.home.id===lot&&art.easels.find(e=>e.id==='easel-1')?.stage;
    const button=document.querySelector('#use-place');
    if(!(n>=1&&n<4)||button.textContent!=='Put brush down')return false;
    const box=button.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
    return document.elementFromPoint(x,y)===button?{x,y}:false;
  },lot,{polling:50,timeout:60000});
  const brush=await partial.jsonValue();await partial.dispose();
  await guest.mouse.click(brush.x,brush.y);
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session;return !s.actors.get(s.id).activity;});
  const savedStage=await guest.evaluate(()=>window.__cozy.street.clearExteriors.interiors.appliances.easels.find(e=>e.id==='easel-1').stage);
  assert.ok(savedStage>=1&&savedStage<4,'the visitor stopped with an unfinished canvas');
  await stage(host,savedStage);
  await host.locator('#furniture-pack').click();
  await guest.waitForFunction(lot=>!window.__cozy.island.homesById.get(lot).placements?.['armchair-1'],lot);
  await host.locator('#furniture-undo').click();
  await guest.waitForFunction(lot=>!!window.__cozy.island.homesById.get(lot).placements?.['armchair-1'],lot);
  await host.locator('#build-open').click();
  await clickItem(guest,lot,'easel-1','Continue Harbor at dawn');
  await Promise.all([stage(host,4),stage(guest,4)]);
  await guest.locator('#easel-print').waitFor({state:'visible'});
  assert.equal(await guest.locator('#easel-title').innerText(),'Harbor at dawn');
  const [download]=await Promise.all([guest.waitForEvent('download'),guest.locator('#easel-save').click()]);
  assert.equal(download.suggestedFilename(),'Harbor at dawn.png');
  const bytes=[];for await(const chunk of await download.createReadStream())bytes.push(chunk);
  const png=Buffer.concat(bytes);assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[640,480]);assert.ok(png.length>4000);
  await guest.evaluate(async id=>{
    const c=window.__cozy,st=c.street,h=c.island.homesById.get(id),{homeWorld}=await import('./src/home-plan.js');
    const aim=homeWorld(h,-.9,-.2),eye=homeWorld(h,2.8,3.75);st.cameraFocus=aim;
    await c.setCamera([eye.x,h.y+3.0,eye.z],[aim.x,h.y+1.3,aim.z]);c.render();
  },lot);
  await guest.screenshot({path:out+'/studio.jpg',type:'jpeg',quality:92});
  await guest.locator('#use-place').click();await visit(guest,gallery);
  await clickItem(host,lot,'easel-1','View Harbor at dawn');
  await host.locator('#easel-keep').click();await host.getByRole('button',{name:'In collection'}).waitFor();
  await visit(host,gallery);await host.locator('#build-open').click();await host.locator('#room-mode').selectOption('gallery');
  assert.equal(await host.locator('#gallery-print option').allTextContents()+'','Harbor at dawn');
  await host.locator('#gallery-hang').click();
  const frame=(page,value)=>page.waitForFunction(({lot,value})=>{
    const st=window.__cozy.street;
    return st.openRoof===lot&&(st.session.layout.wallPrints?.[lot]||0)===value;
  },{lot:gallery,value});
  await frame(guest,1);
  assert.equal(await guest.evaluate(id=>{const c=window.__cozy;return c.street.session.hangPrint(c.island.homesById.get(id),0);},gallery),false);
  await host.locator('#gallery-clear').click();await frame(guest,0);
  await host.locator('#gallery-frame').selectOption('1');await host.locator('#gallery-hang').click();await frame(guest,3);
  const view=async page=>{
    await page.bringToFront();
    await page.evaluate(async id=>{
      const c=window.__cozy,st=c.street,h=c.island.homesById.get(id),{homeWorld}=await import('./src/home-plan.js');
      const aim=homeWorld(h,0,-h.d/2+.16),eye=homeWorld(h,.3,-h.d/2+3.2);
      st.cameraFocus=aim;await c.setCamera([eye.x,h.y+2.05,eye.z],[aim.x,h.y+1.48,aim.z]);st.render();c.render();
    },gallery);
    const getPoint=await page.waitForFunction(()=>{
      const c=window.__cozy,st=c.street,panel=st.clearExteriors.interiors.appliances?.gallery?.panel;
      if(!panel?.visible)return;
      const cam=c.camera.clone();cam.position.lerp(st.controls.target,1-st.cameraFraction());cam.updateMatrixWorld();
      const r=st.controls.domElement.getBoundingClientRect(),{width,height}=panel.geometry.parameters;
      for(const fx of [0,.31,-.31])for(const fy of [0,.3,-.3]){
        const uv=panel.localToWorld(st.point.clone().set(width*fx,height*fy,0)).project(cam);
        const x=Math.round(r.left+(1+uv.x)*r.width/2),y=Math.round(r.top+(1-uv.y)*r.height/2);
        if(document.elementFromPoint(x,y)!==st.controls.domElement)continue;
        const ray=st.pointerRay({clientX:x,clientY:y});
        if(st.pickAction(ray,true,st.floorPoint(ray,cam.far))?.command?.type==='view-print')return {x,y};
      }
    },null,{timeout:15000});
    const point=await getPoint.jsonValue();await getPoint.dispose();
    await page.mouse.click(point.x,point.y,{button:'right'});
    const pick=await page.locator('#world-action').textContent();
    assert.equal(pick,'View Harbor at dawn',JSON.stringify(await page.evaluate(({x,y})=>{
      const st=window.__cozy.street,ray=st.pointerRay({clientX:x,clientY:y});
      return {worldChoice:document.querySelector('#world-choice').innerText,hit:st.pickAction(ray,true,st.floorPoint(ray,st.camera.far))?.label,
        at:document.elementFromPoint(x,y)?.id,target:st.controls.target.toArray(),eye:st.camera.position.toArray(),roof:st.openRoof,x,y};
    },point)));
    await page.locator('#world-choice').getByRole('button',{name:'View Harbor at dawn',exact:true}).click();
    await page.locator('#print-close').waitFor({state:'visible'});
  };
  await view(guest);await guest.locator('#easel-keep').click();await guest.getByRole('button',{name:'In collection'}).waitFor();
  await guest.locator('#print-close').click();await guest.locator('#easel-print').waitFor({state:'hidden'});
  await guest.screenshot({path:out+'/wall-print.jpg',type:'jpeg',quality:92});
  assert.ok(await host.evaluate(async ({lot,gallery})=>{
    const s=window.__cozy.street.session,{exportBackup,printCollection,readBackup}=await import('./src/private-saves.js');
    const pass=crypto.randomUUID(),file=await exportBackup(s.ownerSave.identity,s.layout,s.coffeeVisits,pass,gallery,null,false,printCollection(s.localSlot));
    const {layout,prints}=await readBackup(file,pass);
    return layout.homePaintings[lot]===4&&layout.furnishings.lots[lot]['armchair-1'][2]===1&&layout.wallPrints[gallery]===3&&prints===1;
  },{lot,gallery}));
  const invite=await host.evaluate(()=>window.__cozy.street.session.invite());await guest.context().close();
  await host.reload();await host.waitForFunction(()=>window.__cozy?.ready&&window.__cozy.street?.session?.ready,null,{timeout:120000});
  const fresh=await open(invite);await frame(fresh,3);
  await fresh.waitForFunction(()=>window.__cozy.street.session.connected);
  await view(fresh);await fresh.locator('#print-close').click();
  await visit(fresh);await stage(fresh,4);await clickItem(fresh,lot,'easel-1','View Harbor at dawn');
  await fresh.locator('#easel-print').waitFor({state:'visible'});
  return {guestSeated:true,occupiedChairProtected:true,packUndo:true,interruptedPaintingResumed:true,sharedCanvas:true,printPixels:[640,480],wallInAnotherHouse:true,guestCollectedFramedPrint:true,encryptedBackup:true,ownerReload:true,freshVisitor:true};
}

export async function playPublicStudio({host,guest,wait,navigate}){
  const lot=await host.evaluate(()=>window.__cozy.street.session.studioLot);
  assert.ok(lot,'The canonical public town should have a furnished art studio');
  for(const page of [host,guest]){
    await page.locator('#directions-open').click();await page.locator('#visit-studio').click();
    await wait(page,lot=>window.__cozy.street.openRoof===lot&&window.__cozy.street.clearExteriors.interiors.appliances?.easels.length===2,lot);
  }
  await clickItem(guest,lot,'easel-2','Paint Poppies by the path');
  await clickItem(host,lot,'easel-1','Paint Harbor at dawn');
  for(const page of [guest,host]){
    await wait(page,()=>{
      const st=window.__cozy.street,art=st.clearExteriors.interiors.appliances,actor=st.session.actors.get(st.session.id);
      return art?.easels.length===2&&art.easels.every(e=>e.stage===4)&&actor?.activity==='admire'&&!document.querySelector('#easel-print').hidden;
    });
  }
  assert.equal(await guest.locator('#easel-title').innerText(),'Poppies by the path');
  assert.equal(await host.locator('#easel-title').innerText(),'Harbor at dawn');
  const [print]=await Promise.all([guest.waitForEvent('download'),guest.locator('#easel-save').click()]);
  assert.equal(print.suggestedFilename(),'Poppies by the path.png');
  await guest.locator('#easel-keep').click();await guest.getByRole('button',{name:'In collection'}).waitFor();
  await guest.locator('#easel-new').click();
  await wait(host,lot=>{
    const s=window.__cozy.street.session,value=s.layout.homePaintings[lot];
    return value%5===4&&Math.floor(value/5)<4&&[...s.actors.values()].some(a=>a.activity==='paint'&&a.using?.object==='easel-2');
  },lot);
  await guest.locator('#social-open').click();await navigate(guest,'#personal-street');
  await guest.locator('#directions-open').click();await guest.locator('#destination').selectOption(lot);
  await guest.locator('#jump-place').click();await wait(guest,id=>window.__cozy.street.openRoof===id,lot);
  await guest.locator('#build-open').click();await guest.locator('#room-mode').selectOption('gallery');
  assert.deepEqual(await guest.locator('#gallery-print option').allTextContents(),['Poppies by the path']);
  await guest.locator('#gallery-hang').click();
  await wait(guest,id=>window.__cozy.street.session.layout.wallPrints?.[id]===2,lot);
  console.log('PASS two public painters finished separate pictures, took a print home and hung it on a private street');
}
