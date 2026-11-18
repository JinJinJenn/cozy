import {polyCentroid,pointInPoly,distSeg} from '../packages/settlement/src/geom.js';
import {rng} from '../packages/island-gen/src/rng.js';
import {routeOnGrid} from './walk-grid.js';
import {fixtureOutlet,lamps,televisionIn} from './home-fixtures.js';
import {footprint} from './furniture-pose.js';

export const homeWorld=(b,x,z)=>({x:b.x+b.c*x+b.s*z,z:b.z-b.s*x+b.c*z});
export const homeLocal=(b,p)=>({x:(p.x-b.x)*b.c-(p.z-b.z)*b.s,z:(p.x-b.x)*b.s+(p.z-b.z)*b.c});
const hit=(p,r,margin=.31)=>Math.abs(p.x-r.x)<r.w/2+margin&&Math.abs(p.z-r.z)<r.d/2+margin;
export function homesNear(island,p){return island.homeCells?.get(Math.floor(p.x/32)+','+Math.floor(p.z/32))||[];}
export function homeAt(island,p,margin=0){return homesNear(island,p).find(b=>{const q=homeLocal(b,p);return Math.abs(q.x)<b.w/2+margin&&Math.abs(q.z)<b.d/2+margin;});}
export function homeWalkable(b,p){
  return homeWalkableLocal(b,homeLocal(b,p));
}
export function homeWalkableLocal(b,q){
  const hw=b.w/2,hd=b.d/2;
  if(Math.abs(q.x)>hw+.6||Math.abs(q.z)>hd+.6)return null;
  for(const r of b.walls)if(hit(q,r))return false;
  for(const r of b.furniture){
    if(!r.solid)continue;
    if(r.type==='sofa'){
      const dx=q.x-r.x,dz=q.z-r.z;
      const x=r.turn===1?-dz:r.turn===2?-dx:r.turn===3?dz:dx,z=Math.abs(r.turn%2?dx:dz);
      if(Math.abs(x-(r.flip?1:-1)*r.w*.42)<.37&&z<r.d/2+.31)return false;
      if(Math.abs(x)<r.w/2+.31&&Math.abs(z-(r.d/2-.05))<.36)return false;
    }else if(hit(q,footprint(r)))return false;
  }
  return true;
}
// A use point is walkable; a pose may be on solid furniture. Never route a
// walker to the centre of a bed or counter, and keep the exit point with the use.
function usesFor(b){
  const sofa=b.furniture.find(f=>f.type==='sofa');
  let sofaSeat=b.seats[0],endSeat;
  if(sofa.d>=1.72){
    const cushions=[-.36,.36].map(offset=>({...sofaSeat,z:sofaSeat.z+offset}));
    const allowed=p=>homeWalkable(b,p)===true;
    if(cushions.every(p=>{const q=homeWorld(b,p.x,p.z);return allowed(q)&&routeOnGrid(allowed,b.inside,q);})){
      [sofaSeat,endSeat]=cushions;
    }
  }
  const uses=[{...sofaSeat,object:'sofa',mealSeat:true,label:'Sit on the sofa',target:{x:sofa.x,z:sofa.z,y:.65}}];
  const kinds={bed:['rest','Rest on the bed'],kitchen:['cook','Cook a meal'],shelf:['read','Read a book'],desk:['write','Write at the desk'],
    shower:['shower','Take a shower'],toilet:['bathroom','Use the bathroom'],basin:['wash','Wash your hands'],dining:['sit','Sit at the table'],rug:['stretch','Stretch on the rug']};
  const switches=[],mealSpots=[];
  for(const f of b.furniture){
    if(!kinds[f.type]&&!lamps[f.type])continue;
    if(f.type==='shelf'){
      uses.push({...sofaSeat,object:'sofa',action:'read',label:'Read a book on the sofa',target:{x:f.x,z:f.z,y:1.9}});continue;
    }
    const candidates=f.type==='rug'?[{x:f.x,z:f.z}]:[.4,.65,.9,1.2].flatMap(gap=>[
      {x:f.x-f.w/2-gap,z:f.z},{x:f.x+f.w/2+gap,z:f.z},
      {x:f.x,z:f.z+f.d/2+gap},{x:f.x,z:f.z-f.d/2-gap}]);
    const allowed=p=>{const q=homeLocal(b,p);return Math.abs(q.x)<b.w/2&&Math.abs(q.z)<b.d/2&&homeWalkable(b,p);};
    const point=candidates.find(p=>{const q=homeWorld(b,p.x,p.z);return allowed(q)&&routeOnGrid(allowed,b.inside,q);});
    if(!point)continue;
    const lamp=lamps[f.type];
    if(lamp){
      const x=f.x+lamp.x,z=f.z+lamp.z;
      switches.push({...point,object:f.id+'-lamp',action:'switch',lamp:f.type,label:'Switch '+lamp.name,
        target:{x,z,y:lamp.shade},radius:.22,yaw:b.yaw+Math.atan2(x-point.x,z-point.z)});
    }
    if(!kinds[f.type])continue;
    const [action,label]=kinds[f.type];
    const use={...point,object:f.id,action,label,target:{x:f.x,z:f.z,y:f.type==='shelf'?1:.65},yaw:b.yaw+Math.atan2(f.x-point.x,f.z-point.z)};
    if(action==='rest')use.pose={x:f.x,z:f.z+f.d/2-.15,yaw:b.yaw,height:.82,scale:1};
    if(action==='bathroom')use.pose={x:f.x,z:f.z+.08,yaw:b.yaw};
    if(action==='shower')use.pose={x:f.x,z:f.z-.07,yaw:b.yaw+Math.PI,height:.25};
    if(f.type==='dining'){
      for(const side of [1,-1]){
        const x=f.x+(f.breakfast?side*.43:0),direction=f.breakfast?1:side,z=f.z+direction*.72;
        const entrances=[{x,z:f.z+direction*(f.d/2+.48)},...[-1,1].map(dir=>({x:f.x+dir*(f.w/2+.45),z}))];
        const chair=entrances.find(p=>{
          const world=homeWorld(b,p.x,p.z);return allowed(world)&&routeOnGrid(allowed,b.inside,world);
        });
        if(!chair)continue;
        const seat={...use,...chair,mealSeat:true,object:'chair-'+(side>0?'front':'back'),radius:.37,
          pose:{x,z,yaw:b.yaw+(direction>0?Math.PI:0)},target:{x,y:.65,z}};
        if(side===1)uses.push(seat);else mealSpots.push(seat);
      }
      continue;
    }
    if(['kitchen','basin','shower'].includes(f.type)){
      const atFixture=(action,label)=>{
        const outlet=fixtureOutlet(f,action),x=f.x+outlet.x,z=f.z+outlet.z;
        // Stand alongside the actual working part of a long counter.
        const aligned={x:point.x,z};
        const work=point.x!==f.x&&routeOnGrid(allowed,homeWorld(b,point.x,point.z),homeWorld(b,aligned.x,z))?aligned:point;
        return {...use,...work,action,label,target:{x,z,y:outlet.y},radius:f.type==='shower'?.40:.31,
          yaw:b.yaw+Math.atan2(x-work.x,z-work.z)};
      };
      const fixture=atFixture(action,label);uses.push(fixture);
      if(f.type==='kitchen'){
        uses.push(atFixture('wash','Wash up at the sink'));
        mealSpots.push({...fixture,action:'serveSoup',label:'Take a bowl of soup'},{...fixture,action:'returnSoup',label:'Return your serving'});
      }
    }else uses.push(use);
  }
  const tv=televisionIn(b),screen={x:tv.x,z:tv.z,y:tv.y};
  const watch={...sofaSeat,object:'sofa',action:'watch',label:'Watch television',target:screen,radius:.57};
  const floor=uses.find(u=>u.action==='stretch')||homeLocal(b,b.inside);
  const second=endSeat?{...endSeat,object:'sofa-end'}:{x:floor.x,z:floor.z,object:'rug'};
  second.yaw=b.yaw+Math.atan2(tv.x-second.x,tv.z-second.z);
  return uses.concat(switches,mealSpots,watch,{...second,action:'watch',label:'Watch television together',target:screen,alternate:true});
}
export function prepareHomes(island,exclude=[]){
  const skip=new Set(exclude.map(b=>b.id)),homes=[],cells=new Map();
  const roadMap=new Map(island.plan.roads.map(r=>[r.id,r]));
  for(const l of island.plan.lots){
    if(!l.buildable||skip.has(l.id)||['square','hall','orchard','shop'].includes(l.use))continue;
    const random=rng(island.seed+':home-plan:'+l.id),variant=Math.floor(random()*4);
    const [x,z]=polyCentroid(l.poly),yaw=Math.PI/2-l.facing;
    // The city needs every footprint for collision. Only an interaction needs
    // routed furniture approaches. Keep stable indices when the same home reopens.
    let uses;
    const b={id:l.id,kind:'home',name:'Home '+(homes.length+1),x,z,yaw,c:Math.cos(yaw),s:Math.sin(yaw),
      parcel:l.poly,road:l.frontageRoadId,variant,get uses(){return this.placedUses||(uses??=usesFor(this));}};
    let w=Math.min(12,Math.sqrt(l.area)*(.68+random()*.12)),d=w*(variant===1?1.1:variant===2?.74:.89);
    while(w>=3.5&&![-1,1].every(s=>[-1,1].every(t=>{const p=homeWorld(b,s*(w/2+.6),t*(d/2+.9));return pointInPoly(p.x,p.z,l.poly);}))) {w*=.9;d*=.9;}
    if(w<3.5)continue;
    Object.assign(b,{w,d,height:3.05+random()*.45,palette:Math.floor(random()*6)});
    b.roofHeight=b.height+Math.min(2.5,(variant===0?w:d)*.30)+.3;
    const hw=w/2,hd=d/2,door=1.9;
    b.collisionHalfX=Math.abs(b.c)*(hw+.6)+Math.abs(b.s)*(hd+.6);
    b.collisionHalfZ=Math.abs(b.s)*(hw+.6)+Math.abs(b.c)*(hd+.6);
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
        {id:'dining',type:'dining',x:0,z:-hd+1.6,w:1.5,d:1.8,solid:true,breakfast:w<10.8},
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
