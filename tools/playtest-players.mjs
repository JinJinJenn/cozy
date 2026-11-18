import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';

export async function playPlayers({host,guest,paired,ready,wait,navigate,profile,isolatedRelay}){
  const panel=async p=>{
    if(await p.locator('#social-pane').isHidden())await p.locator('#social-open').click();
  };
  async function edit(p,name,shirt){
    await panel(p);await p.locator('#profile-options summary').click();
    await p.locator('#profile-name').fill(name);await p.locator('#profile-shirt').selectOption(shirt);
    await p.getByRole('button',{name:'Save profile',exact:true}).click();
  }
  const visibleName=(p,name)=>p.getByRole('button',{name:'Follow '+name,exact:true}).waitFor({state:'visible'});
  await edit(host,'Marigold','saffron');await edit(guest,'River','lagoon');
  await Promise.all([visibleName(host,'River'),visibleName(guest,'Marigold')]);
  const guestId=await guest.evaluate(()=>window.__cozy.street.session.id);
  await guest.keyboard.down('d');
  try{
    await wait(host,id=>{const s=window.__cozy.street.session,a=s.actors.get(id),b=s.actors.get(s.id);return Math.hypot(a.x-b.x,a.z-b.z)>1.45;},guestId);
  }finally{await guest.keyboard.up('d');}
  await host.getByRole('button',{name:'Follow River',exact:true}).click();
  await wait(host,id=>window.__cozy.street.cameraFocus?.actor===id,guestId);
  await host.keyboard.press('Enter');
  await wait(host,()=>!window.__cozy.street.cameraFocus);
  await panel(host);
  await host.getByRole('button',{name:'Follow River',exact:true}).click({button:'right'});
  await wait(host,id=>window.__cozy.street.cameraFocus?.actor===id,guestId);
  // Find an unobstructed view of the guest before sending a native mouse click.
  const spot=await host.evaluate(async id=>{
    const game=window.__cozy,street=game.street,a=street.meshes.get(id).position,b=street.meshes.get(street.session.id).position;
    const x=(a.x+b.x)/2,z=(a.z+b.z)/2;
    const heading=Math.atan2(a.x-street.cafe.x,a.z-street.cafe.z);
    const canvas=street.controls.domElement,rect=canvas.getBoundingClientRect();
    const hits=[];
    street.cameraFocus={x,z};
    for(const turn of [0,Math.PI/2,-Math.PI/2,Math.PI]){
      const angle=heading+turn;
      await game.setCamera([x+5*Math.sin(angle),a.y+3.5,z+5*Math.cos(angle)],[x,a.y+1.48,z]);
      const camera=street.camera.clone();
      camera.position.lerp(street.controls.target,1-street.cameraFraction());camera.updateMatrixWorld();
      for(const height of [1.48,1.02,.55]){
        const point=a.clone();point.y+=height;point.project(camera);
        const clientX=Math.round(rect.left+(1+point.x)*rect.width/2);
        const clientY=Math.round(rect.top+(1-point.y)*rect.height/2);
        if(document.elementFromPoint(clientX,clientY)!==canvas)continue;
        const ray=street.pointerRay({clientX,clientY});
        const hit=street.pickAction(ray,false,street.floorPoint(ray,camera.far));
        if(hit?.command?.to===id)return {x:clientX,y:clientY};
        hits.push(hit?.label||'ground');
      }
    }
    throw Error('Could not frame River at '+a.distanceTo(b).toFixed(2)+' m: '+hits.join(', '));
  },guestId);
  await host.mouse.click(spot.x,spot.y);
  await host.getByRole('button',{name:'Wave to River',exact:true}).click();
  await guest.locator('#player-wave').click();
  const joint=(p,id,gesture)=>wait(p,({id,gesture})=>{
    const street=window.__cozy.street,actor=street.session.actors.get(id),rig=street.meshes.get(id)?.getObjectByName('greeting');
    return actor?.gesture===gesture&&rig?.visible&&rig.children[1].rotation.z>1.3&&
      (gesture==='wave'?Math.abs(rig.children[0].rotation.z)<.2:rig.children[0].rotation.z< -1.3);
  },{id,gesture});
  await Promise.all([joint(host,guestId,'wave'),joint(guest,guestId,'wave')]);
  async function cloth(p,id){
    return p.evaluate(async id=>{
      const {Color}=await import('three'),mesh=window.__cozy.street.meshes.get(id),actual=new Color(),expected=new Color('#438a95');
      let count=0;mesh.traverse(part=>{if(part.instanceColor)for(let i=0;i<part.count;i++){
        part.getColorAt(i,actual);if(Math.abs(actual.r-expected.r)+Math.abs(actual.g-expected.g)+Math.abs(actual.b-expected.b)<1e-6)count++;
      }});return count;
    },id);
  }
  assert.ok(await cloth(host,guestId)>=6);assert.ok(await cloth(guest,guestId)>=6);
  if(process.env.COZY_PLAYER_SHOT){
    await mkdir(path.dirname(process.env.COZY_PLAYER_SHOT),{recursive:true});
    await host.screenshot({path:process.env.COZY_PLAYER_SHOT,type:'jpeg',quality:90});
  }
  await wait(host,id=>{const st=window.__cozy.street;return !st.session.actors.get(id).gesture&&!st.meshes.get(id).getObjectByName('greeting').visible;},guestId);
  await panel(guest);await guest.locator('#player-cheer').click();await joint(host,guestId,'cheer');
  await panel(host);
  await edit(guest,'Marigold','rose');
  await wait(host,()=>[...document.querySelectorAll('#player-roster button')].filter(b=>b.textContent.startsWith('Marigold · ')).length===2);
  const labels=await host.locator('#player-roster button').allTextContents();assert.notEqual(...labels);
  await edit(guest,'River','lagoon');
  await guest.reload();await ready(guest);await Promise.all([paired(host),paired(guest)]);
  await panel(guest);await visibleName(guest,'Marigold');await visibleName(host,'River');
  await navigate(host,'#personal-street');await panel(host);await host.locator('#copy-street').click();
  const link=await host.locator('#invite-url').inputValue();
  await guest.goto(link);await ready(guest);await panel(guest);
  await Promise.all([visibleName(host,'River'),visibleName(guest,'Marigold')]);
  let signalling=!isolatedRelay;
  const visitor=await profile(()=>signalling);
  try{
    await visitor.goto(link);await ready(visitor);
    const actor=await visitor.evaluate(()=>window.__cozy.street.session.id);
    await wait(visitor,()=>window.__cozy.street.session.connected);
    if(isolatedRelay){
      const route=p=>p.evaluate(()=>window.__cozy.street.session.privateRoutes.active);
      assert.equal(await route(visitor),'trystero-torrent');
      assert.equal(await route(guest),'trystero-nostr');
      const before=await guest.evaluate(()=>window.__cozy.street.session.verifiedSeq);
      await visitor.locator('#social-open').click();await visitor.locator('#player-wave').click();
      await joint(guest,actor,'wave');
      await visitor.locator('#directions-open').click();await visitor.locator('#visit-table').click();
      await visitor.locator('#harbor-practice').waitFor();
      const seat=await host.evaluate(id=>window.__cozy.street.session.actors.get(id).using,actor);
      assert.ok(seat?.lot&&seat.object,'the visitor has a reserved tabletop seat');
      // Stall the uplink before dropping it. A local transport handoff alone
      // usually finishes before the old 20-second actor timeout.
      await visitor.evaluate(()=>{window.__cozy.street.session.sendInput=()=>{};});
      try{
        await wait(host,id=>{
          const last=window.__cozy.street.session.controls.get(id)?.at;
          return last===undefined||performance.now()-last>=23000;
        },actor);
        assert.deepEqual(await host.evaluate(id=>window.__cozy.street.session.actors.get(id)?.using,actor),seat);
        signalling=true;
        await visitor.evaluate(()=>window.__cozy.street.session.privateRoutes.routes.get('torrent').connection.leave());
      }finally{await visitor.evaluate(()=>{delete window.__cozy.street.session.sendInput;});}
      await wait(visitor,()=>window.__cozy.street.session.privateRoutes.active==='trystero-nostr'&&window.__cozy.street.session.connected);
      assert.ok(await guest.evaluate(()=>window.__cozy.street.session.verifiedSeq)>before);
      assert.equal(await route(guest),'trystero-nostr');
      assert.deepEqual(await visitor.evaluate(()=>{const s=window.__cozy.street.session;return s.actors.get(s.id).using;}),seat);
    }
    await panel(visitor);
    await Promise.all([visibleName(visitor,'Marigold'),visibleName(visitor,'River')]);
    await wait(visitor,()=>document.querySelectorAll('#player-roster button').length===3);
    assert.equal(await visitor.evaluate(()=>window.__cozy.street.session.id),actor);
    assert.equal(await host.evaluate(()=>window.__cozy.street.session.canBuild),true);
    assert.equal(await guest.evaluate(()=>window.__cozy.street.session.connected),true);
  }finally{await visitor.context().close();}
  console.log('PASS named roster, camera follow, shirt colors, animated wave/cheer, duplicate names, reload and third private visitor',
    isolatedRelay?'with blocked primary discovery, cross-route wave and same-page recovery after link loss':'over public signalling');
}
