import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../packages/island-gen/index.js';
import {generateSettlement,createFlattenHook} from '../packages/settlement/index.js';
import {prepareHomes,homeWorld,homeWalkable} from '../src/home-plan.js';
import {plotsForStreet,defaultLayout} from '../src/street-world.js';
import {walkingRoute} from '../src/street-route.js';
import {readFileSync} from 'node:fs';
import {StreetSession} from '../src/street-session.js';
import {StreetActivities} from '../src/street-activities.js';

const generated=generate({preset:'harborTown',seed:'petalwood'}),world=generated.island;
world.plan=generateSettlement(generated);
generated.heightfield.set(createFlattenHook(world.plan)(generated));
const plots=plotsForStreet(world),homes=prepareHomes(world,plots),layout=defaultLayout();

test('frontage infill preserves every published parcel and fills the waterfront',()=>{
  const published=JSON.parse(readFileSync(new URL('../packages/settlement/src/petalwood-plan.json',import.meta.url)));
  for(const lot of published.lots)assert.deepEqual(world.plan.lots.find(l=>l.id===lot.id).poly,lot.poly,lot.id);
  const added=world.plan.lots.filter(l=>l.infill);
  assert.ok(added.length>=50);assert.ok(added.filter(l=>l.frontageRoadId==='r60').length>=8);
  assert.equal(new Set(world.plan.lots.map(l=>l.id)).size,world.plan.lots.length);
});

test('house activities reserve the object, release the bed safely and complete timed work',()=>{
  const b=homes.find(b=>b.name==='Home 58');
  const s=Object.assign(Object.create(StreetSession.prototype),{island:world,plots,layout,actors:new Map(),time:0,town:{people:[]}});
  const activities=s.activities=new StreetActivities(s);
  const a={id:'first',...b.inside},guest={id:'second',...b.inside};s.actors.set(a.id,a);s.actors.set(guest.id,guest);
  const command=(actor,action)=>activities.command(actor,{type:'furniture',lot:b.id,index:b.uses.findIndex(u=>u.action===action)});
  const arrive=actor=>{for(let i=0;i<1000&&actor.walking;i++)activities.advance(actor,.05);assert.equal(actor.walking,false);};
  command(a,'rest');command(guest,'rest');assert.match(guest.feedback,/Someone else/);arrive(a);assert.equal(a.activity,'rest');
  activities.command(a,{type:'walk',...b.inside});arrive(a);assert.equal(a.using,undefined);assert.ok(homeWalkable(b,a));
  command(guest,'rest');arrive(guest);assert.equal(guest.activity,'rest');activities.finish(guest);assert.ok(homeWalkable(b,guest));
  command(a,'cook');command(guest,'wash');assert.match(guest.feedback,/Someone else/);arrive(a);assert.equal(a.activity,'cook');
  s.time=8;activities.advance(a,.05);assert.equal(a.using,undefined);assert.equal(a.activity,'');assert.match(a.feedback,/meal is ready/);
});

test('every generated home has reachable doors, seating and room approaches',()=>{
  assert.ok(homes.length>450);
  for(const b of homes){
    const prefix=b.id+' ';
    assert.ok(walkingRoute(world,plots,layout,b.approach||b.entry,b.inside),prefix+'front door');
    for(const s of b.seats)assert.ok(walkingRoute(world,plots,layout,b.inside,homeWorld(b,s.x,s.z)),prefix+'seat');
    for(const u of b.uses)assert.ok(walkingRoute(world,plots,layout,b.inside,homeWorld(b,u.x,u.z)),prefix+u.action+' approach');
    for(const action of ['rest','cook','wash','read','sit'])assert.ok(b.uses.some(u=>u.action===action),prefix+action+' available');
    for(const room of b.rooms)assert.ok(walkingRoute(world,plots,layout,b.inside,room.point),prefix+room.name);
    assert.equal(homeWalkable(b,homeWorld(b,b.w/2,0)),false,prefix+'solid side wall');
  }
});
