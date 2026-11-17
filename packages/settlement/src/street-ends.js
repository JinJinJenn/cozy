import {distSeg,pointInPoly,polyCentroid,r1} from './geom.js';

// Grid generators extend survey lines beyond the blocks they serve. End these
// streets at the last junction unless a parcel, bridge or connecting road needs the tail.
export function finishStreetEnds(plan){
  const changes=[];
  for(const road of plan.roads){
    if(road.bridge||road.class==='path'||road.pts.length!==2)continue;
    const frontage=plan.lots.filter(l=>l.frontageRoadId===road.id).map(l=>polyCentroid(l.poly));
    for(const end of [0,1]){
      const [x,z]=road.pts[end],[ex,ez]=road.pts[1-end],dx=ex-x,dz=ez-z;
      const length=Math.hypot(dx,dz);
      let first=Infinity,connected=false;
      for(const other of plan.roads){
        if(other===road)continue;
        for(let j=1;j<other.pts.length;j++){
          const [a,b]=other.pts[j-1],[c,d]=other.pts[j],ux=c-a,uz=d-b;
          if(distSeg(x,z,a,b,c,d).d<(road.width+other.width)*.5+.5){connected=true;break;}
          const cross=dx*uz-dz*ux;
          if(Math.abs(cross)<1e-5)continue;
          const t=((a-x)*uz-(b-z)*ux)/cross,u=((a-x)*dz-(b-z)*dx)/cross;
          if(t>=0&&t<=1&&u>=0&&u<=1)first=Math.min(first,t*length);
        }
        if(connected)break;
      }
      if(connected||first<4||first>27||first>length*.36)continue;
      if(frontage.some(([px,pz])=>((px-x)*dx+(pz-z)*dz)/length<first-1))continue;
      changes.push([road,end,[r1(x+dx*first/length),r1(z+dz*first/length)]]);
    }
  }
  for(const [road,end,point] of changes)road.pts[end]=point;
}

// Join spare street ends beyond the outer blocks. Both tangents come from
// existing streets so the approach roads flow into the bend.
export function addCountryLanes(plan,terrain){
  if(plan.params.type!=='grid')return;
  const segments=plan.roads.flatMap(r=>r.pts.slice(1).map((b,i)=>({r,a:r.pts[i],b})));
  const tips=[];
  for(const road of plan.roads){
    if(road.bridge||road.class==='path')continue;
    for(const side of [0,1]){
      const p=side?road.pts.at(-1):road.pts[0],q=side?road.pts.at(-2):road.pts[1];
      if(segments.some(s=>s.r!==road&&distSeg(...p,...s.a,...s.b).d<s.r.width/2+2.8))continue;
      const len=Math.hypot(p[0]-q[0],p[1]-q[1]);if(len<.1)continue;
      const site=plan.sites.reduce((a,b)=>Math.hypot(b.x-p[0],b.z-p[1])<Math.hypot(a.x-p[0],a.z-p[1])?b:a);
      if(Math.hypot(site.x-p[0],site.z-p[1])<site.radius*.58)continue;
      tips.push({road,p,tx:(p[0]-q[0])/len,tz:(p[1]-q[1])/len,site});
    }
  }
  const pairs=[];
  for(let i=0;i<tips.length;i++)for(const b of tips.slice(i+1)){
    const a=tips[i],dx=b.p[0]-a.p[0],dz=b.p[1]-a.p[1],len=Math.hypot(dx,dz);
    if(a.site!==b.site||a.road===b.road||len<25||len>105)continue;
    if((a.tx*dx+a.tz*dz)/len<-.39||(b.tx*dx+b.tz*dz)/len>.39)continue;
    pairs.push({a,b,len});
  }
  pairs.sort((p,q)=>p.len-q.len);
  const used=new Set(),perSite=new Map(),margin=3.4;
  for(const {a,b,len} of pairs){
    if(used.has(a)||used.has(b)||(perSite.get(a.site)||0)>=3)continue;
    const reach=len*.58,pts=[],steps=Math.ceil(len/2);
    const nearby=plan.lots.filter(l=>l.poly.some(v=>Math.hypot(v[0]-a.p[0],v[1]-a.p[1])<len*1.7+25));
    let clear=true;
    for(let j=0;j<=steps;j++){
      const t=j/steps,k=1-t,u=k*k*(1+2*t),v=t*t*(3-2*t),ca=3*k*k*t*reach,cb=3*k*t*t*reach;
      const x=r1(a.p[0]*u+b.p[0]*v+a.tx*ca+b.tx*cb),z=r1(a.p[1]*u+b.p[1]*v+a.tz*ca+b.tz*cb);
      if(terrain.state(x,z)!==0||terrain.distWater[terrain.k(x,z)]*terrain.cell<margin||terrain.slopeAt(x,z)>.20||
        segments.some(s=>s.r!==a.road&&s.r!==b.road&&distSeg(x,z,...s.a,...s.b).d<s.r.width/2+margin)||
        nearby.some(l=>pointInPoly(x,z,l.poly)||l.poly.some((p,i)=>distSeg(x,z,...p,...l.poly[(i+1)%l.poly.length]).d<margin))){clear=false;break;}
      pts.push([x,z]);
    }
    if(!clear)continue;
    const road={id:'lane-'+a.road.id+'-'+b.road.id,class:'street',width:4.5,bridge:false,pts};
    plan.roads.push(road);
    for(let i=1;i<pts.length;i++)segments.push({r:road,a:pts[i-1],b:pts[i]});
    used.add(a);used.add(b);perSite.set(a.site,(perSite.get(a.site)||0)+1);
  }
  plan.stats.roads=plan.roads.length;
}
