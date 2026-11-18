export const furnishings=Object.freeze({sofa:'Sofa',bed:'Bed',desk:'Writing desk',nightstand:'Bedside table',dining:'Dining set',rug:'Rug'});
export const originalPose=Object.freeze([0,0,0]);
export const samePose=(a=originalPose,b=originalPose)=>a.every((n,i)=>n===b[i]);
const lot=id=>typeof id==='string'&&/^(?:l\d{1,5}|frontage-r\d{1,5}-\d{1,5}-[lr])$/.test(id);
export const validPose=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isInteger)&&
  Math.abs(p[0])<=64&&Math.abs(p[1])<=64&&p[2]>=0&&p[2]<=3;
export function readFurnishings(data){
  if(data?.v!==1||!data.lots||typeof data.lots!=='object'||Array.isArray(data.lots))return null;
  const entries=Object.entries(data.lots);
  if(entries.length>1024)return null;
  const lots={};
  for(const [id,items] of entries){
    if(!lot(id)||!items||typeof items!=='object'||Array.isArray(items))return null;
    const copy={};
    for(const [item,pose] of Object.entries(items)){
      if(!Object.hasOwn(furnishings,item)||!validPose(pose))return null;
      if(!samePose(pose))copy[item]=[...pose];
    }
    if(Object.keys(copy).length)lots[id]=copy;
  }
  const last=data.last;
  if(last!==undefined&&(!Array.isArray(last)||last.length!==3||!lot(last[0])||
    typeof last[1]!=='string'||!Object.hasOwn(furnishings,last[1])||!validPose(last[2])))return null;
  return {v:1,lots,...(last?{last:[last[0],last[1],[...last[2]]]}:{})};
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
