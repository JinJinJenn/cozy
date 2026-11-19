import assert from 'node:assert/strict';

// Read the vertices submitted to WebGL. A hub center can look right while a
// tire on a tilted chassis still floats above the visible bridge or hillside.
async function tireClearances({driver,resident}){
  const {Matrix4,Vector3}=await import('three');
  const app=window.__cozy,street=app.street;
  app.render();
  const matrix=new Matrix4(),p=new Vector3();
  const target=driver?street.meshes.get(driver).position:street.town.people[resident].position;
  const roadTriangles=[];
  street.scene.traverse(mesh=>{
    if(mesh.material!==street.town.terrainMaterial && mesh!==street.town.decks.mesh)return;
    const g=mesh.geometry;
    if(!g.boundingBox)g.computeBoundingBox();
    const {min,max}=g.boundingBox;
    if(target.x<min.x-5||target.x>max.x+5||target.z<min.z-5||target.z>max.z+5)return;
    const pos=g.attributes.position,idx=g.index;
    for(let k=0;k<idx.count;k+=3){
      const a=idx.getX(k),b=idx.getX(k+1),c=idx.getX(k+2);
      const x=pos.getX(a),z=pos.getZ(a),bx=pos.getX(b),bz=pos.getZ(b),cx=pos.getX(c),cz=pos.getZ(c);
      if(Math.min(x,bx,cx)>target.x+5||Math.max(x,bx,cx)<target.x-5||
        Math.min(z,bz,cz)>target.z+5||Math.max(z,bz,cz)<target.z-5)continue;
      const ux=bx-x,uz=bz-z,vx=cx-x,vz=cz-z,det=ux*vz-uz*vx;
      if(Math.abs(det)>1e-8)roadTriangles.push({x,z,y:pos.getY(a),ux,uz,vx,vz,det,uy:pos.getY(b)-pos.getY(a),vy:pos.getY(c)-pos.getY(a)});
    }
  });
  function height(x,z){
    let y=-Infinity;
    for(const t of roadTriangles){
      const dx=x-t.x,dz=z-t.z,u=(dx*t.vz-dz*t.vx)/t.det,v=(t.ux*dz-t.uz*dx)/t.det;
      if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001)y=Math.max(y,t.y+u*t.uy+v*t.vy);
    }
    return y;
  }
  function measure(geometry,transform){
    const positions=geometry.attributes.position;
    let lowest=Infinity;
    for(let i=0;i<positions.count;i++){
      p.fromBufferAttribute(positions,i).applyMatrix4(transform);
      lowest=Math.min(lowest,p.y-height(p.x,p.z));
    }
    return lowest;
  }
  if(driver){
    const car=street.meshes.get(driver),gaps=[];
    car.updateWorldMatrix(true,true);
    car.userData.ride.traverse(mesh=>{
      if(mesh.geometry?.parameters?.tube!==.18)return;
      mesh.getMatrixAt(0,matrix);matrix.premultiply(mesh.matrixWorld);
      gaps.push(measure(mesh.geometry,matrix));
    });
    return {gaps,bank:car.rotation.z};
  }
  const town=street.town;
  const tires=[...town.crowd.batches.values()].find(b=>b.geometry.parameters?.tube===.18);
  let closest=Infinity,chosen;
  for(let i=0;i<tires.used;i+=4){
    tires.mesh.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);
    const d=Math.hypot(p.x-target.x,p.z-target.z);
    if(d<closest){closest=d;chosen=i;}
  }
  if(!(closest<2))throw Error('The followed resident car was missing from the rendered tire batch');
  const gaps=[];
  for(let i=chosen;i<chosen+4;i++){
    tires.mesh.getMatrixAt(i,matrix);gaps.push(measure(tires.geometry,matrix));
  }
  return {gaps,name:town.current[resident].name};
}

export async function testRoadContact({owner,visitor,actor,synced,until}){
  const {id}=await actor(visitor);
  const bank={x:-387.8405,z:-65.6670};
  // Mounting uses the pedestrian's heading to pick a lane. Approach from
  // the south so both peers measure the same steep lane on every run.
  const approach={x:bank.x-.52,z:bank.z-2.95};
  await visitor.evaluate(p=>window.__cozy.street.session.command({type:'teleport',...p}),approach);
  await until(visitor,p=>{
    const s=window.__cozy.street.session,a=s.actors.get(s.id);
    return Math.hypot(a.x-p.x,a.z-p.z)<.5;
  },approach);
  await visitor.evaluate(p=>window.__cozy.street.session.command({type:'walk',...p}),bank);
  await until(visitor,p=>{
    const s=window.__cozy.street.session,a=s.actors.get(s.id);
    return Math.hypot(a.x-p.x,a.z-p.z)<.35 && Math.cos(a.yaw)>.85;
  },bank);
  await visitor.locator('#directions-open').click();await visitor.locator('#take-car').click();
  await Promise.all([owner,visitor].map(p=>synced(p,id,'car')));
  const parked=await Promise.all([owner,visitor].map(p=>p.evaluate(tireClearances,{driver:id})));
  for(const {bank,gaps} of parked){
    assert.ok(Math.abs(bank+.314)<.03,'expected the measured 18-degree road bank, saw '+JSON.stringify({bank,gaps}));
    assert.equal(gaps.length,4);assert.ok(gaps.every(d=>Math.abs(d)<.01),JSON.stringify(gaps));
  }

  const candidate=await visitor.waitForFunction(()=>{
    const {town,island}=window.__cozy.street;
    const i=town.people.findIndex(p=>{
      if(!p.visible||!p.userData.driving)return false;
      const {x,z}=p.position,yaw=p.userData.heading,dx=.78*Math.cos(yaw),dz=-.78*Math.sin(yaw);
      return Math.abs(island.tireHeight(x+dx,z+dz)-island.tireHeight(x-dx,z-dz))>.14;
    });
    return i>=0?{i}:false;
  },null,{polling:120,timeout:90000});
  const {i}=await candidate.jsonValue();await candidate.dispose();
  await visitor.evaluate(i=>{
    const s=window.__cozy.street,p=s.town.people[i].position;
    s.cameraFocus={resident:i};s.controls.target.set(p.x,p.y+1.48,p.z);
    s.camera.position.set(p.x+8,p.y+6,p.z+9);s.controls.update();
  },i);
  const npc=await visitor.evaluate(tireClearances,{resident:i});
  assert.equal(npc.gaps.length,4);assert.ok(npc.gaps.every(d=>Math.abs(d)<.05),JSON.stringify(npc));
  console.log('PASS four tires on a banked street for the driver, host and moving resident',JSON.stringify({parked,npc}));
}
