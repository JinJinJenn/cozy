import {homeLocal,homeWorld,homeWalkableLocal} from './home-plan.js';
import {dividerLimit,dividerParts,sameDivider} from './room-divider.js';
import {televisionIn} from './home-fixtures.js';
import {footprint,originalPose,placeItem,relativePoint,samePose,supportFor} from './furniture-pose.js';
import {routeOnGrid} from './walk-grid.js';

const overlaps=(a,b,pad=0)=>Math.abs(a.x-b.x)<(a.w+b.w)/2+pad&&Math.abs(a.z-b.z)<(a.d+b.d)/2+pad;
const sameItems=(a={},b={})=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(id=>samePose(a[id],b[id]));
export function editedItems(items,id,pose){
  const next={...items};
  if(samePose(pose,originalPose))delete next[id];else next[id]=[...pose];
  return next;
}
function candidate(home,items,divider){
  const originals=home.generatedFurniture||home.furniture,baseUses=home.generatedUses||home.uses;
  const furniture=originals.map(f=>items[f.id]?placeItem(f,items[f.id]):f);
  const uses=baseUses.map(u=>{
    const support=supportFor(u);
    if(!items[support])return u;
    const from=originals.find(f=>f.id===support),to=furniture.find(f=>f.id===support);
    const move=p=>relativePoint(p,from,to),result=move(u);
    if(u.pose)result.pose=move(u.pose);
    if(u.target&&u.action!=='watch'&&u.action!=='read')result.target=move(u.target);
    if(u.action==='watch'){
      const tv=televisionIn(home);
      result.yaw=home.yaw+Math.atan2(tv.x-result.x,tv.z-result.z);
    }
    return result;
  });
  const walls=home.walls.filter(w=>!w.divider).concat(dividerParts(home,divider));
  return {id:home.id,x:home.x,z:home.z,yaw:home.yaw,c:home.c,s:home.s,w:home.w,d:home.d,inside:home.inside,
    furniture,uses,walls,generatedFurniture:originals,generatedUses:baseUses,divider};
}
function allowed(h,p){
  const q=homeLocal(h,p);
  return Math.abs(q.x)<h.w/2&&Math.abs(q.z)<h.d/2&&homeWalkableLocal(h,q)===true;
}
function fit(h,items){
  const set=televisionIn(h),tv={...set,w:.32,d:1.69};
  for(const id of Object.keys(items)){
    const item=h.furniture.find(f=>f.id===id);
    if(!item)return 'This item does not belong to this house.';
    const box=footprint(item);
    if(Math.abs(box.x)+box.w/2>h.w/2-.08||Math.abs(box.z)+box.d/2>h.d/2-.08)
      return 'Keep the whole item inside the room.';
    if(h.walls.some(w=>overlaps(box,w,.015))||item.solid&&overlaps(box,tv))return 'Leave space beside walls and fixtures.';
    if(item.solid&&h.furniture.some(f=>f.id!==id&&f.solid&&overlaps(box,footprint(f),.015)))return 'Another piece of furniture occupies this spot.';
  }
  const door=homeWorld(h,0,h.d/2-.25),walk=p=>allowed(h,p);
  if(!walk(h.inside)||!routeOnGrid(walk,h.inside,door))return 'Keep the front door clear.';
  const visited=new Set();
  for(const u of h.uses){
    const key=u.x+','+u.z;if(visited.has(key))continue;visited.add(key);
    if(!routeOnGrid(walk,h.inside,homeWorld(h,u.x,u.z)))return 'Leave a walking route to every activity.';
  }
  return '';
}
export function planInterior(home,items={},divider=null){
  if(Object.keys(items).some(id=>!(home.generatedFurniture||home.furniture).some(f=>f.id===id)))return {reason:'This furniture is unavailable in this house.'};
  const next=candidate(home,items,divider);
  const reason=(Object.keys(items).length?fit(next,items):'')||(divider?dividerLimit(next,divider):'');
  return {next,reason};
}
export function occupantLimit(home,next,item,people,checkRoutes=false){
  const moved=footprint(next.furniture.find(f=>f.id===item));
  for(const person of people){
    const p=homeLocal(next,person);
    if(moved.solid&&overlaps(moved,{...p,w:0,d:0},.34))return 'Someone is standing here or has reserved this spot.';
    if(checkRoutes&&allowed(home,person)&&!routeOnGrid(q=>allowed(next,q),next.inside,person))return 'Leave a way to the door for everyone inside.';
  }
  return '';
}
export function installFurniture(home,items,next){
  const changed=!sameItems(home.placements,items);
  if(changed){
    home.generatedFurniture=next.generatedFurniture;home.generatedUses=next.generatedUses;
    home.furniture=next.furniture;home.placedUses=next.uses;home.placements=items;
    home.furnishingRevision=(home.furnishingRevision||0)+1;
  }
  home.walls=next.walls;home.divider=next.divider;
}
// Validate the final floor plan together. A divider and a desk can both
// move between successive snapshots, with no legal intermediate layout.
export function syncInteriors(island,oldLayout,layout,preview=false){
  const lots=layout.furnishings?.lots||{},walls=layout.rooms?.lots||{};
  const ids=new Set([...Object.keys(oldLayout?.furnishings?.lots||{}),...Object.keys(oldLayout?.rooms?.lots||{}),...Object.keys(lots),...Object.keys(walls)]);
  const changes=[];
  for(const id of ids){
    const home=island.homesById?.get(id);if(!home)return false;
    const items=lots[id]||{},divider=walls[id]??null;
    if(sameItems(home.placements,items)&&sameDivider(home.divider??null,divider))continue;
    const {next,reason}=planInterior(home,items,divider);if(reason)return false;
    changes.push([home,items,next]);
  }
  if(!preview)for(const change of changes)installFurniture(...change);
  return true;
}
