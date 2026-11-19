import assert from 'node:assert/strict';

export async function testOffroad({owner,visitor,actor,synced,until}){
  const driver=await actor(visitor);
  const end=await owner.evaluate(async driver=>{
    const s=window.__cozy.street,{roadsOf,carriagewayAt}=await import('./src/street-road-index.js');
    const {homeAt}=await import('./src/home-plan.js'),{walkable}=await import('./src/street-world.js');
    const ends=[];
    for(const l of roadsOf(s.island).segments){
      if(!l.drivable||l.bridge||l.length<16)continue;
      const forward=Math.cos(driver.yaw)*l.dz+Math.sin(driver.yaw)*l.dx>0;
      const dx=forward?l.dx:-l.dx,dz=forward?l.dz:-l.dz;
      const x=l.x+(forward?l.dx*l.length:0),z=l.z+(forward?l.dz*l.length:0);
      if(carriagewayAt(s.island,x+dx*8,z+dz*8))continue;
      let clear=true;
      for(let t=-13;t<=37&&clear;t+=2)for(const side of [-4,0,4]){
        const q={x:x+t*dx+dz*side,z:z+t*dz-dx*side};
        if(s.island.slope(q.x,q.z)>.11||homeAt(s.island,q,2)||!walkable(s.island,s.plots,s.layout,q)||
          s.plots.some(b=>Math.hypot(q.x-b.x,q.z-b.z)<Math.hypot(b.w,b.d)/2+2)||
          s.town.people.some(p=>p.visible&&Math.hypot(p.position.x-q.x,p.position.z-q.z)<3.5)||
          t>=9&&carriagewayAt(s.island,q.x,q.z)){clear=false;break;}
      }
      if(clear)ends.push({x,z,dx,dz,distance:Math.hypot(x-driver.x,z-driver.z)});
    }
    return ends.sort((a,b)=>a.distance-b.distance)[0];
  },driver);
  assert.ok(end,'a real road end with open dry ground beyond it');
  const id=driver.id;
  const along=(a)=>(a.x-end.x)*end.dx+(a.z-end.z)*end.dz;
  const untilAlong=(distance,sign)=>until(owner,({end,id,distance,sign})=>{
    const a=window.__cozy.street.session.actors.get(id);
    return a&&sign*((a.x-end.x)*end.dx+(a.z-end.z)*end.dz-distance)>=0;
  },{end,id,distance,sign});
  const start={x:end.x-12*end.dx,z:end.z-12*end.dz};
  for(const [button,model] of [['#take-car','roadster'],['#take-wagon','wagon']]){
    // Walk a short stretch along the road. A returning driver can be facing
    // either way after the preceding slide, and mounting chooses that lane.
    const behind={x:start.x-2.5*end.dx,z:start.z-2.5*end.dz};
    await visitor.evaluate(p=>window.__cozy.street.session.command({type:'teleport',...p}),behind);
    await until(visitor,p=>{const s=window.__cozy.street.session,a=s.actors.get(s.id);return !a.vehicle&&Math.hypot(a.x-p.x,a.z-p.z)<.4;},behind);
    await visitor.evaluate(p=>window.__cozy.street.session.command({type:'walk',...p}),start);
    await until(visitor,({start,end})=>{const s=window.__cozy.street.session,a=s.actors.get(s.id);
      return Math.hypot(a.x-start.x,a.z-start.z)<.4&&Math.sin(a.yaw)*end.dx+Math.cos(a.yaw)*end.dz>.9;},{start,end});
    await visitor.locator('#directions-open').click();await visitor.locator(button).click();
    await synced(owner,id,'car');
    await visitor.keyboard.down('w');
    try{await untilAlong(12,1);}finally{await visitor.keyboard.up('w');}
    await visitor.keyboard.down('Space');
    try{await until(owner,id=>{const a=window.__cozy.street.session.actors.get(id);return a.brakeHeld&&a.speed===0;},id);}
    finally{await visitor.keyboard.up('Space');}
    const readings=await Promise.all([owner,visitor].map(page=>page.evaluate(async id=>{
      const s=window.__cozy.street,a=s.session.actors.get(id),{carriagewayAt}=await import('./src/street-road-index.js');
      return {x:a.x,z:a.z,offroad:!carriagewayAt(s.island,a.x,a.z),model:a.carModel||'roadster'};
    },id)));
    assert.ok(readings.every(a=>a.offroad&&a.model===model&&along(a)>10),JSON.stringify(readings));
    if(process.env.COZY_OFFROAD_SHOT&&model==='wagon')await visitor.screenshot({path:process.env.COZY_OFFROAD_SHOT,type:'jpeg',quality:91});
    await visitor.keyboard.down('s');
    try{await untilAlong(-3,-1);}finally{await visitor.keyboard.up('s');}
    await visitor.keyboard.down('w');
    try{
      await untilAlong(14,1);
      await visitor.keyboard.down('d');await visitor.keyboard.down('Shift');
      try{
        await until(owner,id=>{const s=window.__cozy.street.session,a=s.actors.get(id);
          return s.controls.get(id)?.handbrake&&a.brakeHeld&&Math.abs(a.sideSpeed)>.28&&Math.abs(a.yawRate)>.3;},id);
        await until(owner,()=>{const marks=window.__cozy.street.scene.getObjectByName('tire-tracks');
          return marks?.visible&&marks.geometry.drawRange.count>=12;});
      }finally{await visitor.keyboard.up('Shift');await visitor.keyboard.up('d');}
      await until(owner,id=>{const s=window.__cozy.street.session,a=s.actors.get(id);
        return !s.controls.get(id)?.handbrake&&!a.brakeHeld&&Math.abs(a.sideSpeed)<.18&&a.speed>2;},id);
    }finally{await visitor.keyboard.up('w');}
    console.log('PASS '+model+' drove '+along(readings[0]).toFixed(1)+' m beyond the road end, reversed onto pavement, then slid and recovered on grass over WebRTC.');
  }
}
