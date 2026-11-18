import assert from 'node:assert/strict';

export async function testGamepad({visitor,owner,actor,synced,until}){
  // Supply standard-mapped readings at the browser API boundary. The street,
  // input packets, host simulation and returning pose are the normal game path.
  await visitor.evaluate(()=>{
    const buttons=Array.from({length:17},()=>({pressed:false,value:0}));
    const pad={index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons};
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>pad.connected?[pad]:[]});
    window.testPedals=(gas,brake,steer=0,reverse=false,exit=false)=>{
      pad.axes[0]=steer;
      for(const [i,value] of [[7,gas],[6,brake],[1,+reverse],[3,+exit]])Object.assign(buttons[i],{value,pressed:value>.5});
    };
    window.testPadConnected=state=>pad.connected=state;
  });
  await visitor.locator('#directions-open').click();await visitor.locator('#take-car').click();
  const id=(await actor(visitor)).id;await synced(owner,id,'car');
  await visitor.evaluate(()=>testPedals(.45,0,.20));
  await until(owner,id=>{
    const s=window.__cozy.street.session,a=s.actors.get(id),k=s.controls.get(id);
    return a?.speed>.7&&a.gear===1&&k?.x>.05&&k.x<.18&&k.z>.40&&k.z<.5;
  },id);
  await until(visitor,()=>document.querySelector('#walk-hint').textContent.includes('LT brake'));
  await visitor.evaluate(()=>testPedals(.65,.375));
  await until(owner,id=>{
    const s=window.__cozy.street.session,a=s.actors.get(id);
    return s.controls.get(id)?.brake===.375&&a.brakeHeld&&a.engineLoad===0;
  },id);
  await visitor.evaluate(()=>testPadConnected(false));
  await until(owner,id=>{
    const k=window.__cozy.street.session.controls.get(id);return k.z===0&&k.x===0&&!k.brake;
  },id);
  await visitor.evaluate(()=>{testPedals(0,1);testPadConnected(true);});
  await until(owner,id=>{const a=window.__cozy.street.session.actors.get(id);return a.brakeHeld&&a.speed===0;},id);
  await visitor.evaluate(()=>testPedals(0,0,0,true));
  await until(owner,id=>{const a=window.__cozy.street.session.actors.get(id);return a.speed<-.15&&a.gear===-1;},id);
  await visitor.evaluate(()=>testPedals(0,0,0,false,true));
  await Promise.all([owner,visitor].map(page=>synced(page,id,null)));
  assert.equal((await actor(visitor)).gear,undefined);
  console.log('PASS standard gamepad fixture over WebRTC: partial throttle, steering, 37.5% brake, disconnect, reverse and exit.');
}
