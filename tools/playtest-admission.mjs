import assert from 'node:assert/strict';

export async function playAdmission({host,guest,ready,wait,navigate,profile}){
  const panel=async page=>{
    if(await page.locator('#social-pane').isHidden())await page.locator('#social-open').click();
  };
  await panel(host);await navigate(host,'#personal-street');
  const home=await host.evaluate(()=>window.__cozy.island.homes.find(h=>h.name==='Home 5').id);
  await host.locator('#directions-open').click();await host.locator('#destination').selectOption(home);
  await host.locator('#jump-place').click();
  await panel(host);
  await host.locator('#ask-to-enter').check();
  await host.locator('#copy-street').click();
  const link=await host.locator('#invite-url').inputValue();
  assert.equal(new URL(link).searchParams.get('home'),home);
  await host.locator('#social-open').click();
  await guest.goto(link);await ready(guest);
  await guest.locator('#visit-wait').getByText('Knocked. Waiting for the owner.').waitFor();
  assert.equal(await guest.evaluate(()=>window.__cozy.street.session.verifiedSeq),-1);
  await host.locator('#answer-door').click();
  const door=host.locator('#door-requests');
  assert.match(await door.innerText(),/is visiting Home 5/);
  await door.getByRole('button',{name:/^Let in /}).click();
  await wait(guest,lot=>{
    const s=window.__cozy.street.session;
    return s.connected&&s.actors.get(s.id)?.entryHome===lot&&s.residentTargets?.length>400;
  },home);
  const visitor=await profile();
  try{
    await visitor.goto(link);await ready(visitor);
    await wait(visitor,()=>window.__cozy.street.session.visitStatus==='waiting');
    await visitor.locator('#visit-wait').getByText('Knocked. Waiting for the owner.').waitFor();
    await visitor.evaluate(()=>{
      const s=window.__cozy.street.session,receive=s.receive.bind(s);
      window.privateFrames=0;s.receive=(sender,m)=>{if(m.kind==='frame')window.privateFrames++;return receive(sender,m);};
    });
    const before=await guest.evaluate(()=>window.__cozy.street.session.verifiedSeq);
    await wait(guest,seq=>window.__cozy.street.session.verifiedSeq>seq+10,before);
    const id=await visitor.evaluate(()=>window.__cozy.street.session.id);
    assert.equal(await host.evaluate(id=>window.__cozy.street.session.actors.has(id),id),false);
    if(process.env.COZY_DOOR_SHOT)await host.screenshot({path:process.env.COZY_DOOR_SHOT,type:'jpeg',quality:88});
    await door.getByRole('button',{name:/^Decline /}).click();
    await visitor.locator('#visit-wait').getByText('The owner declined this visit.').waitFor();
    assert.equal(await visitor.evaluate(()=>window.privateFrames),0);
    await navigate(visitor,'#visit-wait a');
    await wait(visitor,()=>window.__cozy.street.session.space==='public'&&window.__cozy.street.session.ready);
    assert.ok(await guest.evaluate(()=>window.__cozy.street.session.connected));
  }finally{await visitor.context().close();}
  await host.reload();await ready(host);await panel(host);
  assert.equal(await host.locator('#ask-to-enter').isChecked(),true);
  await guest.locator('#visit-wait').getByText('Knocked. Waiting for the owner.').waitFor();
  await host.locator('#ask-to-enter').uncheck();
  await wait(guest,()=>window.__cozy.street.session.connected);
  console.log('PASS home-specific knock, admit, decline and public return. An admitted guest kept receiving signed city frames while the waiting visitor received zero. Owner reload retained the door setting.');
}
