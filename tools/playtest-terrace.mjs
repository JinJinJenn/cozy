import assert from 'node:assert/strict';

export async function playTerrace(host,guest,shot){
  const size=host.viewportSize();await host.setViewportSize({width:1100,height:660});
  const open=async()=>{await host.locator('#build-open').click();await host.locator('#build-lot').selectOption('l107');await host.locator('#terrace-open').click();};
  const point=async(x,z)=>{
    const p=await host.evaluate(async([x,z])=>{
      const {Vector3}=await import('three'),{toWorld}=await import('./src/street-world.js');
      const c=window.__cozy,b=c.street.cafe,q=toWorld(b,x,z);
      const v=new Vector3(q.x,b.y,q.z).project(c.camera);
      const px=(v.x+1)*innerWidth/2,py=(1-v.y)*innerHeight/2;
      return {x:px,y:py,hit:document.elementFromPoint(px,py)?.id};
    },[x,z]);assert.equal(p.hit,'gl','Terrace target must be visible at '+JSON.stringify(p));await host.mouse.click(p.x,p.y);
    await host.waitForFunction(([x,z])=>{const t=window.__cozy.street.terraceEditor.draft;return t.x===x&&t.z===z;},[x,z],{timeout:4000});
  };
  await open();await point(0,6.5);
  assert.ok(await host.locator('#terrace-apply').isDisabled());
  await point(3.5,7.5);await host.locator('#terrace-apply').click();
  await guest.waitForFunction(()=>window.__cozy.street.session.layout.terrace.tables.some(t=>t.id===1&&t.x===3.5&&t.z===7.5));
  if(shot)await shot('placement',host);
  assert.equal(await guest.evaluate(()=>window.__cozy.street.session.editTable(1,null)),false);
  await guest.locator('#coffee-action').click();
  await guest.locator('#patio-destination').selectOption('terrace-1',{timeout:50000});
  await guest.locator('#patio-coffee').click();
  await host.waitForFunction(()=>[...window.__cozy.street.session.actors.values()].some(a=>a.meetingTable==='terrace-1'));
  await host.locator('#terrace-slot').selectOption('1');
  assert.ok(await host.locator('#terrace-remove').isDisabled());
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session,a=s.actors.get(s.id),friend=s.actors.get(a.friend);
    return a.meetingTable==='terrace-1'&&a.outing==='chat'&&a.activity==='sit'&&friend?.activity==='sit'&&a.cup&&friend.cup;},null,{timeout:65000});
  if(shot)await shot('coffee',guest);
  assert.equal(await host.evaluate(()=>window.__cozy.street.session.editTable(1,null)),false);
  await host.locator('#terrace-slot').selectOption('0');await host.locator('#terrace-rotate').click();await host.locator('#terrace-apply').click();
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session;return s.layout.terrace.tables.find(t=>t.id===0).turn===0&&s.actors.get(s.id).outing==='chat';});
  await host.locator('#terrace-undo').click();await guest.waitForFunction(()=>window.__cozy.street.session.layout.terrace.tables.find(t=>t.id===0).turn===1);
  await guest.locator('#coffee-action').click();
  await guest.locator('#directions-open').click();await guest.locator('#destination').selectOption('cafe');await guest.locator('#go-place').click();
  await guest.waitForFunction(()=>{const s=window.__cozy.street.session,a=s.actors.get(s.id);return !a.walking&&s.near(a)?.cafe&&!a.outing;},null,{timeout:40000});
  const boot=await guest.evaluate(()=>window.__cozy.street.session.hostBoot);
  await host.reload({waitUntil:'domcontentloaded',timeout:120000});
  await guest.waitForFunction(old=>{const s=window.__cozy.street.session;return s.connected&&s.hostBoot!==old&&s.layout.terrace.tables.length===2;},boot,{timeout:65000});
  await open();await host.locator('#terrace-undo').click();
  await guest.waitForFunction(()=>window.__cozy.street.session.layout.terrace.tables.length===1);
  await host.locator('#build-open').click();await host.setViewportSize(size);
  console.log('PASS owner placed a table, guest and neighbor shared it during a separate edit, occupied removal was denied, save and undo survived host reload');
}
