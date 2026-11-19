import assert from 'node:assert/strict';

export async function testWagon({owner,visitor,actor,until}){
  const id=(await actor(visitor)).id;
  const start=await owner.evaluate(async()=>{
    const s=window.__cozy.street,{roadsOf}=await import('./src/street-road-index.js');
    const home=s.island.homes.find(h=>h.name==='Home 58')||s.island.homes[0];
    const choices=[];
    for(const l of roadsOf(s.island).segments){
      if(!l.drivable||l.bridge||l.length<36)continue;
      const x=l.x+l.length*.5*l.dx,z=l.z+l.length*.5*l.dz;
      if(s.town.people.some(p=>p.visible&&Math.hypot(p.position.x-x,p.position.z-z)<10))continue;
      choices.push({x,z,dx:l.dx,dz:l.dz,distance:Math.hypot(x-home.x,z-home.z)});
    }
    choices.sort((a,b)=>a.distance-b.distance);
    return choices[0];
  });
  assert.ok(start,'an open neighborhood street');
  async function park(page,along,button){
    const x=start.x+along*start.dx,z=start.z+along*start.dz;
    await page.evaluate(p=>window.__cozy.street.session.command({type:'teleport',...p}),{x,z});
    await until(page,p=>{const s=window.__cozy.street.session,a=s.actors.get(s.id);return Math.hypot(a.x-p.x,a.z-p.z)<1.5;},{x,z});
    await page.locator('#directions-open').click();await page.locator(button).click();
  }
  await park(owner,-4.4,'#take-car');await park(visitor,1.7,'#take-wagon');
  await Promise.all([owner,visitor].map(p=>until(p,id=>{
    const s=window.__cozy.street,ride=s.meshes.get(id)?.userData.ride;
    return s.session.actors.get(id)?.carModel==='wagon'&&ride?.name==='station-wagon'&&ride.getObjectByName('estate-glass');
  },id)));
  const estate=await actor(visitor),other=await actor(owner);
  if(process.env.COZY_WAGON_SHOT){
    await visitor.setViewportSize({width:1280,height:720});
    await visitor.locator('#graphics-settings summary').click();
    await visitor.getByLabel('Graphics quality').selectOption('balanced');
    await visitor.locator('#graphics-settings summary').click();
    await visitor.evaluate(async({estate,other})=>{
      const c=window.__cozy,s=c.street,dx=Math.sin(estate.yaw),dz=Math.cos(estate.yaw);
      const x=estate.x,z=estate.z,y=s.island.tireHeight(x,z);
      const towardsOther=(other.x-x)*dx+(other.z-z)*dz;
      const fore=towardsOther>0?-2.9:2.9;
      s.cameraFocus={x,z};await c.setCamera([x+dz*4.5+dx*fore,y+2.45,z-dx*4.5+dz*fore],[x,y+1.48,z]);c.render();
    },{estate,other});
    await visitor.screenshot({path:process.env.COZY_WAGON_SHOT,type:'jpeg',quality:92});
    await visitor.evaluate(()=>{window.__cozy.street.cameraFocus=null;});
  }
  await visitor.keyboard.down('w');
  try{
    await until(owner,id=>window.__cozy.street.session.actors.get(id)?.speed>2,id);
  }finally{await visitor.keyboard.up('w');}
  await visitor.keyboard.down('Space');
  try{
    await until(owner,id=>{
      const s=window.__cozy.street,a=s.session.actors.get(id),ride=s.meshes.get(id)?.userData.ride;
      return a?.brakeHeld&&a.speed===0&&ride?.getObjectByName('brake-lamps')?.visible;
    },id);
  }finally{await visitor.keyboard.up('Space');}
  const driver=await visitor.waitForFunction(()=>{
    const {town}=window.__cozy.street;
    const i=town.people.findIndex((p,i)=>p.visible&&p.userData.driving&&town.crowd.styles[i].carModel==='wagon');
    return i>=0?{i,name:town.current[i].name}:false;
  },null,{polling:120,timeout:90000});
  const npc=await driver.jsonValue();await driver.dispose();
  await until(owner,i=>window.__cozy.street.town.crowd.styles[i].carModel==='wagon',npc.i);
  await visitor.evaluate(i=>{
    const s=window.__cozy.street,p=s.town.people[i].position;
    s.cameraFocus={resident:i};s.controls.target.set(p.x,p.y+1.48,p.z);
    s.camera.position.set(p.x+7,p.y+3.5,p.z+8);s.controls.update();
  },npc.i);
  await until(visitor,i=>{
    const c=window.__cozy;c.render();
    const town=c.street.town,p=town.people[i],crowd=town.crowd;
    const hull=crowd.wagonParts.find(s=>s.source.geometry.type==='ExtrudeGeometry').batch;
    const matrix=c.street.camera.matrixWorld.clone();
    if(!p.userData.driving)return false;
    const yaw=p.userData.carYaw,cos=Math.cos(yaw),sin=Math.sin(yaw);
    let left=false,right=false;
    for(let j=0;j<hull.used;j++){
      hull.mesh.getMatrixAt(j,matrix);
      const dx=matrix.elements[12]-p.position.x,dz=matrix.elements[14]-p.position.z;
      const across=dx*cos-dz*sin,along=dx*sin+dz*cos;
      if(Math.abs(along)>.20||Math.abs(Math.abs(across)-.729)>.14)continue;
      if(across<0)left=true;else right=true;
    }
    return left&&right;
  },npc.i);
  console.log('PASS visiting driver chose a wagon, accelerated, showed brake lights and stopped on the host. Followed '+npc.name+' driving a batched station wagon.');
}
