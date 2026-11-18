import assert from 'node:assert/strict';
import {privateReconnectMs} from '../src/visit-admission.js';

export async function playtestTable({host,guest,open,out,blockSpectatorPrimary=false}) {
  const lot=await host.evaluate(()=>window.__cozy.island.homes.find(h=>h.name==='Home 5').id);
  async function visit(page){
    await page.locator('#directions-open').click();
    await page.locator('#destination').selectOption(lot);
    await page.locator('#jump-place').click();
    await page.waitForFunction(lot=>window.__cozy.street.openRoof===lot,lot,{timeout:30000});
  }
  async function frame(page,cell=null){
    return page.evaluate(async ({lot,cell})=>{
      const c=window.__cozy,b=c.island.homesById.get(lot),table=b.furniture.find(f=>f.type==='dining');
      const {homeWorld}=await import('./src/home-plan.js'),{Vector3}=await import('three');
      const {boardX,squareSize}=await import('./src/table-game.js'),{relativePoint}=await import('./src/furniture-pose.js');
      const where=(x,z)=>{const p=relativePoint({x,z},{x:0,z:0},table);return homeWorld(b,p.x,p.z);};
      const center=where(boardX,0),target=cell===null?center:where(boardX+(cell%3-1)*squareSize,(Math.floor(cell/3)-1)*squareSize);
      // Look down from the far edge of the table. Both breakfast chairs are
      // on the near edge, and a seated player's head can obscure a square.
      const eye=where(-.65,-1.5);
      c.street.cameraFocus=center;
      await c.setCamera([eye.x,b.y+4.4,eye.z],[center.x,b.y+1.48,center.z]);c.render();
      const r=c.street.controls.domElement.getBoundingClientRect(),v=new Vector3(target.x,b.y+.94,target.z).project(c.camera);
      const x=r.left+(v.x+1)*r.width/2,y=r.top+(1-v.y)*r.height/2;
      const element=document.elementFromPoint(x,y);
      if(element!==c.street.controls.domElement)throw Error('Table is covered by '+element?.id+' at '+[x,y]);
      return {x,y};
    },{lot,cell});
  }
  async function pick(page,cell,button){
    const p=await frame(page,cell);
    await page.mouse.click(p.x,p.y,{button});
    const label=await page.locator('#world-action').innerText({timeout:5000});
    if(cell===null)assert.equal(label,'Play Harbor Three');else assert.match(label,/Place (buoy|life ring)/);
    await page.locator('#world-action').click();
  }
  const moves=async (page,value)=>page.waitForFunction(({value,lot})=>{
    const st=window.__cozy.street,round=[...st.session.actors.values()].find(a=>a.tableRound&&a.using?.lot===lot)?.tableRound;
    const pieces=st.clearExteriors.interiors.appliances?.pieces;
    return round?.moves===value && (value==='' || pieces?.moves===value && pieces.buoys.count+pieces.rings.count===value.length);
  },{value,lot},{timeout:20000});
  await visit(host);await pick(host,null,'left');
  await host.locator('#harbor-practice').click();await moves(host,'');
  await pick(host,0,'right');await moves(host,'04');
  await guest.locator('#directions-open').click();await guest.locator('#visit-table').click();
  await guest.waitForFunction(lot=>{const s=window.__cozy.street.session,a=s.actors.get(s.id);
    return a.activity==='tablegame' && a.using.lot===lot;},lot,{timeout:30000});
  await host.locator('#harbor-together').click();await moves(guest,'');
  // The visiting player opens the shared round after the owner finishes practice.
  for(const [i,cell] of [0,3,1,4,2].entries()){
    const page=i%2?host:guest;
    if(i===0)await pick(page,cell,'right');
    else await page.locator('#harbor-squares button').nth(cell).click();
    await Promise.all([host,guest].map(p=>moves(p,'03142'.slice(0,i+1))));
  }
  for(const p of [host,guest])await p.locator('#harbor-turn').filter({hasText:'wins with buoys'}).waitFor();
  assert.equal(await host.locator('#harbor-squares .winning').count(),3);
  await frame(host);
  await host.screenshot({path:out+'/harbor-three.jpg',type:'jpeg',quality:92});
  const invite=await host.evaluate(()=>window.__cozy.street.session.invite());
  const spectator=await open(invite,blockSpectatorPrimary);
  await spectator.waitForFunction(()=>window.__cozy.street.session.connected,null,{timeout:75000});
  await moves(spectator,'03142');
  const spectatorRoute=await spectator.evaluate(()=>window.__cozy.street.session.privateRoutes.active);
  if(blockSpectatorPrimary)assert.equal(spectatorRoute,'trystero-torrent');
  assert.equal(await spectator.locator('#harbor-game').isVisible(),false);
  await guest.locator('#harbor-together').click();await moves(host,'');
  await host.locator('#harbor-squares button').nth(4).click();await moves(guest,'4');
  await guest.context().close();
  // Closing the whole browser may drop the link without a departure message.
  // The host holds the guest's seat until their reconnect window expires.
  await host.locator('#harbor-practice').waitFor({state:'visible',timeout:privateReconnectMs+15000});
  await host.waitForFunction(()=>window.__cozy.street.clearExteriors.interiors.appliances.pieces.moves==='');
  await host.locator('#use-place').click();await host.locator('#harbor-game').waitFor({state:'hidden'});
  return {lot,soloReply:'center',twoPlayerWin:'top row of buoys',travelMatchedTable:true,bothPointerButtons:true,physicalPieces:true,
    lateSpectator:true,spectatorRoute,swappedOpener:true,disconnectClearedBoard:true};
}
