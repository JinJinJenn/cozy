const halfStep=n=>Number.isFinite(n)&&Number.isInteger(n*2);
export const maxTables=4;
export const terraceDefault=()=>({tables:[{id:0,x:-3,z:6.5,turn:1}],undo:[]});
export const chairs=[[0,-.97,'sit'],[0,.97,'sit']];
export function tableFeet(t){
  const side=t.turn===1;
  return [{x:t.x,z:t.z,r:.55},...chairs.map(([,d])=>({x:t.x+(side?d:0),z:t.z+(side?0:d),r:.34}))];
}
function validId(n){return Number.isInteger(n)&&n>=0&&n<maxTables;}
function validPose(t){return t&&validId(t.id)&&halfStep(t.x)&&Math.abs(t.x)<=5&&halfStep(t.z)&&t.z>=5&&t.z<=9&&(t.turn===0||t.turn===1);}
const pose=({id,x,z,turn})=>({id,x,z,turn});
export function readTerrace(v){
  if(v===undefined)return terraceDefault();
  if(!v||!Array.isArray(v.tables)||v.tables.length>maxTables||!Array.isArray(v.undo)||v.undo.length>16)return null;
  if(v.tables.some(t=>!validPose(t))||new Set(v.tables.map(t=>t.id)).size!==v.tables.length)return null;
  if(v.tables.some(t=>tableFit(t,v.tables))||v.undo.some(e=>!e||!validId(e.id)||e.before!==null&&(!validPose(e.before)||e.before.id!==e.id)))return null;
  return {tables:v.tables.map(pose),undo:v.undo.map(e=>({id:e.id,before:e.before&&pose(e.before)}))};
}
export function tableFit(t,tables){
  if(!validPose(t))return 'Keep the table on the café terrace.';
  const feet=tableFeet(t);
  for(const p of feet){
    if(p.z-p.r<4.95||p.z+p.r>8.85||Math.abs(p.x)+p.r>5.0)return 'Keep both chairs on the terrace.';
    if(Math.abs(p.x)-p.r<1.08)return 'Leave the café doorway clear.';
    for(const [x,z,r] of [[2.84,6.4,.48],[3.48,5.29,.74],[-4.08,4.88,.42],[4.08,4.88,.42]])
      if(Math.hypot(p.x-x,p.z-z)<p.r+r+.08)return 'Leave some room by the planter or menu board.';
  }
  for(const other of tables){
    if(other.id===t.id)continue;
    if(tableFeet(other).some(q=>feet.some(p=>Math.hypot(p.x-q.x,p.z-q.z)<p.r+q.r+.27)))return 'That table is too close to another one.';
  }
  return '';
}
