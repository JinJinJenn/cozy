import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

export async function playFlowers({host,guest,wait,ready,navigate}){
  const audit=await host.evaluate(async()=>{
    const c=window.__cozy,s=c.street.session;
    const {walkingRoute}=await import('./src/street-route.js'),{stationsFor}=await import('./src/street-session.js');
    const species={},unreachable=[];
    for(const b of c.island.streetBenches.values()){
      species[b.species]=(species[b.species]||0)+1;
      if(!s.activities.fixtureApproaches(b,stationsFor(b)[2]).some(p=>walkingRoute(c.island,s.plots,s.layout,b.entry,p)))unreachable.push(b.id);
    }
    return {species,unreachable};
  });
  console.log('Flower boxes by species',audit.species);
  assert.deepEqual(audit.unreachable,[]);
  async function travel(p){
    await p.locator('#directions-open').click();await p.locator('#destination').selectOption('flowers');
    const bed=await p.evaluate(()=>window.__cozy.street.destination.id);
    await p.locator('#jump-place').click();
    await wait(p,id=>{
      const s=window.__cozy.street.session,a=s.actors.get(s.id),b=s.island.streetBenches.get(id);
      return a.travelSeq>0&&Math.hypot(a.x-b.entry.x,a.z-b.entry.z)<2.8;
    },bed);
    return bed;
  }
  const lot=await travel(host);assert.equal(await travel(guest),lot);
  console.log('Both visitors reached',lot);
  const {species,id}=await guest.evaluate(lot=>{const s=window.__cozy.street.session;return {species:s.island.streetBenches.get(lot).species,id:s.id};},lot);
  async function pointAt(p,label,button){
    const choices=p.locator('#world-choice').getByRole('button',{name:label,exact:true});
    for(const [dx,dz] of [[2.4,2.8],[-2.8,2.4],[2,-2.7],[-2.4,-2]]){
      const point=await p.evaluate(async ({lot,label,dx,dz,button})=>{
        const c=window.__cozy,st=c.street,b=c.island.streetBenches.get(lot);
        const {stationsFor}=await import('./src/street-session.js'),{toWorld}=await import('./src/street-world.js'),{Vector3}=await import('three');
        const t=stationsFor(b)[2].target,eye=toWorld(b,1.87+dx,dz);
        st.cameraFocus={x:t.x,z:t.z};await c.setCamera([eye.x,b.y+2.5,eye.z],[t.x,t.y,t.z]);c.render();
        const cam=c.camera.clone();cam.position.lerp(st.controls.target,1-st.cameraFraction());cam.updateMatrixWorld();
        const rect=st.controls.domElement.getBoundingClientRect();
        for(const offset of [0,-.18,.18]){
          const stem=toWorld(b,1.87+offset,-.02),v=new Vector3(stem.x,t.y,stem.z).project(cam);
          const x=Math.round(rect.left+rect.width*(1+v.x)/2),y=Math.round(rect.top+rect.height*(1-v.y)/2);
          if(document.elementFromPoint(x,y)!==st.controls.domElement)continue;
          const ray=st.pointerRay({clientX:x,clientY:y});
          if(st.pickAction(ray,button==='right',st.floorPoint(ray,cam.far))?.label===label)return {x,y};
        }
      },{lot,label,dx,dz,button});
      if(!point)continue;
      await p.mouse.click(point.x,point.y,{button});
      if(await choices.isVisible()){await choices.click();return;}
      await p.keyboard.press('Escape');
    }
    throw Error('Could not click '+label+' at '+lot);
  }
  const clipped=p=>wait(p,({lot,id,species})=>{
    const st=window.__cozy.street,a=st.session.actors.get(id);
    return st.clearExteriors.flowerBeds.get(lot).amount===0&&a?.profile?.flower===species&&st.meshes.get(id)?.getObjectByName('lapel-'+species);
  },{lot,id,species});
  await pointAt(guest,'Pick a '+species,'left');
  await Promise.all([clipped(host),clipped(guest)]);
  console.log('Both visitors see the cut box and the pinned',species);
  await pointAt(host,'Water the flower box','right');
  const pouring=p=>wait(p,lot=>{
    const st=window.__cozy.street,a=[...st.session.actors.values()].find(a=>a.activity==='water'&&a.using?.lot===lot);
    return a&&st.meshes.get(a.id)?.getObjectByName('watering-can')?.visible&&st.clearExteriors.flowerBeds.get(lot).amount>0;
  },lot);
  await Promise.all([pouring(host),pouring(guest)]);
  await host.locator('#use-place').click();await Promise.all([clipped(host),clipped(guest)]);
  console.log('Interrupting the pour left the bed cut');
  await pointAt(host,'Water the flower box','left');
  await Promise.all([pouring(host),pouring(guest)]);
  if(process.env.COZY_FLOWER_SHOT){
    await mkdir(path.dirname(process.env.COZY_FLOWER_SHOT),{recursive:true});
    await wait(guest,lot=>window.__cozy.street.clearExteriors.flowerBeds.get(lot).amount>=.50,lot);
    await guest.screenshot({path:process.env.COZY_FLOWER_SHOT,type:'jpeg',quality:92});
  }
  for(const p of [host,guest])await wait(p,lot=>{
    const st=window.__cozy.street;
    return !st.session.layout.cutFlowerBeds?.includes(lot)&&st.clearExteriors.flowerBeds.get(lot).amount===1;
  },lot);
  await navigate(guest,'#build-open');await guest.reload();await ready(guest);
  await wait(guest,species=>{
    const st=window.__cozy.street,s=st.session;
    return s.space==='personal'&&s.profile.flower===species&&st.meshes.get(s.id)?.getObjectByName('lapel-'+species);
  },species);
  assert.equal(await travel(guest),lot);
  await pointAt(guest,'Pick a '+species,'left');
  await wait(guest,lot=>window.__cozy.street.session.layout.cutFlowerBeds?.includes(lot),lot);
  await guest.reload();await ready(guest);
  await wait(guest,lot=>window.__cozy.street.clearExteriors.flowerBeds.get(lot).amount===0,lot);
  await guest.locator('#social-open').click();await guest.locator('#profile-options summary').click();
  await guest.locator('#remove-flower').click();await guest.reload();await ready(guest);
  assert.equal(await guest.evaluate(()=>window.__cozy.street.session.profile.flower),undefined);
  console.log('PASS two players picked, wore and regrew a '+species+' at '+lot+', interrupted watering, restored a cut private bed, and kept then unpinned the flower.');
}
