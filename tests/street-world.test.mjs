import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultLayout,floorAt,gardenForStreet,frontAt,legalWall,moveWalker,plotsForStreet,readLayout,toWorld,toRoom,walkable} from '../src/street-world.js';
import {generate} from '../packages/island-gen/index.js';
import {createFlattenHook,generateSettlement} from '../packages/settlement/index.js';
import {pointInPoly} from '../packages/settlement/src/geom.js';
import {StreetSession} from '../src/street-session.js';
const b={kind:'cafe',cafe:true,x:12,z:-16,y:4,c:Math.cos(.7),s:Math.sin(.7),w:9.2,d:8.6};
const island={half:100,sample:()=>3,slope:()=>0,waterAt:()=>0};
test('a moving partition sweeps occupants and its open door leaf',()=>{
  assert.equal(legalWall(-1.5,1.5,[toWorld(b,2,.3)],b),-.5);
  assert.equal(legalWall(1.5,-1.5,[toWorld(b,1.02,-.6)],b),1);
  assert.equal(legalWall(-1.5,1.5,[toWorld(b,0,0)],b),1.5);
});
test('movement crosses both door thresholds and stops at a solid wall',()=>{
  const layout=defaultLayout();
  for(const [x,limit] of [[0,-2],[1.8,4.3]]){
    const a=toWorld(b,x,6.3);
    for(let i=0;i<20;i++)moveWalker(island,[b],layout,a,{x:-b.s,z:-b.c},.15);
    const p=toRoom(b,a);
    if(x===0)assert.ok(p.z<limit);else assert.ok(p.z>=limit);
    assert.ok(walkable(island,[b],layout,a));
  }
});
test('saved layouts reject corrupt wall and undo values',()=>{
  const s=defaultLayout();assert.deepEqual(readLayout(s),s);
  for(const v of [null,'1',.25,2]){assert.equal(readLayout({...s,wall:v}),null);assert.equal(readLayout({...s,undo:[v]}),null);}
});
test('old café saves migrate and per-house history rejects malformed saves',()=>{
  const old={wall:-.5,undo:[1],lights:false,revision:3};
  assert.deepEqual(readLayout(old),{...old,homes:{},club:{wall:0,undo:[]},terrace:defaultLayout().terrace});
  for(const homes of [null,[],{l108:{wall:7,undo:[]}},{l106:{wall:.5,undo:[null]}},{l105:{wall:0,undo:[]}}])
    assert.equal(readLayout({...old,homes}),null);
});
test('home frontage sweeps its open door, respects the parcel, and moves floor and collision together',()=>{
  const home={...b,cafe:false,kind:'house',id:'l108',w:6.6,d:6.9},hd=home.d/2;
  assert.equal(legalWall(0,1.5,[toWorld(home,2,hd+.85)],home),0);
  assert.equal(legalWall(0,-1.5,[toWorld(home,1,hd-1.6)],home),0);
  assert.equal(legalWall(0,1.5,[toWorld(home,0,hd+.5)],home),1.5);
  const q=toWorld(home,2,hd+.6),layout=defaultLayout();
  assert.equal(floorAt(island,[home],q.x,q.z,layout),3);
  layout.homes.l108={wall:1,undo:[0]};
  assert.equal(floorAt(island,[home],q.x,q.z,layout),4);
  assert.equal(walkable(island,[home],layout,toWorld(home,2,hd)),true);
  assert.equal(walkable(island,[home],layout,toWorld(home,2,frontAt(home,layout))),false);
  const local=[[-5,-5],[5,-5],[5,hd+1.1],[-5,hd+1.1]];
  home.parcel=local.map(([x,z])=>{const p=toWorld(home,x,z);return [p.x,p.z];});
  assert.equal(legalWall(0,1.5,[],home),.5);
});
test('club renovation preserves both music parts and blocks undo across an occupied door',()=>{
  const club={...b,cafe:false,kind:'club',id:'l102',w:6.6,d:6.9};
  const s=Object.assign(Object.create(StreetSession.prototype),{owner:true,ready:true,layout:defaultLayout(),
    plots:[club],actors:new Map(),town:{people:[]},persist(){},notice(){}});
  for(const [id,x] of [['A',-1.7],['B',1.7]]){
    s.actors.set(id,{id,...toWorld(club,x,-1.1)});s.interact(id);
  }
  assert.ok(s.edit(1,false,club.id));
  assert.equal(s.actors.get('A').part,'melody');assert.equal(s.actors.get('B').part,'bass');
  assert.deepEqual(readLayout(s.layout).club,{wall:1,undo:[0]});
  assert.equal(readLayout({...s.layout,club:{wall:1,undo:['broken']}}),null);
  s.actors.set('C',{id:'C',...toWorld(club,2,club.d/2+.5)});
  assert.equal(s.edit(0,true,club.id),false);assert.deepEqual(s.layout.club.undo,[0]);
  s.actors.delete('C');assert.ok(s.edit(0,true,club.id));assert.equal(s.layout.club.wall,0);
});
test('extending either front corner stops before its side wall traps a walker',()=>{
  const home={...b,cafe:false,kind:'house',id:'l108',w:6.6,d:6.9};
  for(const side of [-1,1]){
    const p=toWorld(home,side*(home.w/2+.36),home.d/2+.87),layout=defaultLayout();
    assert.ok(walkable(island,[home],layout,p));
    const wall=legalWall(0,1.5,[p],home);
    assert.equal(wall,.5);
    layout.homes.l108={wall,undo:[0]};
    assert.ok(walkable(island,[home],layout,p));
    layout.homes.l108.wall=1;
    assert.equal(walkable(island,[home],layout,p),false);
  }
});
test('Bluebell corner edits sweep the side, fit the parcel and preserve occupied undo history',()=>{
  const home={...b,id:'l108',cafe:false,kind:'house',w:6.6,d:6.9};
  const s=Object.assign(Object.create(StreetSession.prototype),{owner:true,ready:true,layout:defaultLayout(),
    plots:[home],actors:new Map(),town:{people:[]},updatePatrol(){},persist(){},notice(){}});
  const point=toWorld(home,3.95,0);
  s.actors.set('guest',point);
  assert.equal(s.edit(0,false,home.id,1.5),false);
  assert.ok(walkable(island,[home],s.layout,point));
  s.actors.clear();
  assert.ok(s.edit(.5,false,home.id,1.5));assert.ok(walkable(island,[home],s.layout,point));
  assert.equal(floorAt(island,[home],point.x,point.z,s.layout),home.y);
  assert.equal(walkable(island,[home],s.layout,toWorld(home,4.8,1)),false);
  s.layout=readLayout(s.layout);assert.deepEqual(s.layout.homes.l108.undo,[[0,0]]);
  s.town.people=[{visible:true,position:point}];
  assert.equal(s.edit(0,true,home.id),false);assert.deepEqual(s.layout.homes.l108.undo,[[0,0]]);
  s.town.people=[];assert.ok(s.edit(0,true,home.id));
  assert.equal(s.layout.homes.l108.side,0);assert.equal(floorAt(island,[home],point.x,point.z,s.layout),3);
  home.parcel=[[-5,-5],[4.5,-5],[4.5,6],[-5,6]].map(([x,z])=>{const p=toWorld(home,x,z);return [p.x,p.z];});
  assert.equal(s.limitFor(home,0,1.5).side,.5);assert.equal(s.limitFor(home,0,1.5).reason,'parcel');
  assert.equal(s.limitFor(home,0,-1.5).reason,'furniture');
  assert.equal(readLayout({...s.layout,homes:{l108:{wall:0,side:1,undo:[[0,5]]}}}),null);
  s.owner=false;assert.equal(s.edit(.5,false,home.id,.5),false);
});
test('all waterfront front doors can be reached from their shared road on the graded island',()=>{
  const result=generate({seed:'petalwood',preset:'harborTown'}),world=result.island;
  world.plan=generateSettlement(result);result.heightfield.set(createFlattenHook(world.plan)(result));
  const plots=plotsForStreet(world),layout=defaultLayout();assert.equal(plots.length,7);
  assert.equal(world.plan.lots.length,534);
  assert.deepEqual(world.plan.lots[107].poly[0],[-138.4,227.5]);
  const depth=world.waterAt(-190,-54)-world.sample(-190,-54);
  assert.ok(depth>0&&depth<2,'the graded channel keeps a river bed below the waterline');

  for(const p of plots){
    const lot=world.plan.lots.find(l=>l.id===p.id);assert.ok(lot.buildable,p.kind);assert.equal(p.road,plots[0].road);
    for(const x of [-1,1])for(const z of [-1,1]){
      const q=toWorld(p,x*p.w/2,z*p.d/2);assert.ok(pointInPoly(q.x,q.z,lot.poly),p.kind+' footprint');
    }
    const walker=toWorld(p,0,13);
    for(let i=0;i<36;i++)moveWalker(world,plots,layout,walker,{x:-p.s,z:-p.c},.08);
    assert.ok(toRoom(p,walker).z<1.5,p.kind+' doorway');
  }
});
test('the club reserves two different keyboard parts and the restaurant seats diners at tables',()=>{
  const club={...b,kind:'club',cafe:false},kitchen={...club,x:35,kind:'restaurant'};
  const session=Object.create(StreetSession.prototype);
  session.plots=[club,kitchen];session.actors=new Map();
  for(const [id,place,x,z] of [['A',club,-1.7,-1],['B',club,1.7,-1],['C',kitchen,-1.65,.65]]){
    session.actors.set(id,{id,...toWorld(place,x,z)});session.interact(id);
  }
  assert.equal(session.actors.get('A').part,'melody');assert.equal(session.actors.get('B').part,'bass');
  assert.equal(session.actors.get('C').activity,'dine');
  session.interact('A');assert.equal(session.actors.get('A').part,'');
});
test('the waterfront patrol enters both resized homes and returns to the café',()=>{
  const r=generate({seed:'petalwood',preset:'harborTown'}),world=r.island;
  world.plan=generateSettlement(r);r.heightfield.set(createFlattenHook(world.plan)(r));
  const s=Object.create(StreetSession.prototype);
  s.plots=plotsForStreet(world);s.cafe=s.plots.find(p=>p.cafe);s.island=world;s.layout=defaultLayout();
  s.layout.homes={l106:{wall:1.5,undo:[0]},l108:{wall:-1.5,undo:[0]}};
  s.updatePatrol();const resident={...s.patrol[0],id:'resident0',way:0,dwell:0};
  Object.assign(s,{ready:true,owner:true,time:0,lastSent:Infinity,town:{advance(){}},actors:new Map([[resident.id,resident]])});
  const stops=new Set();
  for(let i=0;i<9000;i++){
    s.tick(.05);
    if(resident.way===8||resident.way===14)stops.add(resident.way);
    if(stops.size===2&&resident.way===3)break;
  }
  assert.deepEqual(stops,new Set([8,14]));assert.equal(resident.way,3);
});

test('an intervening roof limits the orbit while an open sightline keeps the requested zoom',async()=>{
  const {cameraClearance}=await import('../src/street-world.js');
  const house={x:0,z:7,y:0,c:1,s:0,w:4,d:4,height:4.5},at={x:0,y:1.5,z:0};
  const t=cameraClearance(at,{x:0,y:4,z:14},house);
  assert.ok(t>.30&&t<.36);
  assert.equal(cameraClearance(at,{x:9,y:4,z:7},house),1);
  assert.equal(cameraClearance(at,{x:0,y:18,z:14},house),1);
  assert.equal(cameraClearance({...at,z:7},{x:0,y:4,z:14},house),1);
});

test('the garden pavilion reserves each bench and releases it when a visitor stands',()=>{
  const s=Object.create(StreetSession.prototype);
  s.plots=[b];s.garden=gardenForStreet({...b,yaw:.7});s.actors=new Map();
  for(const [id,x] of [['one',-1.25],['two',1.25],['three',-1.25]]){
    s.actors.set(id,{id,...toWorld(s.garden,x,.11)});
    s.interact(id);
  }
  assert.equal(s.actors.get('one').activity,'sit');
  assert.equal(s.actors.get('two').activity,'sit');
  assert.equal(s.actors.get('three').activity,undefined);
  s.interact('one');
  Object.assign(s.actors.get('one'),toWorld(s.garden,-1.25,-2));
  s.interact('three');
  assert.equal(s.actors.get('three').activity,'sit');
});
