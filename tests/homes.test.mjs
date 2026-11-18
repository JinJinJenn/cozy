import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../packages/island-gen/index.js';
import {generateSettlement,createFlattenHook} from '../packages/settlement/index.js';
import {prepareHomes,homeWorld,homeWalkable} from '../src/home-plan.js';
import {plotsForStreet,defaultLayout,readLayout,toWorld,walkable} from '../src/street-world.js';
import {lampIsLit,sideWindows,televisionIn} from '../src/home-fixtures.js';
import {mealStation,potServings} from '../src/home-meals.js';
import {walkingRoute} from '../src/street-route.js';
import {readFileSync} from 'node:fs';
import {StreetSession} from '../src/street-session.js';
import {StreetActivities} from '../src/street-activities.js';
import {applyRoomPlans,dividerLimit,dividerParts} from '../src/room-divider.js';

const generated=generate({preset:'harborTown',seed:'petalwood'}),world=generated.island;
world.plan=generateSettlement(generated);
generated.heightfield.set(createFlattenHook(world.plan)(generated));
const plots=plotsForStreet(world),homes=prepareHomes(world,plots),layout=defaultLayout();

test('owner room revisions preserve furnishing stations, protected occupants, undo and saved geometry',()=>{
  const b=homes.find(b=>b.name==='Home 58'),uses=b.uses,plan=[1,2,0],id=b.id;
  const s=Object.assign(Object.create(StreetSession.prototype),{island:world,ready:true,owner:true,space:'personal',
    id:'owner',actors:new Map([['owner',{...b.inside}]]),town:{current:[]},activities:{routes:new Map()},
    layout:defaultLayout(),notice(){},persist(){}});
  const door=homeWorld(b,1,0),wall=dividerParts(b,plan)[0],solid=homeWorld(b,wall.x,wall.z);
  assert.equal(dividerLimit(b,plan),'');
  try{
    s.town.current.push({...solid,asleep:true});assert.equal(s.editRoom(id,plan,0),false);s.town.current=[];
    s.activities.routes.set('guest',{goal:solid});assert.equal(s.editRoom(id,plan,0),false);s.activities.routes.clear();
    s.owner=false;assert.equal(s.editRoom(id,plan,0),false);s.owner=true;
    s.space='public';assert.equal(s.editRoom(id,plan,0),false);s.space='personal';
    assert.equal(s.editRoom(id,plan,1),false);assert.equal(s.editRoom(id,plan,0),true);
    assert.equal(b.uses,uses);assert.equal(homeWalkable(b,door),true);assert.equal(homeWalkable(b,solid),false);
    const saved=readLayout(JSON.parse(JSON.stringify(s.layout)));
    assert.deepEqual(saved.rooms.lots[id],plan);
    assert.equal(s.editRoom(id,null,0),false);assert.equal(s.editRoom(id,null,1),true);
    assert.equal(homeWalkable(b,solid),true);
    assert.equal(s.editRoom(id,null,2,true),true);assert.equal(homeWalkable(b,solid),false);
    assert.ok(!readLayout({...saved,rooms:{...saved.rooms,v:2}}));
    assert.ok(!readLayout({...saved,rooms:{...saved.rooms,lots:{[id]:[0,1,99]}}}));
    assert.equal(readLayout(defaultLayout()).rooms,undefined);
  }finally{applyRoomPlans(world,{[id]:plan},{});}
});

test('venue cells cover edited walls and the terrace on both sides of cell boundaries',()=>{
  // A copied list takes the unindexed path, using every venue as a candidate.
  const allVenues=[...plots];
  for(const wall of [-1.5,1.5]){
    const state={...defaultLayout(),wall,club:{wall,undo:[]},restaurant:{wall,undo:[]},
      homes:{l106:{wall,undo:[]},l108:{wall,side:wall,undo:[]}},terrace:{tables:[{id:0,x:3,z:7.5,turn:0}],undo:[]}};
    for(const venue of plots)for(let x=-7;x<=7;x+=.43)for(let z=-7;z<=11;z+=.43){
      const pt=toWorld(venue,x,z);
      assert.equal(walkable(world,plots,state,pt),walkable(world,allVenues,state,pt),venue.id+' '+x+','+z);
    }
  }
});

test('frontage infill preserves every published parcel and fills the waterfront',()=>{
  const published=JSON.parse(readFileSync(new URL('../packages/settlement/src/petalwood-plan.json',import.meta.url)));
  for(const lot of published.lots)assert.deepEqual(world.plan.lots.find(l=>l.id===lot.id).poly,lot.poly,lot.id);
  const added=world.plan.lots.filter(l=>l.infill);
  assert.ok(added.length>=50);assert.ok(added.filter(l=>l.frontageRoadId==='r60').length>=8);
  assert.equal(new Set(world.plan.lots.map(l=>l.id)).size,world.plan.lots.length);
});

test('house activities reserve the object, release the bed safely and complete timed work',()=>{
  const b=homes.find(b=>b.name==='Home 58');
  const s=Object.assign(Object.create(StreetSession.prototype),{island:world,plots,layout:defaultLayout(),actors:new Map(),time:0,town:{people:[]},persist(){}});
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
    const tv=televisionIn(b);
    for(const z of sideWindows(b,tv.side,tv))assert.ok(Math.abs(z-tv.z)>=1.86,prefix+'window clears television');
    const viewers=b.uses.filter(u=>u.action==='watch');
    assert.equal(viewers.length,2,prefix+'two viewing spots');
    assert.ok(Math.hypot(viewers[0].x-viewers[1].x,viewers[0].z-viewers[1].z)>.65,prefix+'viewers fit side by side');
    assert.ok(walkingRoute(world,plots,layout,b.approach||b.entry,b.inside),prefix+'front door');
    for(const s of b.seats)assert.ok(walkingRoute(world,plots,layout,b.inside,homeWorld(b,s.x,s.z)),prefix+'seat');
    for(const u of b.uses)assert.ok(walkingRoute(world,plots,layout,b.inside,homeWorld(b,u.x,u.z)),prefix+u.action+' approach');
    for(const action of ['rest','cook','wash','read','sit','watch'])assert.ok(b.uses.some(u=>u.action===action),prefix+action+' available');
    if(b.furniture.some(f=>f.type==='dining')){
      const chairs=b.uses.filter(u=>u.object.startsWith('chair-'));
      assert.equal(chairs.length,2,prefix+'both dining chairs');
      assert.ok(Math.hypot(chairs[0].x-chairs[1].x,chairs[0].z-chairs[1].z)>.65,prefix+'separate chair approaches');
    }
    for(const f of b.furniture.filter(f=>f.type==='desk'||f.type==='nightstand')){
      assert.ok(b.uses.some(u=>u.lamp===f.type),prefix+f.type+' lamp reachable');
    }
    for(const room of b.rooms)assert.ok(walkingRoute(world,plots,layout,b.inside,room.point),prefix+room.name);
    assert.equal(homeWalkable(b,homeWorld(b,b.w/2,0)),false,prefix+'solid side wall');
  }
});

test('a host owns two servings through races, interrupted meals, disconnects and reloads',()=>{
  const b=homes.find(b=>b.uses.some(u=>u.object==='chair-back'));
  const s=Object.assign(Object.create(StreetSession.prototype),{island:world,plots,layout:defaultLayout(),actors:new Map(),
    time:0,town:{people:[]},persist(){this.saved=JSON.stringify(this.layout);}});
  const acts=s.activities=new StreetActivities(s);
  const players=['host','guest','visitor'].map(id=>{const a={id,...b.inside};s.actors.set(id,a);return a;});
  const [host,guest,visitor]=players,station=key=>b.uses.findIndex(u=>u.action===key||u.object===key);
  const command=(a,key)=>acts.command(a,{type:'furniture',lot:b.id,index:station(key)});
  const arrive=a=>{for(let i=0;i<1000&&a.walking;i++)acts.advance(a,.05);assert.ok(!a.walking,a.feedback);};
  const complete=a=>{s.time+=8;acts.advance(a,.05);};
  function park(a){acts.finish(a);Object.assign(a,b.inside);}
  command(host,'cook');arrive(host);park(host);complete(host);assert.equal(s.layout.homeMeals,undefined);
  command(host,'cook');arrive(host);complete(host);assert.equal(potServings(s,b.id),2);
  command(host,'serveSoup');arrive(host);assert.equal(host.bowlFrom,b.id);park(host);
  command(guest,'serveSoup');command(visitor,'serveSoup');assert.match(visitor.feedback,/Someone else/);
  arrive(guest);assert.equal(guest.bowlFrom,b.id);park(guest);
  command(visitor,'serveSoup');assert.equal(visitor.bowlFrom,undefined);assert.equal(potServings(s,b.id),0);
  s.actors.delete(guest.id);assert.equal(potServings(s,b.id),1);
  command(visitor,'serveSoup');arrive(visitor);park(visitor);
  command(visitor,'returnSoup');arrive(visitor);assert.equal(potServings(s,b.id),1);park(visitor);
  command(visitor,'serveSoup');arrive(visitor);park(visitor);
  command(host,'chair-front');arrive(host);assert.equal(host.activity,'eat');
  command(visitor,'chair-back');arrive(visitor);assert.equal(visitor.activity,'eat');
  park(visitor);complete(host);assert.equal(host.bowlFrom,undefined);assert.equal(visitor.bowlFrom,b.id);
  const recovered=readLayout(JSON.parse(s.saved));assert.equal(potServings({layout:recovered,actors:new Map()},b.id),1);
  command(visitor,'sofa');arrive(visitor);complete(visitor);assert.equal(s.layout.homeMeals,undefined);
  assert.equal(mealStation(s,b.id,b.uses[station('chair-front')],host).action,'sit');
  assert.equal(readLayout({...s.layout,homeMeals:{[b.id]:3}}),null);
});

test('two visitors reserve the same lamp and its saved state is independent of the other lamp',()=>{
  const b=homes.find(b=>b.furniture.some(f=>f.type==='nightstand'));
  const s=Object.assign(Object.create(StreetSession.prototype),{island:world,plots,layout:defaultLayout(),actors:new Map(),
    time:0,town:{people:[]},persist(){this.saved=JSON.stringify(this.layout);}});
  const acts=s.activities=new StreetActivities(s);
  const a={id:'one',...b.inside},other={id:'two',...b.inside};s.actors.set(a.id,a);s.actors.set(other.id,other);
  const flip=(actor,kind)=>acts.command(actor,{type:'furniture',lot:b.id,index:b.uses.findIndex(u=>u.lamp===kind)});
  const arrive=()=>{for(let i=0;i<1000&&a.walking;i++)acts.advance(a,.05);assert.equal(a.activity,'switch');};
  flip(a,'desk');flip(other,'desk');assert.match(other.feedback,/Someone else/);arrive();
  const saved=()=>readLayout(JSON.parse(s.saved));
  assert.ok(lampIsLit(saved(),b.id,'desk'));assert.ok(!lampIsLit(saved(),b.id,'nightstand'));
  s.time+=1;acts.advance(a,.05);assert.equal(a.using,undefined);
  flip(a,'nightstand');arrive();assert.ok(lampIsLit(saved(),b.id,'nightstand'));
  flip(a,'desk');arrive();assert.ok(!lampIsLit(saved(),b.id,'desk'));assert.ok(lampIsLit(saved(),b.id,'nightstand'));
  assert.equal(readLayout({...s.layout,homeLights:{[b.id]:4}}),null);
});

test('watching together reserves two places and shares one persistent channel per home',()=>{
  const b=homes.find(b=>b.name==='Home 58');
  const s=Object.assign(Object.create(StreetSession.prototype),{island:world,plots,layout:defaultLayout(),actors:new Map(),
    time:0,town:{people:[]},persist(){this.saved=JSON.stringify(this.layout);}});
  const acts=s.activities=new StreetActivities(s);
  const [a,guest,visitor]=['host','guest','visitor'].map(id=>{
    const actor={id,...b.inside};s.actors.set(id,actor);return actor;
  });
  const watch=actor=>s.applyCommand(actor,{type:'furniture',lot:b.id,index:b.uses.findIndex(u=>u.action==='watch')});
  const arrive=actor=>{for(let i=0;i<1000&&actor.walking;i++)acts.advance(actor,.05);};
  const tune=(actor,channel,lot=b.id)=>s.applyCommand(actor,{type:'tv-channel',lot,channel});
  tune(visitor,3);assert.equal(s.layout.homeTV,undefined);
  watch(a);watch(guest);watch(visitor);assert.match(visitor.feedback,/Someone else/);
  arrive(a);arrive(guest);assert.equal(a.using.object,'sofa');
  assert.equal(guest.using.object,b.uses.find(u=>u.action==='watch'&&u.alternate).object);
  assert.ok(Math.hypot(a.x-guest.x,a.z-guest.z)>.65);
  assert.equal(a.activity,'watch');assert.equal(guest.activity,'watch');assert.equal(s.layout.homeTV[b.id],1);
  tune(guest,3);assert.equal(readLayout(JSON.parse(s.saved)).homeTV[b.id],3);
  tune(a,27);tune(a,1,'l9999');assert.deepEqual(s.layout.homeTV,{[b.id]:3});
  tune(a,0);assert.equal(readLayout(JSON.parse(s.saved)).homeTV,undefined);
  acts.finish(guest);tune(guest,2);assert.equal(s.layout.homeTV,undefined);
  assert.equal(readLayout({...s.layout,homeTV:{[b.id]:4}}),null);
});
