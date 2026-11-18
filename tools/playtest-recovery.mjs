import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function playtestRecovery({host,guest,open,origin,out}){
  const pass=randomUUID(),lot='l93';
  const menu=async p=>{await p.locator('#social-open').click();await p.locator('#street-saves summary').click();};
  const invite=await host.evaluate(()=>window.__cozy.street.session.invite());
  const source=await host.evaluate(lot=>{
    const c=window.__cozy,s=c.street.session,b=c.island.homesById.get(lot);
    Object.assign(s.actors.get(s.id),b.inside);
    if(!s.editRoom(lot,[1,2,0],s.layout.revision))throw Error('Fixture setup failed.');
    s.rememberCoffee('resident1');return {pub:s.pub,revision:s.layout.revision};
  },lot);
  await guest.waitForFunction(id=>window.__cozy.island.homesById.get(id).divider,lot);
  await menu(host);await host.locator('#save-pass').fill(pass);
  const downloading=host.waitForEvent('download');await host.locator('#save-download').click();
  const file=await downloading,stream=await file.createReadStream(),chunks=[];for await(const c of stream)chunks.push(c);
  const bytes=Buffer.concat(chunks);assert.ok(!bytes.toString().includes(source.pub));assert.ok(!bytes.toString().includes(pass));
  await host.locator('#save-status').filter({hasText:'Backup downloaded'}).waitFor();
  await host.screenshot({path:out+'/street-backup.jpg',type:'jpeg',quality:89});
  await guest.locator('#social-open').click();assert.equal(await guest.locator('#street-saves').isVisible(),false);
  const newDevice=await open(origin+'?space=personal'),original=await newDevice.evaluate(()=>{
    const s=window.__cozy.street.session;s.rememberCoffee('resident0');return s.pub;
  });
  assert.notEqual(original,source.pub);
  await newDevice.locator('#social-open').click();await newDevice.locator('#public-street').click();
  await newDevice.waitForFunction(()=>window.__cozy?.ready&&window.__cozy.street.session?.ready&&window.__cozy.street.session.space==='public',null,{timeout:120000});
  await menu(newDevice);
  assert.equal(await newDevice.locator('#save-download').isVisible(),false);
  await newDevice.locator('#save-file').setInputFiles({name:file.suggestedFilename(),mimeType:'application/json',buffer:bytes});
  await newDevice.locator('#save-pass').fill('incorrect');await newDevice.locator('#save-unlock').click();
  await newDevice.locator('#save-status').filter({hasText:'Could not unlock'}).waitFor();
  assert.equal(await newDevice.locator('#save-restore').isVisible(),false);
  await newDevice.locator('#save-pass').fill(pass);await newDevice.locator('#save-unlock').click();
  await newDevice.locator('#save-restore').waitFor();
  assert.equal(await newDevice.evaluate(()=>window.__cozy.street.session.space),'public');
  await newDevice.locator('#save-restore').click();
  await newDevice.waitForFunction(pub=>{const s=window.__cozy?.street?.session;return s?.ready&&s.pub===pub&&!s.owner&&s.connected;},source.pub,{timeout:60000});
  assert.equal(await host.evaluate(()=>window.__cozy.street.session.canBuild),true);
  assert.equal(await guest.evaluate(()=>window.__cozy.street.session.connected),true);
  await host.context().close();
  await newDevice.reload();
  await newDevice.waitForFunction(pub=>{const s=window.__cozy?.street?.session;return s?.ready&&s.canBuild&&s.pub===pub;},source.pub,{timeout:120000});
  const fresh=await open(invite);
  await fresh.waitForFunction(lot=>{const s=window.__cozy.street.session;return s.connected&&s.island.homesById.get(lot).divider?.[1]===2;},lot,{timeout:45000});
  const recovered=await newDevice.evaluate(({lot,revision})=>{
    const s=window.__cozy.street.session,b=s.island.homesById.get(lot),owner=s.actors.get(s.id);
    if(Math.hypot(owner.x-b.inside.x,owner.z-b.inside.z)>.01)throw Error('The backup opened at the wrong address.');
    if(s.layout.revision!==revision||s.coffeeVisits.resident1!==1||!s.editRoom(lot,null,revision))throw Error('Restore did not preserve an editable save.');
    return s.ownerSave.slot;
  },{lot,revision:source.revision});
  await fresh.waitForFunction(lot=>!window.__cozy.island.homesById.get(lot).divider,lot);
  await guest.waitForFunction(({lot,rev})=>{const s=window.__cozy.street.session;return s.connected&&s.layout.revision===rev+1&&!s.island.homesById.get(lot).divider;},{lot,rev:source.revision},{timeout:45000});
  await menu(newDevice);await newDevice.locator('#save-slot').selectOption('');await newDevice.locator('#save-switch').click();
  await newDevice.waitForFunction(pub=>{const s=window.__cozy?.street?.session;return s?.ready&&s.pub===pub&&s.coffeeVisits?.resident0===1;},original,{timeout:120000});
  await menu(newDevice);await newDevice.locator('#save-slot').selectOption(recovered);await newDevice.locator('#save-switch').click();
  await newDevice.waitForFunction(({pub,rev})=>{const s=window.__cozy?.street?.session;return s?.ready&&s.pub===pub&&s.layout.revision===rev+1&&s.coffeeVisits?.resident1===1;},{pub:source.pub,rev:source.revision},{timeout:120000});
  return {copiedByDownload:true,wrongPassphraseKeptLocalSave:true,validPreviewKeptLocalSave:true,
    connectedOwnersConverged:true,originalInviteRejoined:true,existingGuestReconnected:true,restoredOwnerBuilt:true,returnedToHome:true,visitHistory:true,bothLocalSavesReopened:true};
}
