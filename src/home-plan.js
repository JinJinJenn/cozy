import {polyCentroid,pointInPoly,distSeg} from '../packages/settlement/src/geom.js';
import {rng} from '../packages/island-gen/src/rng.js';
import {routeOnGrid} from './walk-grid.js';

export const homeWorld=(b,x,z)=>({x:b.x+b.c*x+b.s*z,z:b.z-b.s*x+b.c*z});
export const homeLocal=(b,p)=>({x:(p.x-b.x)*b.c-(p.z-b.z)*b.s,z:(p.x-b.x)*b.s+(p.z-b.z)*b.c});
const hit=(p,r,margin=.31)=>Math.abs(p.x-r.x)<r.w/2+margin&&Math.abs(p.z-r.z)<r.d/2+margin;
export function homesNear(island,p){return island.homeCells?.get(Math.floor(p.x/32)+','+Math.floor(p.z/32))||[];}
export function homeAt(island,p,margin=0){return homesNear(island,p).find(b=>{const q=homeLocal(b,p);return Math.abs(q.x)<b.w/2+margin&&Math.abs(q.z)<b.d/2+margin;});}
export function homeWalkable(b,p){
  const q=homeLocal(b,p),hw=b.w/2,hd=b.d/2;
  if(Math.abs(q.x)>hw+.6||Math.abs(q.z)>hd+.6)return null;
  return !b.walls.some(r=>hit(q,r))&&!b.furniture.some(r=>r.solid&&(r.type==='sofa'?
    hit(q,{x:r.x+(r.flip?1:-1)*r.w*.42,z:r.z,w:.12,d:r.d})||[-1,1].some(s=>hit(q,{x:r.x,z:r.z+s*(r.d/2-.05),w:r.w,d:.10})):hit(q,r)));
}
// A use point is walkable; a pose may be on solid furniture. Never route a
// walker to the centre of a bed or counter, and keep the exit point with the use.
function usesFor(b){
  const sofa=b.furniture.find(f=>f.type==='sofa');
  const uses=[{...b.seats[0],object:'sofa',label:'Sit on the sofa',target:{x:sofa.x,z:sofa.z,y:.65}}];
  const kinds={bed:['rest','Rest on the bed'],kitchen:['cook','Cook a meal'],shelf:['read','Read a book'],desk:['write','Write at the desk'],
    shower:['shower','Take a shower'],toilet:['bathroom','Use the bathroom'],basin:['wash','Wash your hands'],dining:['eat','Have a meal'],rug:['stretch','Stretch on the rug']};
  for(const f of b.furniture){
    if(!kinds[f.type])continue;
    if(f.type==='shelf'){
      uses.push({...b.seats[0],object:'sofa',action:'read',label:'Read a book on the sofa',target:{x:f.x,z:f.z,y:1.9}});continue;
    }
    const candidates=f.type==='rug'?[{x:f.x,z:f.z}]:[.4,.65,.9,1.2].flatMap(gap=>[
      {x:f.x-f.w/2-gap,z:f.z},{x:f.x+f.w/2+gap,z:f.z},
      {x:f.x,z:f.z+f.d/2+gap},{x:f.x,z:f.z-f.d/2-gap}]);
    const allowed=p=>{const q=homeLocal(b,p);return Math.abs(q.x)<b.w/2&&Math.abs(q.z)<b.d/2&&homeWalkable(b,p);};
    const point=candidates.find(p=>{const q=homeWorld(b,p.x,p.z);return allowed(q)&&routeOnGrid(allowed,b.inside,q);});
    if(!point)continue;
    const [action,label]=kinds[f.type];
    const use={...point,object:f.id,action,label,target:{x:f.x,z:f.z,y:f.type==='shelf'?1:.65},yaw:b.yaw+Math.atan2(f.x-point.x,f.z-point.z)};
    if(action==='rest')use.pose={x:f.x,z:f.z+f.d/2-.15,yaw:b.yaw,height:.82,scale:1};
    if(action==='bathroom')use.pose={x:f.x,z:f.z+.08,yaw:b.yaw};
    if(action==='eat')use.pose={x:f.x,z:f.z+.72,yaw:b.yaw+Math.PI};
    uses.push(use);
    if(f.type==='kitchen')uses.push({...use,action:'wash',label:'Wash up at the sink',target:{x:f.x,z:f.z-f.d*.24,y:1.1}});
  }
  return uses;
}
export function prepareHomes(island,exclude=[]){
  const skip=new Set(exclude.map(b=>b.id)),homes=[],cells=new Map();
  const roadMap=new Map(island.plan.roads.map(r=>[r.id,r]));
  for(const l of island.plan.lots){
    if(!l.buildable||skip.has(l.id)||['square','hall','orchard','shop'].includes(l.use))continue;
    const random=rng(island.seed+':home-plan:'+l.id),variant=Math.floor(random()*4);
    const [x,z]=polyCentroid(l.poly),yaw=Math.PI/2-l.facing,b={id:l.id,kind:'home',name:'Home '+(homes.length+1),x,z,yaw,c:Math.cos(yaw),s:Math.sin(yaw),parcel:l.poly,road:l.frontageRoadId,variant};
    let w=Math.min(12,Math.sqrt(l.area)*(.68+random()*.12)),d=w*(variant===1?1.1:variant===2?.74:.89);
    while(w>=3.5&&![-1,1].every(s=>[-1,1].every(t=>{const p=homeWorld(b,s*(w/2+.6),t*(d/2+.9));return pointInPoly(p.x,p.z,l.poly);}))) {w*=.9;d*=.9;}
    if(w<3.5)continue;
    Object.assign(b,{w,d,height:3.05+random()*.45,palette:Math.floor(random()*6)});
    b.roofHeight=b.height+Math.min(2.5,(variant===0?w:d)*.30)+.3;
    const hw=w/2,hd=d/2,door=1.9;
    b.y=Math.max(...[-1,1].flatMap(s=>[-1,1].map(t=>{const p=homeWorld(b,s*hw,t*hd);return island.sample(p.x,p.z);})))+.10;
    b.entry=homeWorld(b,0,hd+1.6);b.inside=homeWorld(b,0,Math.max(.2,hd-1.4));
    b.door={x:0,z:hd,width:door};
    b.walls=[{side:'left',x:-hw,z:0,w:.16,d},{side:'right',x:hw,z:0,w:.16,d},{side:'back',x:0,z:-hd,w,d:.16},
      ...[-1,1].map(s=>({side:'front',x:s*(hw+door/2)/2,z:hd,w:hw-door/2,d:.16}))];
    // The centre aisle and front door remain clear in every size. Larger homes
    // gain a bedroom divider; shared data drives furniture geometry and collision.
    const bedW=Math.min(1.6,w*.25),bedD=Math.max(2,Math.min(2.2,d*.36)),bedX=-hw+bedW/2+.26,bedZ=-hd+bedD/2+.27;
    b.furniture=[{id:'bed',type:'bed',x:bedX,z:bedZ,w:bedW,d:bedD,solid:true},
      {id:'kitchen',type:'kitchen',x:hw-.58,z:-hd+Math.min(1.7,d*.27),w:.86,d:Math.min(2.8,d*.38),solid:true},
      {id:'sofa',type:'sofa',x:-hw+.65,z:Math.max(.45,hd-1.7),w:.95,d:Math.min(1.85,Math.max(1.2,d*.30)),solid:true},
      {id:'shelf',type:'shelf',x:-hw+.22,z:Math.max(.45,hd-1.7),w:.35,d:.86,solid:false},
      {id:'rug',type:'rug',x:.1,z:hd*.16,w:Math.min(2.35,w*.39),d:Math.min(2.7,d*.43),solid:false}];
    if(w>6&&d>5.8){
      const split=-hw+w*.38;
      b.walls.push({side:'inside',x:split,z:-hd+bedD/2+.2,w:.12,d:bedD+.4});
      b.furniture.push({id:'desk',type:'desk',x:hw-.85,z:hd-1.45,w:1.2,d:.75,solid:true});
    }
    if(w>8&&d>7){
      // Larger plans separate the washroom from the kitchen, with an open
      // doorway onto the central hall. Small cottages retain an open studio.
      b.walls.push({side:'inside',x:hw-2.7,z:-hd+1.4,w:.12,d:2.8},
        {side:'inside',x:hw-2.51,z:-hd+2.8,w:.38,d:.12},
        {side:'inside',x:hw-.19,z:-hd+2.8,w:.38,d:.12});
      Object.assign(b.furniture.find(f=>f.id==='kitchen'),{z:0,d:2.4});
      b.furniture.push(
        {id:'bath-floor',type:'tile',x:hw-1.35,z:-hd+1.4,w:2.6,d:2.7,solid:false},
        {id:'shower',type:'shower',x:hw-2.1,z:-hd+.62,w:.9,d:.9,solid:true},
        {id:'toilet',type:'toilet',x:hw-.60,z:-hd+.74,w:.6,d:.9,solid:true},
        {id:'basin',type:'basin',x:hw-.40,z:-hd+2.38,w:.5,d:.40,solid:true},
        {id:'dining',type:'dining',x:0,z:-hd+1.6,w:1.5,d:1.8,solid:true},
        {id:'nightstand',type:'nightstand',x:bedX+bedW/2+.40,z:bedZ-bedD*.26,w:.5,d:.5,solid:true});
      b.rooms=[{name:'Living room',point:homeWorld(b,0,1)},
        {name:'Bedroom',point:homeWorld(b,-hw+1.6,-hd+bedD+.9)},
        {name:'Washroom',point:homeWorld(b,hw-1.3,-hd+1.9)}];
    }else b.rooms=[{name:'Studio',point:b.inside}];
    b.seats=[{x:-hw+.85,z:Math.max(.45,hd-1.7),yaw:b.yaw+Math.PI/2,action:'sit'}];
    if(d<5.8){
      // A full-length bed and the sofa cannot share the short wall in a studio.
      // Move the sofa to the opposite front corner instead of shrinking people.
      Object.assign(b.furniture.find(f=>f.type==='sofa'),{x:hw-.65,z:hd-.85,d:1.2,flip:true});
      Object.assign(b.furniture.find(f=>f.type==='shelf'),{x:hw-.22,z:hd-.85,flip:true});
      b.seats=[{x:hw-.85,z:hd-.85,yaw:b.yaw-Math.PI/2,action:'sit'}];
    }
    b.uses=usesFor(b);
    const road=roadMap.get(b.road);let nearest;
    for(let n=1;road&&n<road.pts.length;n++){const q=distSeg(b.entry.x,b.entry.z,...road.pts[n-1],...road.pts[n]);if(!nearest||q.d<nearest.d)nearest=q;}
    if(nearest){const start=homeWorld(b,0,hd),dx=nearest.x-start.x,dz=nearest.z-start.z,length=Math.hypot(dx,dz);b.approach={x:nearest.x-dx/length*(road.width/2+1),z:nearest.z-dz/length*(road.width/2+1)};}
    homes.push(b);
    const reach=Math.hypot(w,d)/2+3;
    for(let ix=Math.floor((x-reach)/32);ix<=Math.floor((x+reach)/32);ix++)for(let iz=Math.floor((z-reach)/32);iz<=Math.floor((z+reach)/32);iz++){
      const key=ix+','+iz;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(b);
    }
  }
  island.homes=homes;island.homeCells=cells;island.homesById=new Map(homes.map(b=>[b.id,b]));return homes;
}
