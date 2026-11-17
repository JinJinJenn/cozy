import {distSeg,pointInPoly,polyCentroid} from './geom.js';
import {rngFor} from './rng.js';

// Reserve a real block before assigning uses to nearby parcels. Fit the entire
// paved footprint inside the block and align it to one of its bounding streets.
export function planCivicCentre(plan,protectedLots=[]){
  const site=plan.sites[0];if(!site)return null;
  const reserved=new Set(plan.lots.filter(l=>protectedLots.includes(l.id)).map(l=>l.blockId));
  const candidates=[];
  for(const block of plan.blocks){
    if(block.townId!==site.id||reserved.has(block.id)||block.area<510||block.area>3600||block.roadIds.length<2)continue;
    const [x,z]=polyCentroid(block.poly);
    let best=Infinity,yaw=0;
    for(const r of plan.roads.filter(r=>block.roadIds.includes(r.id)))for(let i=1;i<r.pts.length;i++){
      const a=r.pts[i-1],b=r.pts[i],hit=distSeg(x,z,...a,...b);
      if(hit.d<best){best=hit.d;yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);}
    }
    const c=Math.cos(yaw),s=Math.sin(yaw);
    for(let half=15;half>=9;half--){
      const fits=[-1,-.5,0,.5,1].every(t=>[-1,1].every(k=>
        pointInPoly(x+(c*t+s*k)*half,z+(-s*t+c*k)*half,block.poly)&&
        pointInPoly(x+(c*k+s*t)*half,z+(-s*k+c*t)*half,block.poly)));
      if(!fits)continue;
      candidates.push({id:block.id,x,z,yaw,half,score:Math.hypot(x-site.x,z-site.z)-half*2});
      break;
    }
  }
  candidates.sort((a,b)=>a.score-b.score||a.id.localeCompare(b.id));
  const square=candidates[0];if(!square)return null;
  const hall=candidates.slice(1).filter(b=>Math.hypot(b.x-square.x,b.z-square.z)<83)
    .sort((a,b)=>Math.hypot(a.x-square.x,a.z-square.z)-Math.hypot(b.x-square.x,b.z-square.z))[0];
  if(hall){
    const towards=Math.atan2(square.x-hall.x,square.z-hall.z);
    hall.yaw+=Math.round((towards-hall.yaw)/(Math.PI/2))*Math.PI/2;
  }
  const shops=[];
  for(const l of plan.lots){
    if(l.blockId===square.id)l.use='square';
    else if(hall&&l.blockId===hall.id)l.use='hall';
    else if(l.buildable&&l.area>=93&&!reserved.has(l.blockId)){
      const [x,z]=polyCentroid(l.poly),d=Math.hypot(x-square.x,z-square.z);
      if(d<76)shops.push({l,d});
    }
  }
  shops.sort((a,b)=>a.d-b.d);
  for(const {l} of shops.slice(0,8))l.use='shop';
  for(const l of plan.lots){
    if(l.use||!l.buildable||l.area<85||reserved.has(l.blockId))continue;
    const chance=l.district==='outskirts'?.38:l.district==='residential'?.16:.04;
    if(rngFor(plan.seed,'garden/'+l.id)()<chance)l.use='orchard';
  }
  return {square,hall:hall??null};
}
