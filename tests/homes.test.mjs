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
import {planInterior,syncInteriors} from '../src/home-furnishing.js';
import {footprint,readFurnishings} from '../src/furniture-pose.js';
import {rerouteResidents} from '../src/resident-world.js';

const generated=generate({preset:'harborTown',seed:'petalwood'}),world=generated.island;
world.plan=generateSettlement(generated);
generated.heightfield.set(createFlattenHook(world.plan)(generated));
const plots=plotsForStreet(world),homes=prepareHomes(world,plots),layout=defaultLayout();

test('resident worker applies the same desk collision on commit and undo before stepping the population',async()=>{
  const island=structuredClone(Object.fromEntries(['seed','presetId','size','half','grid','cell','plan'].map(k=>[k,world[k]])));
  Object.assign(island,{h:generated.heightfield,water:generated.water,bridgeSpans:[],streetBenches:new Map(),footprintCells:new Map()});
  let message;globalThis.self={postMessage:m=>{message=m;}};
  try{
    await import('../src/resident-worker.js');
    self.onmessage({data:{type:'init',island,config:{seed:'petalwood',preset:'harborTown',startHour:10,population:'town'}}});
    assert.equal(message.type,'ready',message.message);
    const home=island.homesById.get('l93'),desk=home.furniture.find(f=>f.id==='desk');
    const target=homeWorld(home,desk.x-.52,desk.z-.95);
    assert.equal(homeWalkable(home,target),true);
    const step=layout=>self.onmessage({data:{type:'step',steps:1,actors:[],routes:[],layout}});
    step({...defaultLayout(),revision:1,furnishings:{v:1,lots:{l93:{desk:[-2,-2,1]}}}});
    assert.equal(message.type,'frame',message.message);assert.equal(message.positions.length,457);assert.equal(homeWalkable(home,target),false);
    step({...defaultLayout(),revision:2});assert.equal(message.type,'frame',message.message);assert.equal(homeWalkable(home,target),true);
  }finally{delete globalThis.self;}
});

test('blocked return-home trip keeps its destination and clear trips keep their current path',()=>{
  const home=homes.find(b=>b.name==='Home 58'),{next}=planInterior(home,{desk:[-2,-2,1]});
  const desk=home.furniture.find(f=>f.id==='desk');
  const position=(x,z)=>{const p=homeWorld(home,x,z);return [p.x,p.z];};
  const start=position(desk.x-.60,desk.z-1.8),end=position(desk.x-.60,desk.z+.8);
  const moving=(pos,goal)=>({pos,home:{comp:1},action:{kind:'move',i:0,then:{kind:'arriveHome'},interruptible:false,pts:[goal]}});
  const resident=moving(start,end),other=moving([999,999],[998,998]),old=other.action.pts;
  const detour=[position(0,0),end];let calls=0;
  rerouteResidents({npcs:[resident,other],ctx:{nav:{findPath:(from,to)=>{
    calls++;assert.deepEqual(from,start);assert.deepEqual(to,end);return {pts:detour};
  }}}},[next]);
  assert.equal(calls,1);assert.equal(resident.action.pts,detour);assert.equal(resident.action.then.kind,'arriveHome');
  assert.equal(other.action.pts,old);
});

test('six furnishings can move while their generated activities keep stable slots',()=>{
  for(const [name,id,pose] of [
    ['Home 58','sofa',[2,-2,1]],['Home 58','bed',[1,1,0]],['Home 58','desk',[-2,-2,1]],
    ['Home 5','nightstand',[1,-1,0]],['Home 5','dining',[1,1,1]],['Home 58','rug',[-2,1,1]]
  ]){
    const home=homes.find(b=>b.name===name),old=home.furniture.find(f=>f.id===id);
    const {next,reason}=planInterior(home,{[id]:pose});assert.equal(reason,'',id);
    assert.deepEqual(next.uses.map(u=>[u.action,u.object]),home.uses.map(u=>[u.action,u.object]));
    const moved=next.furniture.find(f=>f.id===id);
    assert.equal(moved.x,old.x+pose[0]/4);assert.equal(footprint(moved).w,pose[2]%2?old.d:old.w);
    assert.deepEqual(televisionIn(next),televisionIn(home));
  }
});

test('furnishing edits protect guests, their reserved arrivals, old saves and atomic layout recovery',()=>{
  const b=homes.find(b=>b.name==='Home 58'),id=b.id,pose=[-2,-2,1],desk=b.uses.findIndex(u=>u.lamp==='desk');
  const s=Object.assign(Object.create(StreetSession.prototype),{island:world,ready:true,owner:true,space:'personal',
    id:'owner',actors:new Map([['owner',{...b.inside}]]),town:{current:[]},activities:{routes:new Map()},
    layout:defaultLayout(),notice(){},persist(){}});
  const original=b.uses[desk].target;
  try{
    s.activities.routes.set('guest',{arrival:{lot:id,index:desk},goal:b.inside});
    assert.equal(s.editFurniture(id,'desk',pose,0),false);s.activities.routes.clear();
    s.actors.set('guest',{...b.inside,using:{lot:id,index:desk}});assert.equal(s.editFurniture(id,'desk',pose,0),false);s.actors.delete('guest');
    s.owner=false;assert.equal(s.editFurniture(id,'desk',pose,0),false);s.owner=true;
    assert.equal(s.editFurniture(id,'desk',[64,64,0],0),false);
    assert.equal(s.editFurniture(id,'desk',pose,0),true);assert.notDeepEqual(b.uses[desk].target,original);
    assert.equal(s.editFurniture(id,'desk',[0,0,0],0),false);
    const saved=readLayout(JSON.parse(JSON.stringify(s.layout)));
    assert.deepEqual(saved.furnishings.lots[id].desk,pose);
    assert.equal(s.editFurniture(id,'desk',null,1,true),true);assert.deepEqual(b.uses[desk].target,original);
    const bad={...saved,furnishings:{v:1,lots:{[id]:{desk:pose},l99999:{bed:pose}}}};
    assert.equal(syncInteriors(world,s.layout,bad),false);assert.deepEqual(b.uses[desk].target,original);
    assert.ok(syncInteriors(world,s.layout,saved,true));assert.deepEqual(b.uses[desk].target,original);
    assert.ok(syncInteriors(world,s.layout,saved));assert.deepEqual(b.placements.desk,pose);
    assert.equal(readFurnishings({v:1,lots:{[id]:{kitchen:pose}}}),null);
    assert.equal(readFurnishings({v:1,lots:{[id]:{desk:[1,2,4]}}}),null);
  }finally{syncInteriors(world,{furnishings:{lots:{[id]:{}}}},defaultLayout());}
});

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
      const chairs=b.uses.filter(u=>u.action==='sit'&&u.object.startsWith('chair-'));
      assert.equal(chairs.length,2,prefix+'both dining chairs');
      const players=b.uses.filter(u=>u.action==='tablegame');
      assert.deepEqual(players.map(u=>[u.object,u.x,u.z]),chairs.map(u=>[u.object,u.x,u.z]),prefix+'board shares real seats and reservations');
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
