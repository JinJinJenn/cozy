const roadIndexes=new WeakMap();
export function roadsOf(island){
  if(roadIndexes.has(island))return roadIndexes.get(island);
  const segments=[],cells=new Map();
  for(const road of island.plan.roads)for(let i=1;i<road.pts.length;i++){
    const [x,z]=road.pts[i-1],[ex,ez]=road.pts[i],length=Math.hypot(ex-x,ez-z);
    if(!length)continue;
    const dx=(ex-x)/length,dz=(ez-z)/length,r=road.width/2;
    const line={x,z,dx,dz,length,r,bridge:!!road.bridge,drivable:road.class!=='path'&&road.width>=4};segments.push(line);
    const reach=r+2; // Include the paved shoulders in nearby road queries.
    for(let ix=Math.floor((Math.min(x,ex)-reach)/32);ix<=Math.floor((Math.max(x,ex)+reach)/32);ix++)
      for(let iz=Math.floor((Math.min(z,ez)-reach)/32);iz<=Math.floor((Math.max(z,ez)+reach)/32);iz++){
        const key=ix+','+iz;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(line);
      }
  }
  const result={segments,cells};roadIndexes.set(island,result);return result;
}
export function project(line,p){
  const t=Math.min(line.length,Math.max(0,(p.x-line.x)*line.dx+(p.z-line.z)*line.dz));
  const x=line.x+t*line.dx,z=line.z+t*line.dz;
  return {x,z,distance:Math.hypot(x-p.x,z-p.z)};
}

export function carriagewayAt(island,x,z){
  const lines=roadsOf(island).cells.get(Math.floor(x/32)+','+Math.floor(z/32));
  let nearest,best=Infinity;
  for(const line of lines||[]){
    if(!line.drivable)continue;
    const hit=project(line,{x,z});
    if(hit.distance<line.r+.45&&hit.distance<best){nearest=line;best=hit.distance;}
  }
  return nearest;
}

// At a crossroads the pavement beside one road may still be in the other.
// Check both roads and the ground before choosing a place to stop.
export function sidewalkStop(island,target,from,canStand){
  const [x,z]=target,line=carriagewayAt(island,x,z);
  if(!line)return target;
  const hit=project(line,{x,z}),offset=line.r+.9;
  const side=(from[1]-hit.z)*line.dx-(from[0]-hit.x)*line.dz>=0?1:-1;
  for(const along of [0,3,-3,6,-6,9,-9]){
    for(const sign of [side,-side]){
      const px=hit.x-line.dz*offset*sign+line.dx*along;
      const pz=hit.z+line.dx*offset*sign+line.dz*along;
      if(!carriagewayAt(island,px,pz)&&canStand(px,pz))return [px,pz];
    }
  }
  return null;
}
