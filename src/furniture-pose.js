export const furnishings=Object.freeze({sofa:'Sofa',bed:'Bed',desk:'Writing desk',nightstand:'Bedside table',dining:'Dining set',rug:'Rug'});
export const catalog=Object.freeze({
  'armchair-1':{name:'Teal club chair',type:'armchair',slot:0,w:.98,d:.94,color:'#397b78'},
  'armchair-2':{name:'Rose club chair',type:'armchair',slot:1,w:.98,d:.94,color:'#ae6762'},
  'easel-1':{name:'Harbor easel',type:'easel',slot:2,w:.89,d:.58,subject:'Harbor at dawn'},
  'easel-2':{name:'Garden easel',type:'easel',slot:3,w:.89,d:.58,subject:'Poppies by the path'}
});
export function catalogItem(id){
  return Object.hasOwn(catalog,id)?{...catalog[id],id,x:0,z:0,solid:true}:null;
}
export const furnitureName=id=>catalog[id]?.name||furnishings[id];
export const storedPose=(items,id)=>items?.[id]??(Object.hasOwn(catalog,id)?null:originalPose);
export const originalPose=Object.freeze([0,0,0]);
export const samePose=(a=originalPose,b=originalPose)=>a===b||!!a&&!!b&&a.every((n,i)=>n===b[i]);
const lot=id=>typeof id==='string'&&/^(?:l\d{1,5}|frontage-r\d{1,5}-\d{1,5}-[lr])$/.test(id);
export const validPose=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isInteger)&&
  Math.abs(p[0])<=64&&Math.abs(p[1])<=64&&p[2]>=0&&p[2]<=3;
function readItems(data){
  if(data?.v!==1||!data.lots||typeof data.lots!=='object'||Array.isArray(data.lots))return null;
  const entries=Object.entries(data.lots);
  if(entries.length>1024)return null;
  const lots={};
  for(const [id,items] of entries){
    if(!lot(id)||!items||typeof items!=='object'||Array.isArray(items))return null;
    const copy={};
    for(const [item,pose] of Object.entries(items)){
      const added=Object.hasOwn(catalog,item);
      if(!(added||Object.hasOwn(furnishings,item))||!validPose(pose))return null;
      if(added||!samePose(pose))copy[item]=[...pose];
    }
    if(Object.keys(copy).length)lots[id]=copy;
  }
  const last=data.last;
  if(last!==undefined&&(!Array.isArray(last)||last.length!==3||!lot(last[0])||
    typeof last[1]!=='string'||!(Object.hasOwn(furnishings,last[1])||Object.hasOwn(catalog,last[1]))||
    !(validPose(last[2])||last[2]===null&&Object.hasOwn(catalog,last[1]))))return null;
  return {v:1,lots,...(last?{last:[last[0],last[1],last[2]&&[...last[2]]]}:{})};
}
// Older towns understand generated furniture. Keep the added pieces in an
// optional field on the wire, so an older guest can still join the same lobby.
const wireCache=new WeakMap();
export function wireFurnishings(state){
  if(wireCache.has(state))return wireCache.get(state);
  const base={v:1,lots:{}},studio={v:1,lots:{}};
  for(const [id,items] of Object.entries(state.lots))for(const [item,pose] of Object.entries(items)){
    const group=Object.hasOwn(catalog,item)?studio:base;
    (group.lots[id]??={})[item]=pose;
  }
  if(state.last)(Object.hasOwn(catalog,state.last[1])?studio:base).last=state.last;
  if(studio.last||Object.keys(studio.lots).length)base.studio=studio;
  wireCache.set(state,base);return base;
}
export function readFurnishings(data){
  const base=readItems(data);
  if(!base||data.studio===undefined)return base;
  const studio=readItems(data.studio);
  if(!studio||base.last&&studio.last||studio.last&&!Object.hasOwn(catalog,studio.last[1]))return null;
  for(const [id,items] of Object.entries(studio.lots)){
    if(Object.keys(items).some(item=>!Object.hasOwn(catalog,item)||Object.hasOwn(base.lots[id]||{},item)))return null;
    base.lots[id]={...base.lots[id],...items};
  }
  if(studio.last)base.last=studio.last;
  return Object.keys(base.lots).length<=1024?base:null;
}
const cos=[1,0,-1,0],sin=[0,1,0,-1];
export function placeItem(item,pose=originalPose){
  return {...item,x:item.x+pose[0]/4,z:item.z+pose[1]/4,turn:pose[2]};
}
export function footprint(f){
  return f.turn%2?{...f,w:f.d,d:f.w}:f;
}
export function relativePoint(p,source,placed){
  const x=p.x-source.x,z=p.z-source.z,t=placed.turn||0;
  return {...p,x:placed.x+cos[t]*x+sin[t]*z,z:placed.z-sin[t]*x+cos[t]*z,
    ...(p.yaw!==undefined?{yaw:p.yaw+t*Math.PI/2}:{})};
}
export function supportFor(use){
  if(use.object==='sofa-end')return 'sofa';
  if(use.object.startsWith('chair-'))return 'dining';
  if(use.lamp)return use.lamp;
  return use.object;
}
