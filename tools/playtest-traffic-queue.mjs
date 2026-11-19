import assert from 'node:assert/strict';

export async function testTrafficQueue({owner,visitor,actor,synced,until}){
  if(process.env.COZY_QUEUE_SHOT)await visitor.setViewportSize({width:1280,height:720});
  const me=await actor(visitor);
  await owner.evaluate(async()=>{
    const {planResidentVisits}=await import('./src/resident-car-routes.js');
    const s=window.__cozy.street;
    window.queueRoutes=planResidentVisits(s.island.plan,s.island.homes,s.island.seed);
  });
  const excluded=[];
  let placement;
  while(excluded.length<3){
    placement=await parkAhead({owner,visitor,actor,synced,until},me,excluded);
    if(Math.abs(placement.across)<1&&Math.abs(placement.along)<9&&placement.ahead>4.58)break;
    excluded.push(placement.trip.i);
  }
  assert.ok(excluded.length<3,'could not park ahead in the same lane: '+JSON.stringify(placement));
  const {trip,parked}=placement;
  const stopped=await owner.waitForFunction(({trip,parked})=>{
    const town=window.__cozy.street.town,p=town.current[trip.i],prev=town.previous[trip.i];
    const gap=(parked.x-p.x)*trip.dx+(parked.z-p.z)*trip.dz;
    const sample={tick:town.sim.tick,braking:p.braking,gap,x:p.x,z:p.z,distance:Math.hypot(p.x-prev.x,p.z-prev.z)};
    const trace=window.trafficStopTrace??=[];
    if(trace.at(-1)?.tick!==sample.tick){trace.push(sample);if(trace.length>12)trace.shift();}
    const stable=p.driving&&p.braking&&prev.braking&&gap>4.58&&gap<7.5&&Math.hypot(p.x-prev.x,p.z-prev.z)<.02;
    if(!stable){window.stoppedTraffic=null;return;}
    const rest=window.stoppedTraffic;
    if(!rest||Math.hypot(p.x-rest.x,p.z-rest.z)>.02){
      window.stoppedTraffic={gap,x:p.x,z:p.z,tick:town.sim.tick};
    }else if(town.sim.tick>=rest.tick+3)return rest;
  },{trip,parked},{timeout:45000,polling:100}).catch(async error=>{
    console.error(trip,parked,await owner.evaluate(()=>window.trafficStopTrace));throw error;
  });
  const rest=await stopped.jsonValue();await stopped.dispose();
  await until(visitor,i=>window.__cozy.street.town.people[i].userData.braking===true,trip.i);
  await visitor.evaluate(({i,dx,dz})=>{
    const s=window.__cozy.street,p=s.town.people[i].position;
    s.cameraFocus={resident:i};s.controls.target.copy(p);s.controls.target.y+=.9;
    s.camera.position.set(p.x-dx*6-dz*3,p.y+3.6,p.z-dz*6+dx*3);s.controls.update();
  },trip);
  // Read the two lit lenses from the visitor's rendered crowd instances.
  await until(visitor,i=>{
    const s=window.__cozy.street,c=s.town.crowd,car=s.town.people[i].position;
    const lenses=c.car.getObjectByName('brake-lamps').children[0];
    const {batch,pieces}=c.carParts.find(p=>p.source===lenses);
    const matrix=c.car.matrixWorld.clone(),color=pieces[0].color.clone();
    let lit=0;
    for(let j=0;j<batch.mesh.count;j++){
      batch.mesh.getColorAt(j,color);if(!color.equals(pieces[0].color))continue;
      batch.mesh.getMatrixAt(j,matrix);
      if(Math.hypot(matrix.elements[12]-car.x,matrix.elements[14]-car.z)<1.8)lit++;
    }
    return lit===2;
  },trip.i);
  if(process.env.COZY_QUEUE_SHOT){
    await until(visitor,name=>document.querySelector('#place').textContent===name,trip.name);
    await visitor.screenshot({path:process.env.COZY_QUEUE_SHOT,type:'jpeg',quality:92});
  }
  await visitor.keyboard.down('w');
  try{
    await until(owner,({trip,rest})=>{const p=window.__cozy.street.town.current[trip.i];
      return p.driving&&!p.braking&&(p.x-rest.x)*trip.dx+(p.z-rest.z)*trip.dz>4;
    },{trip,rest});
    await until(visitor,i=>window.__cozy.street.town.people[i].userData.braking===false,trip.i);
  }finally{await visitor.keyboard.up('w');}
  console.log('PASS',trip.name,'stopped',rest.gap.toFixed(2),'m center-to-center behind a visiting driver, held both brake lamps on the peer and followed when the driver pulled away.');
}

async function parkAhead({owner,visitor,actor,synced,until},me,excluded){
  // Choose a real trip with a long stretch ahead. Use the normal teleport and
  // vehicle commands to park the visitor's car in the resident's lane.
  const candidate=await owner.waitForFunction(({yaw,excluded})=>{
    const s=window.__cozy.street;
    for(const [i,p] of s.town.current.entries()){
      if(!p.driving||p.destination===p.homeLotId||excluded.includes(i))continue;
      const route=window.queueRoutes.get(p.homeLotId)?.find(v=>v.dest.id===p.destination)?.outbound;
      if(!route)continue;
      for(let j=1;j<route.points.length;j++){
        const [x,z]=route.points[j-1],[endX,endZ]=route.points[j],len=Math.hypot(endX-x,endZ-z);
        if(len<42)continue;
        const dx=(endX-x)/len,dz=(endZ-z)/len;
        const along=(p.x-x)*dx+(p.z-z)*dz,side=(p.x-x)*dz-(p.z-z)*dx;
        if(along<0||len-along<40||Math.abs(side)>.3||dx*Math.sin(yaw)+dz*Math.cos(yaw)<.4)continue;
        const goal={x:p.x+32*dx,z:p.z+32*dz};
        if(route.junctions.some(g=>Math.hypot(g.x-goal.x,g.z-goal.z)<8))continue;
        if(s.town.current.some((q,id)=>id!==i&&!q.asleep&&Math.hypot(q.x-goal.x,q.z-goal.z)<5))continue;
        return {i,name:p.name,dx,dz,goal};
      }
    }
  },{yaw:(await actor(visitor)).yaw,excluded},{timeout:120000,polling:100});
  const trip=await candidate.jsonValue();await candidate.dispose();
  await visitor.evaluate(p=>window.__cozy.street.session.command({type:'teleport',...p}),trip.goal);
  await until(visitor,p=>{const s=window.__cozy.street.session,a=s.actors.get(s.id);return Math.hypot(a.x-p.x,a.z-p.z)<1;},trip.goal);
  await visitor.locator('#directions-open').click();await visitor.locator('#take-car').click();
  await Promise.all([owner,visitor].map(p=>synced(p,me.id,'car')));
  const parked=await actor(visitor);
  // The normal mounting action can choose another lane or move up to eight
  // metres along it if someone arrives while the visitor opens Travel.
  const x=parked.x-trip.goal.x,z=parked.z-trip.goal.z;
  const along=x*trip.dx+z*trip.dz,across=x*trip.dz-z*trip.dx;
  const ahead=await owner.evaluate(({trip,parked})=>{
    const p=window.__cozy.street.town.current[trip.i];
    return p.driving ? (parked.x-p.x)*trip.dx+(parked.z-p.z)*trip.dz : 0;
  },{trip,parked});
  return {trip,parked,along,across,ahead};
}
