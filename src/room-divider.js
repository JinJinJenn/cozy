import {homeLocal,homeWorld,homeWalkableLocal} from './home-plan.js';
import {routeOnGrid} from './walk-grid.js';
import {televisionIn} from './home-fixtures.js';
import {footprint} from './furniture-pose.js';

// A v1 divider spans the room. The three integers encode orientation, wall
// offset and doorway offset in half metres, all relative to the original lot.
export const validDivider=v=>Array.isArray(v)&&v.length===3&&[0,1].includes(v[0])&&
  v.slice(1).every(n=>Number.isInteger(n)&&Math.abs(n)<=12);
export const sameDivider=(a,b)=>a===b||!!a&&!!b&&a.every((n,i)=>n===b[i]);
const lotId=id=>typeof id==='string'&&/^(?:l\d{1,5}|frontage-r\d{1,5}-\d{1,5}-[lr])$/.test(id);
export function readRooms(rooms){
  if(!rooms||rooms.v!==1||!rooms.lots||typeof rooms.lots!=='object'||Array.isArray(rooms.lots))return null;
  const entries=Object.entries(rooms.lots);
  if(entries.length>1024||entries.some(([id,v])=>!lotId(id)||!validDivider(v)))return null;
  const last=rooms.last;
  if(last!==undefined&&(!Array.isArray(last)||last.length!==2||!lotId(last[0])||last[1]!==null&&!validDivider(last[1])))return null;
  return {v:1,lots:Object.fromEntries(entries),...(last?{last}: {})};
}
const span=(home,turn)=>turn?home.d:home.w;
const along=(turn,a,n)=>turn?{x:n,z:a}:{x:a,z:n};
export function dividerParts(home,plan){
  if(!plan)return [];
  const [turn,line,center]=plan,half=span(home,turn)/2-.08;
  return [[-half,center/2-.83],[center/2+.83,half]].map(([lo,hi])=>({
    side:'inside',divider:true,...along(turn,(lo+hi)/2,line/2),w:turn?.14:hi-lo,d:turn?hi-lo:.14
  }));
}
const overlap=(a,b,pad)=>Math.abs(a.x-b.x)<(a.w+b.w)/2+pad&&Math.abs(a.z-b.z)<(a.d+b.d)/2+pad;
const touches=(panels,p,r)=>panels.some(panel=>overlap(panel,{...p,w:0,d:0},r));
const checks=new WeakMap();
function interiorPath(home,walls){
  const candidate={w:home.w,d:home.d,walls,furniture:home.furniture};
  return p=>{
    const q=homeLocal(home,p);
    return Math.abs(q.x)<home.w/2&&Math.abs(q.z)<home.d/2&&homeWalkableLocal(candidate,q);
  };
}
function fit(home,plan){
  const [turn,line,center]=plan;
  if(Math.abs(line/2)>span(home,1-turn)/2-1.15||Math.abs(center/2)>span(home,turn)/2-1.16)return 'Leave room beside the doorway and on both sides of the wall.';
  const panels=dividerParts(home,plan),fixed=home.walls.filter(w=>w.side==='inside'&&!w.divider);
  const tv=televisionIn(home),fixtures=[...fixed,{...tv,w:.30,d:1.67},...home.furniture.filter(f=>f.type!=='rug'&&f.type!=='tile').map(footprint)];
  if(panels.some(p=>fixtures.some(f=>overlap(p,f,.08))))return 'The divider would cut through a fixture or an existing wall.';
  const walls=home.walls.filter(w=>!w.divider).concat(panels);
  const allowed=interiorPath(home,walls);
  const probes=[homeWorld(home,0,home.d/2-.25),...home.uses.map(u=>homeWorld(home,u.x,u.z)),
    ...[-.55,.55].map(d=>{const p=along(turn,center/2,line/2+d);return homeWorld(home,p.x,p.z);})];
  const unique=new Set();
  for(const p of probes){
    const key=p.x+','+p.z;if(unique.has(key))continue;unique.add(key);
    if(!allowed(home.inside)||!allowed(p)||!routeOnGrid(allowed,home.inside,p))return 'Keep the entrance, doorway and furniture approaches connected.';
  }
  for(const u of home.uses)if(u.pose&&touches(panels,u.pose,.31))return 'Leave space for someone using the furniture.';
  return '';
}
export function dividerLimit(home,plan,people=[],checkOccupantRoutes=false){
  if(plan===null)return '';
  if(!validDivider(plan))return 'Choose a valid wall and doorway position.';
  let cache=checks.get(home);if(!cache){cache=new Map();checks.set(home,cache);}
  const key=(home.furnishingRevision||0)+'/'+plan.join(',');
  if(!cache.has(key)){if(cache.size>=512)cache.clear();cache.set(key,fit(home,plan));}
  const limit=cache.get(key);if(limit)return limit;
  const panels=dividerParts(home,plan);
  if(people.some(p=>touches(panels,homeLocal(home,p),.36)))return 'Someone is standing here or has reserved this spot.';
  if(checkOccupantRoutes){
    // A seated pose can be on solid furniture. Its separate exit appears in
    // people as well. For walkers and reserved arrivals, preserve a way out.
    const before=interiorPath(home,home.walls),after=interiorPath(home,home.walls.filter(w=>!w.divider).concat(panels));
    if(people.some(p=>before(p)&&!routeOnGrid(after,home.inside,p)))return 'Leave a walking route for everyone in the room.';
  }
  return '';
}
// Geometry and cached activity indices share their original lot object.
// Freeze the generated approaches before overlaying any saved architecture.
export function applyRoomPlans(island,oldLots={},newLots={}){
  for(const id of new Set([...Object.keys(oldLots),...Object.keys(newLots)])){
    const home=island.homesById?.get(id),next=newLots[id]??null;
    if(!home||sameDivider(home.divider??null,next))continue;
    if(next&&dividerLimit(home,next))continue;
    home.walls=home.walls.filter(w=>!w.divider).concat(dividerParts(home,next));
    home.divider=next;
  }
}
