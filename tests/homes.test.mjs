import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../packages/island-gen/index.js';
import {generateSettlement,createFlattenHook} from '../packages/settlement/index.js';
import {prepareHomes,homeWorld,homeWalkable} from '../src/home-plan.js';
import {plotsForStreet,defaultLayout} from '../src/street-world.js';
import {walkingRoute} from '../src/street-route.js';
import {readFileSync} from 'node:fs';

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

test('every generated home has reachable doors, seating and room approaches',()=>{
  assert.ok(homes.length>450);
  for(const b of homes){
    const prefix=b.id+' ';
    assert.ok(walkingRoute(world,plots,layout,b.approach||b.entry,b.inside),prefix+'front door');
    for(const s of b.seats)assert.ok(walkingRoute(world,plots,layout,b.inside,homeWorld(b,s.x,s.z)),prefix+'seat');
    for(const room of b.rooms)assert.ok(walkingRoute(world,plots,layout,b.inside,room.point),prefix+room.name);
    assert.equal(homeWalkable(b,homeWorld(b,b.w/2,0)),false,prefix+'solid side wall');
  }
});
