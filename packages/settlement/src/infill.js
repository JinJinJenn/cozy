import {distSeg,pointInPoly,polyCentroid,r1,r2,r3} from './geom.js';

// Complete existing neighbourhood frontages without changing issued parcel IDs.
// New parcels use road/station IDs, so saves do not depend on generation order.
export function addFrontageLots(plan,T){
  const original=plan.lots.map(l=>({...l,center:polyCentroid(l.poly)}));
  const occupied=new Map(),cell=24;
  const bounds=p=>({x0:Math.min(...p.map(v=>v[0])),x1:Math.max(...p.map(v=>v[0])),z0:Math.min(...p.map(v=>v[1])),z1:Math.max(...p.map(v=>v[1]))});
  const keys=b=>{const out=[];for(let x=Math.floor(b.x0/cell);x<=Math.floor(b.x1/cell);x++)for(let z=Math.floor(b.z0/cell);z<=Math.floor(b.z1/cell);z++)out.push(x+','+z);return out;};
  const reserve=p=>{const b=bounds(p);for(const k of keys(b)){if(!occupied.has(k))occupied.set(k,[]);occupied.get(k).push(p);}};
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  function overlaps(a,b){
    if(a.some(p=>pointInPoly(...p,b))||b.some(p=>pointInPoly(...p,a)))return true;
    return a.some((p,i)=>b.some((r,j)=>{const q=a[(i+1)%a.length],s=b[(j+1)%b.length];return cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0;}));
  }
  for(const l of plan.lots)reserve(l.poly);
  const cafe=plan.lots.find(l=>l.id==='l107');
  if(plan.seed==='petalwood'&&cafe){
    const [x,z]=polyCentroid(cafe.poly),fx=Math.cos(cafe.facing),fz=Math.sin(cafe.facing),cx=x+36*fx,cz=z+36*fz;
    reserve(Array.from({length:20},(_,i)=>{const t=i*Math.PI/10;return [cx+24*Math.cos(t),cz+24*Math.sin(t)];}));
  }
  const segments=plan.roads.flatMap(r=>r.pts.slice(1).map((b,i)=>({a:r.pts[i],b,r})));
  let added=0;
  for(const road of plan.roads){
    if(road.bridge||road.class==='path')continue;
    const neighbours=original.filter(l=>l.frontageRoadId===road.id);
    if(!neighbours.length)continue;
    let chain=0,station=12,index=0;
    for(let i=1;i<road.pts.length;i++){
      const a=road.pts[i-1],b=road.pts[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!len)continue;
      const tx=(b[0]-a[0])/len,tz=(b[1]-a[1])/len;
      for(;station<chain+len;station+=19,index++)for(const side of [-1,1]){
        const rx=a[0]+tx*(station-chain),rz=a[1]+tz*(station-chain);
        if(!neighbours.some(l=>Math.hypot(l.center[0]-rx,l.center[1]-rz)<72))continue;
        const nx=-tz*side,nz=tx*side,w=16+(index%3),d=22+(index%2)*3,offset=road.width/2+2.7+d/2;
        const x=rx+nx*offset,z=rz+nz*offset;
        const poly=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>[r1(x+tx*u*w/2+nx*v*d/2),r1(z+tz*u*w/2+nz*v*d/2)]);
        const nearby=new Set(keys(bounds(poly)).flatMap(k=>occupied.get(k)||[]));
        if([...nearby].some(p=>overlaps(poly,p)))continue;
        let valid=true,h=0,slope=0,count=0;
        for(let u=-1;u<=1.01;u+=.25)for(let v=-1;v<=1.01;v+=.25){
          const px=x+tx*u*w/2+nx*v*d/2,pz=z+tz*u*w/2+nz*v*d/2,sl=T.slopeAt(px,pz);
          if(T.state(px,pz)!==0||T.height(px,pz)<.75||sl>.24||segments.some(s=>distSeg(px,pz,...s.a,...s.b).d<s.r.width/2+2.2)){valid=false;break;}
          h+=T.height(px,pz);slope+=sl;count++;
        }
        if(!valid)continue;
        const id='frontage-'+road.id+'-'+index+'-'+(side>0?'l':'r');
        const nearest=neighbours.reduce((a,b)=>Math.hypot(a.center[0]-x,a.center[1]-z)<Math.hypot(b.center[0]-x,b.center[1]-z)?a:b);
        plan.lots.push({id,blockId:id,townId:nearest.townId,poly,frontageRoadId:road.id,area:w*d,slope:r3(slope/count),h:r2(h/count),buildable:true,size:'large',district:'residential',facing:r3(Math.atan2(-nz,-nx)),shape:'quad',infill:true});
        plan.blocks.push({id,townId:nearest.townId,poly,area:w*d,lots:1,roadIds:[road.id]});
        reserve(poly);added++;
      }
      chain+=len;
    }
  }
  plan.stats.lots=plan.lots.length;plan.stats.blocks=plan.blocks.length;
  plan.stats.buildable=plan.lots.filter(l=>l.buildable).length;plan.stats.frontageLots=added;
  return added;
}
