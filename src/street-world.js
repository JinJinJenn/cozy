// The first street sits on actual Harbor Town plots. Coordinates in each
// house are metres, with its street entrance on the positive Z side.
import {pointInPoly,polyCentroid} from '../packages/settlement/src/geom.js';

export const radius = .31;
const homeLots=['l106','l108'];
const validOffset=v=>Number.isFinite(v)&&Number.isInteger(v*2)&&Math.abs(v)<=1.5;
const validHistory=h=>Array.isArray(h)&&h.length<=32&&h.every(validOffset);
const emptyFront = () => ({wall:0,undo:[]});
const validFront = state => state&&validOffset(state.wall)&&validHistory(state.undo);
export const defaultLayout = () => ({wall:0,lights:true,revision:0,undo:[],homes:{},club:emptyFront()});
export function readLayout(s) {
  if(!s||!validOffset(s.wall)||!validHistory(s.undo)||typeof s.lights!=='boolean'||
    !Number.isSafeInteger(s.revision)||s.revision<0)return null;
  const homes={};
  if(s.homes!==undefined){
    if(!s.homes||typeof s.homes!=='object'||Array.isArray(s.homes))return null;
    for(const [id,state] of Object.entries(s.homes)){
      if(!homeLots.includes(id)||!validFront(state))return null;
      homes[id]={wall:state.wall,undo:[...state.undo]};
    }
  }
  if(s.club!==undefined&&!validFront(s.club))return null;
  return {wall:s.wall,lights:s.lights,revision:s.revision,undo:[...s.undo],homes,
    club:s.club?{wall:s.club.wall,undo:[...s.club.undo]}:emptyFront()};
}
export const isHome=b=>b.kind==='house'||b.kind==='cottage';
export const hasEditableFront=b=>isHome(b)||b.kind==='club';
export function wallState(layout={},b){
  if(b.cafe)return layout;
  return (b.kind==='club'?layout.club:layout.homes?.[b.id])??emptyFront();
}
export const frontAt=(b,layout)=>b.d/2+(hasEditableFront(b)?wallState(layout,b).wall:0);
export function plotsForStreet(island) {
  if (island.seed !== 'petalwood' || island.presetId !== 'harborTown') return [];
  return [['l106','cottage'],['l107','cafe'],['l108','house'],['l105','spa'],['l109','gym'],['l102','club'],['l104','restaurant']].map(([id,kind]) => {
    const lot = island.plan.lots.find(l => l.id === id);
    const [x,z] = polyCentroid(lot.poly), yaw = Math.PI / 2 - lot.facing;
    const b = {id,kind,road:lot.frontageRoadId,x,z,yaw,c:Math.cos(yaw),s:Math.sin(yaw),w:kind==='cafe'?9.2:6.6,d:kind==='cafe'?8.6:6.9,cafe:kind==='cafe'};
    b.y = Math.max(...[-1,1].flatMap(a => [-1,1].map(k => {const p=toWorld(b,a*b.w/2,k*b.d/2);return island.sample(p.x,p.z)})))+.14;
    b.parcel=lot.poly;return b;
  });
}
export const toWorld = (b,x,z) => ({x:b.x+b.c*x+b.s*z,z:b.z-b.s*x+b.c*z});
export const toRoom = (b,p) => ({x:(p.x-b.x)*b.c-(p.z-b.z)*b.s,z:(p.x-b.x)*b.s+(p.z-b.z)*b.c});
export const within = (p,q,d) => Math.hypot(p.x-q.x,p.z-q.z) < d;
const boxHit = (p,x,z,w,d) => Math.abs(p.x-x)<w/2+radius && Math.abs(p.z-z)<d/2+radius;
export function partitionHit(p,z) {
  // Door centred on the room axis, with its open leaf against the right jamb.
  return (Math.abs(p.z-z)<radius+.11 && Math.abs(p.x)<4.6+radius && Math.abs(p.x)>.95-radius) ||
    boxHit(p,1.02,z-.53,.13,1.06);
}
function facadeHit(p,z,w){
  return (Math.abs(p.z-z)<radius+.10&&Math.abs(p.x)<w/2+radius&&Math.abs(p.x)>1.05-radius)||
    boxHit(p,1.035,z-.5,.12,1);
}
export function legalWall(current,wanted,occupants,b) {
  const goal=Math.max(-1.5,Math.min(1.5,Math.round(wanted*2)/2));
  if (!Number.isFinite(goal)) return current;
  const pts=occupants.map(p=>toRoom(b,p));
  const dir=Math.sign(goal-current);
  let safe=current;
  for(let z=current+dir*.5;dir && (goal-z)*dir>=0;z+=dir*.5) {
    // Sweep the whole thickness, so a long drag cannot skip a person.
    if(hasEditableFront(b)&&b.parcel&&[-1,1].some(side=>{
      const p=toWorld(b,side*(b.w/2+.38),b.d/2+z+.38);
      return !pointInPoly(p.x,p.z,b.parcel);
    }))break;
    if([.25,.5,.75,1].some(t=>{const offset=safe+t*(z-safe);
      return pts.some(p=>b.cafe?partitionHit(p,offset):facadeHit(p,b.d/2+offset,b.w));
    }))break;
    safe=z;
  }
  return safe;
}
export function floorAt(island,plots,x,z,layout={}) {
  for (const b of plots) {
    const p=toRoom(b,{x,z});
    if(Math.abs(p.x)<=b.w/2+.15 && p.z>=-b.d/2-.15 && p.z<=frontAt(b,layout)+.15) return b.y;
  }
  return island.deckHeight?.(x,z)??island.sample(x,z);
}
export function walkable(island,plots,layout,pos) {
  if (Math.abs(pos.x)>island.half-1 || Math.abs(pos.z)>island.half-1) return false;
  for (const b of plots) {
    const p=toRoom(b,pos), hw=b.w/2,hd=b.d/2;
    const front=frontAt(b,layout),center=(front-hd)/2;
    if(Math.abs(p.x)>hw+.55 || p.z< -hd-.55 || p.z>front+.55) continue;
    if(boxHit(p,-hw,center,.18,hd+front)||boxHit(p,hw,center,.18,hd+front)||boxHit(p,0,-hd,b.w,.18)) return false;
    if(hasEditableFront(b)?facadeHit(p,front,b.w):(Math.abs(p.z-front)<radius+.1&&Math.abs(p.x)>1.05-radius&&Math.abs(p.x)<hw+radius))return false;
    if(b.cafe) {
      if(partitionHit(p,layout.wall) || boxHit(p,-2.95,2.76,1.6,1.05) ||
        boxHit(p,2.95,2.76,1.6,1.05) || boxHit(p,0,-3.14,5,.8)) return false;
    }
    if(b.kind==='gym' && [-1.52,1.52].some(x=>boxHit(p,x,-.85,1.48,2.2)))return false;
    if(b.kind==='spa' && (boxHit(p,-1.65,-1.28,1.8,2.65)||boxHit(p,1.25,-2.1,2.4,.84)))return false;
    if(isHome(b)&&(boxHit(p,-1.65,-1.74,1.24,2.24)||boxHit(p,1.38,-.94,.9,.9)||
      boxHit(p,.15,-3.06,2.65,.65)||boxHit(p,-.78,-1.85,.12,3.13)))return false;
    if(b.kind==='club' && [-1.7,1.7].some(x=>boxHit(p,x,-2,1.8,.74)))return false;
    if(b.kind==='restaurant' && [-1.65,1.65].some(x=>boxHit(p,x,-.3,1.15,.85)))return false;
    return true;
  }
  const nearby=island.footprintCells?.get(Math.floor(pos.x/32)+','+Math.floor(pos.z/32))||[];
  if(nearby.some(b=>boxHit(toRoom(b,pos),0,0,b.w,b.d)))return false;
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
    if(walkable(island,plots,layout,{x,z:actor.z})) actor.x=x;
    if(walkable(island,plots,layout,{x:actor.x,z})) actor.z=z;
  }
  actor.yaw=Math.atan2(input.x,input.z);
}
