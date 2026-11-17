import * as THREE from 'three';
import {Pieces} from './street-pieces.js';
import {gardenForStreet,gardenSeats,toWorld} from './street-world.js';
import {flowerBed,gardenTree} from './harbor-art.js';
import {pointInPoly,distSeg} from '../packages/settlement/src/geom.js';
import {rng} from '../packages/island-gen/src/rng.js';

const cap=new THREE.CylinderGeometry(.20,.51,1,8),rail='#f6e5c3',green='#587e76',wood='#a47a5c';
function ribbons(group,island,paths){
  const positions=[],colors=[];
  for(const {points,width} of paths){
    const rows=[];
    for(let i=0;i<points.length;i++){
      const prev=points[Math.max(0,i-1)],next=points[Math.min(i+1,points.length-1)],p=points[i];
      const dx=next.x-prev.x,dz=next.z-prev.z,length=Math.hypot(dx,dz)||1;
      rows.push([-1,-.90,.90,1].map(k=>{
        const x=p.x-dz/length*k*width/2,z=p.z+dx/length*k*width/2;
        return [x,island.sample(x,z)+.075,z];
      }));
    }
    for(let i=1;i<rows.length;i++)for(let lane=0;lane<3;lane++){
      const color=new THREE.Color(lane===1?'#d9c59f':'#ad977b');
      for(const [r,k] of [[i-1,lane],[i,lane],[i-1,lane+1],[i-1,lane+1],[i,lane],[i,lane+1]]){
        positions.push(...rows[r][k]);colors.push(color.r,color.g,color.b);
      }
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));
  mesh.receiveShadow=true;group.add(mesh);
}
export function harborGreen(pieces,group,island,cafe){
  const park=gardenForStreet(cafe),base=island.sample(park.x,park.z),a=pieces.frame(park.x,base,park.z,park.yaw);
  const local=(x,z)=>{const p=toWorld(park,x,z);return pieces.frame(p.x,island.sample(p.x,p.z),p.z,park.yaw);};
  const ring=[],entry=[];
  for(let i=0;i<=64;i++){const t=i*Math.PI/32;ring.push(toWorld(park,13*Math.cos(t),8*Math.sin(t)));}
  for(let i=-18;i<=10;i++)entry.push(toWorld(park,0,i));
  ribbons(group,island,[{points:ring,width:1.65},{points:entry,width:2.45}]);
  // An open eight-post pavilion with two occupied-seat slots under the lantern roof.
  a.put(cap,0,.055,0,5.8,.10,5.8,'#d3bea0');
  for(let n=0;n<8;n++){
    const t=n*Math.PI/4+Math.PI/8,x=Math.cos(t)*2.51,z=Math.sin(t)*2.51;
    a.box(x,1.40,z,.16,2.8,.16,rail);a.box(x,.23,z,.23,.40,.23,green);
    a.box(x,2.58,z,.28,.25,.28,green);
    const next=t+Math.PI/4,ex=Math.cos(next)*2.51,ez=Math.sin(next)*2.51;
    a.box((x+ex)/2,2.74,(z+ez)/2,1.99,.21,.16,rail,-Math.atan2(ez-z,ex-x));
  }
  const canopy=new THREE.Group();group.add(canopy);const roofPieces=new Pieces(canopy);
  const top=roofPieces.frame(park.x,base,park.z,park.yaw);
  top.put(cap,0,3.24,0,6.42,.91,6.42,green,Math.PI/8);
  top.round(0,3.87,0,1.87,.47,1.87,rail);
  for(let n=0;n<8;n++){const t=n*Math.PI/4;top.box(Math.cos(t)*.92,3.88,Math.sin(t)*.92,.10,.35,.10,green);}
  top.put(cap,0,4.32,0,2.40,.51,2.40,green,Math.PI/8);
  top.round(0,4.69,0,.11,.40,.11,wood);top.ball(0,4.92,0,.21,.23,.21,'#e4c68a');
  roofPieces.finish();
  for(const [x,z] of gardenSeats){
    for(const s of [-1,1]){
      a.box(x+s*.41,.21,z,.11,.41,.41,green);
      a.box(x+s*.42,.60,z+.21,.10,.54,.11,green);
    }
    for(let j=0;j<3;j++)a.box(x,.45,z-.17+j*.16,1.15,.095,.13,wood);
    for(let j=0;j<2;j++)a.box(x,.64+.19*j,z+.22,1.17,.14,.09,wood);
  }
  for(const side of [-1,1]){
    for(let n=0;n<4;n++){
      const f=local(side*(4+n*1.4),-4.6+n*.19);
      flowerBed(f,0,0,1.28,'green'+side+n);
    }
    for(let n=0;n<5;n++){
      const t=(n+1)*Math.PI/6+side*.07;
      gardenTree(local(side*(14+2*Math.cos(t))*Math.sin(t),10*Math.cos(t)),(n+1)%4,.94+.16*(n%3));
    }
    // Low pickets mark the street edge. Leave a gate on the direct café axis.
    const fence=local(side*6.1,-14.5);
    for(const y of [.32,.66])fence.box(0,y,0,8.4,.09,.085,rail);
    for(let n=0;n<19;n++){
      const x=(n-9)*.46;
      fence.box(x,.44,0,.14,.88,.13,rail);
      fence.ball(x,.90,0,.15,.12,.14,rail);
    }
  }
  return {park,canopy};
}

export function beachLane(pieces,group,island,gym){
  const points=[];
  for(let step=0;step<54;step++){
    const x=-gym.w/2-1.20-Math.max(0,step-16)*.23;
    const p=toWorld(gym,x,gym.d/2+4.7-step*.68);
    if(island.sample(p.x,p.z)<.36)break;
    points.push(p);
  }
  if(points.length<3)return;
  ribbons(group,island,[{points,width:1.44}]);
  for(let i=4;i<points.length-1;i+=5){
    const p=points[i],x=p.x-.84*gym.c,z=p.z+.84*gym.s,y=island.sample(x,z);
    pieces.round(x,y+.31,z,.14,.65,.14,wood);
    pieces.round(x,y+.54,z,.15,.10,.15,rail);
  }
}

export function plantWoodlands(island,detail,blocks,parent){
  const random=rng(island.seed+':woodland'),reserve=new Map(),size=32;
  const cellKey=(x,z)=>Math.floor(x/size)+','+Math.floor(z/size);
  function reserveBox(x0,z0,x1,z1,item){
    for(let i=Math.floor(x0/size);i<=Math.floor(x1/size);i++)
      for(let j=Math.floor(z0/size);j<=Math.floor(z1/size);j++){
        const key=i+','+j;if(!reserve.has(key))reserve.set(key,[]);
        reserve.get(key).push(item);
      }
  }
  for(const lot of island.plan.lots){
    const xs=lot.poly.map(p=>p[0]),zs=lot.poly.map(p=>p[1]);
    reserveBox(Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs),lot);
  }
  for(const road of island.plan.roads)for(let i=1;i<road.pts.length;i++){
    const a=road.pts[i-1],b=road.pts[i],r=road.width/2+3;
    reserveBox(Math.min(a[0],b[0])-r,Math.min(a[1],b[1])-r,Math.max(a[0],b[0])+r,Math.max(a[1],b[1])+r,{a,b,r});
  }
  const park=detail.length?gardenForStreet(detail.find(b=>b.cafe)):null;
  for(let grove=0;grove<270;grove++){
    const cx=(random()*2-1)*island.half*.91,cz=(random()*2-1)*island.half*.91;
    if(island.sample(cx,cz)<2)continue;
    const count=5+Math.floor(random()*17),spread=6+random()*29;
    for(let n=0;n<count;n++){
      const t=random()*Math.PI*2,r=spread*Math.sqrt(random()),x=cx+r*Math.cos(t),z=cz+r*Math.sin(t);
      const y=island.sample(x,z);if(y<1.7||y<island.waterAt(x,z)+.8||island.slope(x,z)>.75)continue;
      if(park&&Math.hypot(x-park.x,z-park.z)<26)continue;
      if(reserve.get(cellKey(x,z))?.some(o=>o.poly?pointInPoly(x,z,o.poly):distSeg(x,z,...o.a,...o.b).d<o.r))continue;
      const key=Math.floor(x/70)+','+Math.floor(z/70);
      if(!blocks.has(key))blocks.set(key,new Pieces(parent));
      const a=blocks.get(key).frame(x,y,z,t),s=.81+random()*.9;
      a.round(0,1.6*s,0,.38*s,3.2*s,.36*s,'#776a52');
      for(let k=0;k<4;k++){
        const ang=k*2.4,h=k===3?4.4:3.1+.2*k,offset=k===3?.13:1.0;
        a.ball(Math.cos(ang)*offset*s,h*s,Math.sin(ang)*offset*s,(2.6-k*.1)*s,(2.53+k*.08)*s,2.48*s,
          ['#52755f','#628661','#769568','#87a279'][k],ang);
      }
    }
  }
}
