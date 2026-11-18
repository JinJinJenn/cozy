import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

export async function playAddresses({host,guest,paired,ready,wait,navigate,profile}){
  const players=[host,guest];
  const originals=await Promise.all(players.map((page,i)=>page.evaluate(async revision=>{
    const {loadOwner,project,save}=await import('./src/private-saves.js');
    const {defaultLayout}=await import('./src/street-world.js');
    const owner=await loadOwner();save(project+'.layout.'+owner.identity.pub,{...defaultLayout(),revision});
    return {pub:owner.identity.pub,revision};
  },i+4)));
  const lot=await host.evaluate(()=>{
    const s=window.__cozy.street.session,homes=[...s.island.homesById.values()];
    return homes.find(h=>homes.some(b=>b!==h&&b.w>=h.w&&b.d>=h.d)).id;
  });
  async function visit(page){
    await page.locator('#directions-open').click();await page.locator('#destination').selectOption(lot);
    await page.locator('#jump-place').click();
    await wait(page,id=>window.__cozy.street.session.near(window.__cozy.street.session.actors.get(window.__cozy.street.session.id))?.id===id,lot);
    await page.locator('#address-open').click();
  }
  const addresses=page=>page.evaluate(()=>window.__cozy.street.session.addresses.confirmed);
  const own=page=>page.evaluate(()=>window.__cozy.street.session.addresses.own);
  await Promise.all(players.map(visit));
  await Promise.all(players.map(p=>p.locator('#address-claim').click()));
  await Promise.all(players.map(p=>wait(p,()=>['owned','taken'].includes(window.__cozy.street.session.addresses.result?.code))));
  const winner=(await own(host))?host:guest,other=winner===host?guest:host;
  assert.equal((await own(winner)).lot,lot);assert.ok(!(await own(other)));
  const alternative=await other.evaluate(()=>window.__cozy.street.session.addresses.result.lot);
  assert.ok(alternative&&alternative!==lot);
  if(process.env.COZY_PARCEL_SHOT){
    const file=process.env.COZY_PARCEL_SHOT;await mkdir(path.dirname(file),{recursive:true});
    await other.locator('#address-alternative').waitFor({state:'visible'});
    await other.screenshot({path:file,type:'jpeg',quality:90});
  }
  await other.locator('#address-alternative').click();
  await Promise.all(players.map(p=>wait(p,()=>window.__cozy.street.session.addresses.confirmed?.length===2)));
  const leases=await addresses(host);assert.deepEqual(await addresses(guest),leases);
  assert.equal((await own(other)).home,lot);assert.equal((await own(other)).lot,alternative);
  for(const original of originals)assert.ok(!JSON.stringify(leases).includes(original.pub));
  const mine=await own(host),theirs=await own(guest);
  await navigate(host,'#address-private');
  const privateHome=await host.evaluate(()=>{
    const s=window.__cozy.street.session;
    return {lot:s.near(s.actors.get(s.id))?.id,pub:s.pub,revision:s.layout.revision,owner:s.canBuild};
  });
  assert.deepEqual(privateHome,{lot:mine.home,...originals[0],owner:true});
  await host.locator('#social-open').click();await host.locator('#copy-street').click();
  const invite=await host.locator('#invite-url').inputValue();assert.equal(new URL(invite).searchParams.get('home'),mine.home);
  const friend=await profile();
  try{
    await friend.goto(invite);await ready(friend);
    await wait(friend,lot=>{const s=window.__cozy.street.session;return s.space==='visit'&&s.connected&&!s.canBuild&&s.near(s.actors.get(s.id))?.id===lot;},mine.home);
  }catch(error){
    for(const [role,p] of [['host',host],['visitor',friend]])console.error('Private admission',role,await p.evaluate(async()=>{
      const s=window.__cozy?.street?.session;if(!s)return {started:false};
      const {homeAt}=await import('./src/home-plan.js'),a=s.actors.get(s.id);
      return {space:s.space,ready:s.ready,connected:s.connected,actors:s.actors.size,peers:s.peers.size,transports:s.connections.length,
        seq:s.seq,signed:s.verifiedSeq,invited:s.invitedHome,home:a&&homeAt(s.island,a)?.id,near:a&&s.near(a)?.id,
        entry:a?.entryHome,feedback:a?.feedback,transportError:s.transportError,sessionError:s.error};
    }));
    throw error;
  }finally{await friend.context().close();}
  await wait(guest,()=>window.__cozy.street.session.owner);
  await wait(guest,id=>window.__cozy.street.session.addresses.book.byLot(id)?.until>Date.now(),mine.lot);
  assert.equal((await own(guest)).lot,theirs.lot);
  await navigate(host,'#public-street');await Promise.all(players.map(paired));
  await wait(host,()=>{const s=window.__cozy.street.session;return s.addresses.own?.actor===s.id;});
  assert.equal((await own(host)).lot,mine.lot);
  await host.locator('#social-open').click();await host.locator('#address-travel').click();
  await wait(host,lot=>{const s=window.__cozy.street.session;return s.near(s.actors.get(s.id))?.id===lot;},mine.lot);
  await host.locator('#address-open').click();await host.locator('#address-release').click();
  await Promise.all(players.map(p=>wait(p,()=>window.__cozy.street.session.addresses.confirmed?.length===1)));
  assert.equal((await own(guest)).lot,theirs.lot);
  if(!await guest.locator('#social-pane').isVisible())await guest.locator('#social-open').click();
  await navigate(guest,'#address-private');await ready(guest);
  assert.deepEqual(await guest.evaluate(()=>{const s=window.__cozy.street.session;return {pub:s.pub,revision:s.layout.revision,home:s.near(s.actors.get(s.id))?.id};}),{...originals[1],home:lot});
  console.log('PASS competing public house claims, explicit compatible alternative, two isolated private saves, private house invite, signed host handover, reconnect, teleport and release');
}
