// The first street sits on actual Harbor Town plots. Coordinates in each
// house are metres, with its street entrance on the positive Z side.
import {pointInPoly,polyCentroid} from '../packages/settlement/src/geom.js';
import {readTerrace,terraceDefault} from './terrace.js';
import {homeAt,homeLocal,homeWalkableLocal} from './home-plan.js';
import {tvChannels} from './home-fixtures.js';
import {readRooms} from './room-divider.js';
import {readFurnishings} from './furniture-pose.js';

export const radius = .31;
const homeLots=['l106','l108'];
const validOffset=v=>Number.isFinite(v)&&Number.isInteger(v*2)&&Math.abs(v)<=1.5;
const validHistory=h=>Array.isArray(h)&&h.length<=32&&h.every(validOffset);
const emptyFront = () => ({wall:0,undo:[]});
const validFront = state => state&&validOffset(state.wall)&&validHistory(state.undo);
export const defaultLayout = () => ({wall:0,lights:true,revision:0,undo:[],homes:{},club:emptyFront(),terrace:terraceDefault()});
export function readLayout(s) {
  if(!s||!validOffset(s.wall)||!validHistory(s.undo)||typeof s.lights!=='boolean'||
    !Number.isSafeInteger(s.revision)||s.revision<0)return null;
  const homes={};
  if(s.homes!==undefined){
    if(!s.homes||typeof s.homes!=='object'||Array.isArray(s.homes))return null;
    for(const [id,state] of Object.entries(s.homes)){
      if(!homeLots.includes(id)||!state||!validOffset(state.wall))return null;
      if(id==='l108'){
        const pair=v=>Array.isArray(v)&&v.length===2&&v.every(validOffset);
        if(state.side!==undefined&&!validOffset(state.side)||!Array.isArray(state.undo)||state.undo.length>32||
          !state.undo.every(v=>validOffset(v)||pair(v)))return null;
      }else if(!validFront(state)||state.side!==undefined)return null;
      homes[id]={wall:state.wall,undo:state.undo.map(v=>Array.isArray(v)?[...v]:v)};
      if(state.side!==undefined)homes[id].side=state.side;
    }
  }
  if(s.club!==undefined&&!validFront(s.club)||s.restaurant!==undefined&&!validFront(s.restaurant))return null;
  const fixtures={};
  if(s.cutFlowerBeds!==undefined){
    const beds=s.cutFlowerBeds;
    if(!Array.isArray(beds)||beds.length>1024||beds.some(id=>typeof id!=='string'||!/^bench-r\d{1,5}-\d{1,5}$/.test(id))||
      new Set(beds).size!==beds.length)return null;
    if(beds.length)fixtures.cutFlowerBeds=[...beds];
  }
  for(const [key,max] of [['homeLights',3],['entryLights',1],['unlinkedLamps',3],['homeMeals',2],['homePaintings',24],['wallPrints',4],['homeTV',tvChannels.length-1]]){
    if(s[key]===undefined)continue;
    if(!s[key]||typeof s[key]!=='object'||Array.isArray(s[key]))return null;
    const entries=Object.entries(s[key]);
    if(entries.length>1024||entries.some(([id,value])=>!/^(?:l\d{1,5}|frontage-r\d{1,5}-\d{1,5}-[lr])$/.test(id)||
      !Number.isInteger(value)||value<1||value>max))return null;
    if(entries.length)fixtures[key]=Object.fromEntries(entries);
  }
  const terrace=readTerrace(s.terrace);if(!terrace)return null;
  const rooms=s.rooms===undefined?undefined:readRooms(s.rooms);
  if(rooms===null)return null;
  const furnishings=s.furnishings===undefined?undefined:readFurnishings(s.furnishings);
  if(furnishings===null)return null;
  return {wall:s.wall,lights:s.lights,revision:s.revision,undo:[...s.undo],homes,...fixtures,
    ...(rooms?{rooms}:{}),...(furnishings?{furnishings}:{}),
    club:s.club?{wall:s.club.wall,undo:[...s.club.undo]}:emptyFront(),terrace,
    ...(s.restaurant?{restaurant:{wall:s.restaurant.wall,undo:[...s.restaurant.undo]}}:{})};
}
export const isHome=b=>b.kind==='house'||b.kind==='cottage';
export const hasEditableFront=b=>isHome(b)||b.kind==='club'||b.kind==='restaurant';
export function wallState(layout={},b){
  if(b.cafe)return layout;
  return (isHome(b)?layout.homes?.[b.id]:layout[b.kind])??emptyFront();
}
export const frontAt=(b,layout)=>b.d/2+(hasEditableFront(b)?wallState(layout,b).wall:0);
export const sideAt=(b,layout)=>b.w/2+(b.kind==='house'?(layout?.homes?.[b.id]?.side??0):0);
export function shellBounds(b,layout){
  const side=sideAt(b,layout)-b.w/2,front=frontAt(b,layout)-b.d/2;
  return {...b,...toWorld(b,side/2,front/2),w:b.w+side,d:b.d+front,height:b.cafe?5.42:4.82};
}
const venueCells=new WeakMap(),emptyCell=[];
export function plotsForStreet(island) {
  if (island.seed !== 'petalwood' || island.presetId !== 'harborTown') return [];
  const plots=[['l106','cottage'],['l107','cafe'],['l108','house'],['l105','spa'],['l109','gym'],['l102','club'],['l104','restaurant']].map(([id,kind]) => {
    const lot = island.plan.lots.find(l => l.id === id);
    const [x,z] = polyCentroid(lot.poly), yaw = Math.PI / 2 - lot.facing;
    const b = {id,kind,road:lot.frontageRoadId,x,z,yaw,c:Math.cos(yaw),s:Math.sin(yaw),w:kind==='cafe'?9.2:6.6,d:kind==='cafe'?8.6:6.9,cafe:kind==='cafe'};
    b.y = Math.max(...[-1,1].flatMap(a => [-1,1].map(k => {const p=toWorld(b,a*b.w/2,k*b.d/2);return island.sample(p.x,p.z)})))+.14;
    b.parcel=lot.poly;return b;
  });
  const cells=new Map();
  for(const b of plots){
    // Enclose the full 1.5 m edit range and the cafe's permitted terrace.
    const reach=Math.hypot(b.w/2+2.1,b.cafe?10:b.d/2+2.1);
    for(let x=Math.floor((b.x-reach)/32);x<=Math.floor((b.x+reach)/32);x++)
      for(let z=Math.floor((b.z-reach)/32);z<=Math.floor((b.z+reach)/32);z++){
        const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(b);
      }
  }
  venueCells.set(plots,cells);return plots;
}
export const toWorld = (b,x,z) => ({x:b.x+b.c*x+b.s*z,z:b.z-b.s*x+b.c*z});
export function gardenForStreet(cafe){
  const center=toWorld(cafe,-1,36);
  return {...center,kind:'garden',id:'harbor-green',yaw:cafe.yaw,c:cafe.c,s:cafe.s,w:6.6,d:6.6,
    entry:toWorld(cafe,-1,22)};
}
export const gardenSeats=[[-1.25,.74,'sit'],[1.25,.74,'sit']];
export const toRoom = (b,p) => ({x:(p.x-b.x)*b.c-(p.z-b.z)*b.s,z:(p.x-b.x)*b.s+(p.z-b.z)*b.c});
// Walk the padded building index along a sightline, in order from the start.
export function visitSightlineCells(start,end,visit){
  const size=32,dx=end.x-start.x,dz=end.z-start.z;
  let x=Math.floor(start.x/size),z=Math.floor(start.z/size);
  const endX=Math.floor(end.x/size),endZ=Math.floor(end.z/size);
  const stepX=Math.sign(dx),stepZ=Math.sign(dz);
  const deltaX=dx?size/Math.abs(dx):Infinity,deltaZ=dz?size/Math.abs(dz):Infinity;
  let crossX=dx?((x+(dx>0?1:0))*size-start.x)/dx:Infinity;
  let crossZ=dz?((z+(dz>0?1:0))*size-start.z)/dz:Infinity;
  for(;;){
    visit(x+','+z);
    if(x===endX&&z===endZ)return;
    if(z===endZ||(x!==endX&&crossX<=crossZ)){x+=stepX;crossX+=deltaX;}
    else{z+=stepZ;crossZ+=deltaZ;}
  }
}
// Earliest intersection of the orbit boom with an oriented building. Starting
// inside is intentional for the occupied room, whose walls already cut away.
export function cameraClearance(target,eye,building,clipGable=false){
  const a=toRoom(building,target),b=toRoom(building,eye);
  let enter=0,leave=1;
  const ranges=[[a.x,b.x,-building.w/2-.14,building.w/2+.14],
    [a.z,b.z,-building.d/2-.14,building.d/2+.14],
    [target.y,eye.y,building.y-.7,building.y+(building.roofHeight??building.height)]];
  if(clipGable&&building.kind==='home'){
    const across=building.variant===0?'x':'z',width=across==='x'?building.w:building.d;
    const rise=Math.min(2.5,width*.30),slope=rise*2/(width+.65),ridge=building.y+building.height+.12+rise;
    for(const side of [-slope,slope])ranges.push([target.y+side*a[across],eye.y+side*b[across],-Infinity,ridge]);
  }
  for(const [start,end,min,max] of ranges){
    const dir=end-start;
    if(Math.abs(dir)<.00001){if(start<min||start>max)return 1;continue;}
    const u=(min-start)/dir,v=(max-start)/dir;
    enter=Math.max(enter,Math.min(u,v));leave=Math.min(leave,Math.max(u,v));
  }
  return enter>0&&enter<=leave?enter:1;
}
export const within = (p,q,d) => Math.hypot(p.x-q.x,p.z-q.z) < d;
const boxHit = (p,x,z,w,d) => Math.abs(p.x-x)<w/2+radius && Math.abs(p.z-z)<d/2+radius;
export function partitionHit(p,z,travel=0) {
  // Door centred on the room axis, with its open leaf against the right jamb.
  return (Math.abs(p.z-z)<radius+.11+travel/2 && Math.abs(p.x)<4.6+radius && Math.abs(p.x)>.95-radius) ||
    boxHit(p,1.02,z-.53,.13,1.06+travel);
}
function facadeHit(p,z,w,travel=0,right=w/2){
  return (Math.abs(p.z-z)<radius+.10+travel/2&&p.x> -w/2-radius&&p.x<right+radius&&Math.abs(p.x)>1.05-radius)||
    boxHit(p,1.035,z-.5,.12,1+travel)||
    ((Math.abs(p.x+w/2)<.09+radius||Math.abs(p.x-right)<.09+radius)&&Math.abs(p.z-z)<radius+travel/2);
}
export function wallLimit(current,wanted,occupants,b,right=b.w/2) {
  const goal=Math.max(-1.5,Math.min(1.5,Math.round(wanted*2)/2));
  if (!Number.isFinite(goal)) return {offset:current,reason:'invalid'};
  const pts=occupants.map(p=>toRoom(b,p));
  const dir=Math.sign(goal-current);
  let safe=current;
  for(let z=current+dir*.5;dir && (goal-z)*dir>=0;z+=dir*.5) {
    if(hasEditableFront(b)&&b.parcel&&[-b.w/2-.38,right+.38].some(x=>{
      const p=toWorld(b,x,b.d/2+z+.38);
      return !pointInPoly(p.x,p.z,b.parcel);
    }))return {offset:safe,reason:'parcel'};
    // A straight translation sweeps each rectangle over exactly its length plus travel.
    const middle=(safe+z)/2,travel=Math.abs(z-safe);
    if(pts.some(p=>b.cafe?partitionHit(p,middle,travel):facadeHit(p,b.d/2+middle,b.w,travel,right)))
      return {offset:safe,reason:'occupied'};
    safe=z;
  }
  return {offset:safe,reason:null};
}
// Sweep the entire moving side, including both corners. The entry stays on its original axis.
export function sideLimit(b,current,wanted,front,occupants){
  const goal=Math.max(-1.5,Math.min(1.5,Math.round(wanted*2)/2));
  const dir=Math.sign(goal-current),back=-b.d/2,points=occupants.map(p=>toRoom(b,p));
  let safe=current;
  for(let s=current+dir*.5;dir&&(goal-s)*dir>=0;s+=dir*.5){
    const right=b.w/2+s;
    if(b.parcel&&[back-.38,front+.38].some(z=>{
      const p=toWorld(b,right+.38,z);return !pointInPoly(p.x,p.z,b.parcel);
    }))return {offset:safe,reason:'parcel'};
    // Leave the kitchen, sofa and both seat approaches usable.
    if(right<2.30)return {offset:safe,reason:'furniture'};
    if(points.some(p=>boxHit(p,b.w/2+(safe+s)/2,(back+front)/2,.18+Math.abs(s-safe),front-back+.18)))
      return {offset:safe,reason:'occupied'};
    safe=s;
  }
  return {offset:safe,reason:null};
}
export function legalWall(current,wanted,occupants,b){
  return wallLimit(current,wanted,occupants,b).offset;
}
export function floorAt(island,plots,x,z,layout={}) {
  const home=homeAt(island,{x,z},.16);if(home)return home.y;
  for (const b of plots) {
    const p=toRoom(b,{x,z});
    if(p.x>=-b.w/2-.15&&p.x<=sideAt(b,layout)+.15 && p.z>=-b.d/2-.15 && p.z<=frontAt(b,layout)+.15) return b.y;
  }
  return island.deckHeight?.(x,z)??island.sample(x,z);
}
export function walkCell(island,plots,x,z){
  const key=x+','+z,venues=venueCells.get(plots);
  return {venues:venues?(venues.get(key)||emptyCell):plots,homes:island.homeCells?.get(key)||emptyCell,
    footprints:island.footprintCells?.get(key)||emptyCell};
}
export function walkable(island,plots,layout,pos,cell) {
  if (Math.abs(pos.x)>island.half-1 || Math.abs(pos.z)>island.half-1) return false;
  cell??=walkCell(island,plots,Math.floor(pos.x/32),Math.floor(pos.z/32));
  for (const b of cell.venues) {
    const p=toRoom(b,pos), hw=b.w/2,hd=b.d/2;
    if(b.cafe&&p.z>hd&&layout.terrace?.tables.some(t=>Math.hypot(t.x-p.x,t.z-p.z)<.48+radius))return false;
    const front=frontAt(b,layout),right=sideAt(b,layout),center=(front-hd)/2;
    if(p.x< -hw-.55||p.x>right+.55 || p.z< -hd-.55 || p.z>front+.55) continue;
    if(boxHit(p,-hw,center,.18,hd+front)||boxHit(p,right,center,.18,hd+front)||boxHit(p,(right-hw)/2,-hd,hw+right,.18)) return false;
    if(hasEditableFront(b)?facadeHit(p,front,b.w,0,right):(Math.abs(p.z-front)<radius+.1&&Math.abs(p.x)>1.05-radius&&Math.abs(p.x)<hw+radius))return false;
    if(b.cafe) {
      if(partitionHit(p,layout.wall) || boxHit(p,-2.95,2.76,1.6,1.05) ||
        boxHit(p,2.95,2.76,1.6,1.05) || boxHit(p,0,-3.14,5,.8)) return false;
    }
    if(b.kind==='gym' && [-1.52,1.52].some(x=>boxHit(p,x,-.85,1.48,2.2)))return false;
    if(b.kind==='spa' && (boxHit(p,-1.65,-1.28,1.8,2.65)||boxHit(p,1.25,-2.1,2.4,.84)))return false;
    if(isHome(b)&&(boxHit(p,-1.65,-1.74,1.24,2.24)||boxHit(p,1.38,-.94,.9,.9)||
      boxHit(p,.15,-3.06,2.65,.65)||boxHit(p,-.78,-1.85,.12,3.13)))return false;
    if(b.kind==='club' && [-1.7,1.7].some(x=>boxHit(p,x,-2,1.8,.74)))return false;
    if(b.kind==='restaurant' && (boxHit(p,0,-2.8,4.9,.72)||[-1.65,1.65].some(x=>boxHit(p,x,-.3,1.15,.85))))return false;
    return true;
  }
  for(const b of cell.footprints)if(boxHit(toRoom(b,pos),0,0,b.w,b.d))return false;
  let indoors=false;
  for(const b of cell.homes){
    if(Math.abs(pos.x-b.x)>b.collisionHalfX||Math.abs(pos.z-b.z)>b.collisionHalfZ)continue;
    const q=homeLocal(b,pos);
    if(homeWalkableLocal(b,q)===false)return false;
    if(Math.abs(q.x)<b.w/2&&Math.abs(q.z)<b.d/2)indoors=true;
  }
  if(indoors)return true;
  const h=island.sample(pos.x,pos.z);
  if(island.deckHeight && island.deckHeight(pos.x,pos.z)>h+.04)return true;
  return h>Math.max(.12,island.waterAt(pos.x,pos.z)-.05) && island.slope(pos.x,pos.z)<.95;
}
export function moveWalker(island,plots,layout,actor,input,dt) {
  const mag=Math.hypot(input.x,input.z);
  if(!mag) return;
  const d=Math.min(dt,.15)*4.3/Math.max(1,mag), vx=input.x*d,vz=input.z*d;
  const steps=Math.max(1,Math.ceil(Math.hypot(vx,vz)/.15));
  for(let i=0;i<steps;i++) {
    const x=actor.x+vx/steps,z=actor.z+vz/steps;
    if(walkable(island,plots,layout,{x,z})){actor.x=x;actor.z=z;continue;}
    if(walkable(island,plots,layout,{x,z:actor.z})) actor.x=x;
    if(walkable(island,plots,layout,{x:actor.x,z})) actor.z=z;
  }
  actor.yaw=Math.atan2(input.x,input.z);
}
