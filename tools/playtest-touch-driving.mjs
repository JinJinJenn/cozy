import assert from 'node:assert/strict';

export async function testTouchDriving({visitor,owner,actor,synced,until}){
  const driver=(await actor(visitor)).id;
  const pedals=visitor.locator('#car-pedals');
  assert.equal(await pedals.isVisible(),false);
  await visitor.locator('#directions-open').tap();await visitor.locator('#take-car').tap();
  await Promise.all([owner,visitor].map(p=>synced(p,driver,'car')));
  await pedals.waitFor();
  const cdp=await visitor.context().newCDPSession(visitor);
  const touch=(type,...touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  async function controls(){
    return visitor.evaluate(()=>{
      const position=(selector,id,offset=0)=>{
        const el=document.querySelector(selector),r=el.getBoundingClientRect();
        const x=r.left+r.width*(.5+offset),y=r.top+r.height*.5;
        if(r.width<44||r.height<44||!el.contains(document.elementFromPoint(x,y)))throw Error('Unreachable control '+selector);
        return {id,x,y};
      };
      return {center:position('#walk-pad',1),turn:position('#walk-pad',1,-.14),
        gas:position('[data-pedal=gas]',2),brake:position('[data-pedal=brake]',2),reverse:position('[data-pedal=reverse]',2)};
    });
  }
  const driving=async keys=>until(owner,({id,keys})=>{
    const s=window.__cozy.street.session,a=s.actors.get(id),c=s.controls.get(id);
    return a?.vehicle==='car'&&c&&Object.entries(keys).every(([k,v])=>c[k]===v);
  },{id:driver,keys});
  const stopped=()=>until(owner,id=>{const a=window.__cozy.street.session.actors.get(id);return a?.brakeHeld&&a.speed===0;},driver);
  const still=()=>driving({x:0,z:0,brake:false});
  try{
    let p=await controls();
    await touch('touchStart',p.center,p.gas);
    await until(owner,id=>window.__cozy.street.session.actors.get(id).speed>2,driver);
    const yaw=await owner.evaluate(id=>window.__cozy.street.session.actors.get(id).yaw,driver);
    await touch('touchMove',p.turn,p.gas);
    await until(owner,({id,yaw})=>{
      const s=window.__cozy.street.session,c=s.controls.get(id),a=s.actors.get(id);
      const car=window.__cozy.street.meshes.get(id).userData.ride;
      const left=car.getObjectByName('front-left-wheel').rotation.y,right=car.getObjectByName('front-right-wheel').rotation.y;
      return c.x<-.2&&c.z===1&&a.speed>1&&Math.abs(Math.sin(a.yaw-yaw))>.025&&
        Math.abs(a.yawRate)>.02&&Math.abs(left-right)>.001&&Math.abs(car.getObjectByName('chassis').rotation.z)>.001;
    },{id:driver,yaw});
    if(process.env.COZY_TOUCH_SHOT)await visitor.screenshot({path:process.env.COZY_TOUCH_SHOT,type:'jpeg',quality:90});
    await touch('touchMove',p.turn,p.brake);await stopped();
    // On a slow renderer the turning car can reach the kerb before the two
    // fingers move to brake. Back up before asking it to pull forward again.
    const parked=await owner.evaluate(id=>{
      const a=window.__cozy.street.session.actors.get(id);return {x:a.x,z:a.z};
    },driver);
    await touch('touchMove',p.center,p.reverse);
    await until(owner,({driver,x,z})=>{
      const a=window.__cozy.street.session.actors.get(driver);
      return a.speed<-.4&&Math.hypot(a.x-x,a.z-z)>2;
    },{driver,x:parked.x,z:parked.z});
    await touch('touchMove',p.center,p.brake);await stopped();
    await touch('touchMove',p.center,p.gas);
    await until(owner,id=>{const a=window.__cozy.street.session.actors.get(id);return a.speed>1&&!a.brakeHeld;},driver);
    await touch('touchCancel');await still();
    await visitor.setViewportSize({width:844,height:390});p=await controls();
    await touch('touchStart',p.brake);await stopped();
    await touch('touchMove',p.reverse);
    await until(owner,id=>window.__cozy.street.session.actors.get(id).speed<-.4,driver);
    await touch('touchEnd');await still();
    await visitor.locator('#use-place').tap();await Promise.all([visitor,owner].map(page=>synced(page,driver,null)));
    await pedals.waitFor({state:'hidden'});
    assert.equal(await visitor.locator('#walk-pad').getAttribute('aria-label'),'Walk');
    await visitor.locator('#directions-open').tap();await visitor.locator('#take-bike').tap();
    await synced(owner,driver,'bike');assert.equal(await pedals.isVisible(),false);
    const r=await visitor.locator('#walk-pad').boundingBox();
    await touch('touchStart',{id:1,x:r.x+r.width*.5,y:r.y+r.height*.21});
    await until(owner,id=>window.__cozy.street.session.actors.get(id).speed>.5,driver);
    await touch('touchEnd');await visitor.locator('#use-place').tap();await synced(owner,driver,null);
    console.log('PASS two-thumb steering and gas, slide to brake, stop, restart, cancel, landscape reverse, dismount and bicycle pedal over WebRTC.');
  }finally{
    await touch('touchCancel').catch(()=>{});await cdp.detach();
  }
}
