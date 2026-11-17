import * as THREE from 'three';
import {Pieces} from './street-pieces.js';
import {gardenForStreet,gardenSeats,toWorld} from './street-world.js';
import {flowerBed,gardenTree} from './harbor-art.js';
import {pointInPoly,distSeg} from '../packages/settlement/src/geom.js';
import {rng} from '../packages/island-gen/src/rng.js';

const cap=new THREE.CylinderGeometry(.20,.51,1,8),rail='#f6e5c3',green='#587e76',wood='#a47a5c';
const bough=new THREE.ConeGeometry(.5,1,11,2);
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
  const civicIds=new Set([island.plan.civic?.square?.id,island.plan.civic?.hall?.id]);
  for(const lot of [...island.plan.lots,...island.plan.blocks.filter(b=>civicIds.has(b.id))]){
    const xs=lot.poly.map(p=>p[0]),zs=lot.poly.map(p=>p[1]);
    reserveBox(Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs),lot);
  }
  for(const road of island.plan.roads)for(let i=1;i<road.pts.length;i++){
    const a=road.pts[i-1],b=road.pts[i],r=road.width/2+3;
    reserveBox(Math.min(a[0],b[0])-r,Math.min(a[1],b[1])-r,Math.max(a[0],b[0])+r,Math.max(a[1],b[1])+r,{a,b,r});
  }
  const park=detail.length?gardenForStreet(detail.find(b=>b.cafe)):null;
  const sites=island.plan.sites;
  for(let grove=0;grove<350+sites.length*14;grove++){
    let cx,cz;
    if(grove<350){cx=(random()*2-1)*island.half*.91;cz=(random()*2-1)*island.half*.91;}
    else{
      const site=sites[(grove-350)%sites.length],angle=random()*Math.PI*2,r=(.73+random()*.45)*site.radius;
      cx=site.x+Math.cos(angle)*r;cz=site.z+Math.sin(angle)*r;
    }
    if(island.sample(cx,cz)<2)continue;
    const count=7+Math.floor(random()*17),spread=8+random()*29;
    const evergreen=island.sample(cx,cz)>14||grove%4===0;
    for(let n=0;n<count;n++){
      const t=random()*Math.PI*2,r=spread*Math.sqrt(random()),x=cx+r*Math.cos(t),z=cz+r*Math.sin(t);
      const y=island.sample(x,z);if(y<1.7||y<island.waterAt(x,z)+.8||island.slope(x,z)>.75)continue;
      if(park&&Math.hypot(x-park.x,z-park.z)<26)continue;
      if(reserve.get(cellKey(x,z))?.some(o=>o.poly?pointInPoly(x,z,o.poly):distSeg(x,z,...o.a,...o.b).d<o.r))continue;
      const key=Math.floor(x/70)+','+Math.floor(z/70);
      if(!blocks.has(key))blocks.set(key,new Pieces(parent));
      const a=blocks.get(key).frame(x,y,z,t),s=.81+random()*.9;
      if(island.slope(x,z)>.24&&n%4===0){
        for(let b=0;b<3;b++)a.ball((b-1)*1.4*s,.35*s,b%2*.7,2.85*s,(1.18+.22*b)*s,1.9*s,
          ['#8e8c83','#a39e8e','#777f77'][b],b*.8,.12*b);
        continue;
      }
      if(evergreen){
        a.round(0,1.60*s,0,.38*s,3.20*s,.36*s,'#766452');
        for(let k=0;k<4;k++)a.put(bough,k%2*.08*s,(2.80+k*.94)*s,0,(3.45-k*.61)*s,(2.76-k*.21)*s,
          (3.55-k*.65)*s,['#405f56','#496e60','#567b64','#668a6d'][k],k*.61);
        continue;
      }
      a.round(0,1.6*s,0,.38*s,3.2*s,.36*s,'#776a52');
      for(let k=0;k<4;k++){
        const ang=k*2.4,h=k===3?4.4:3.1+.2*k,offset=k===3?.13:1.0;
        a.leaves(Math.cos(ang)*offset*s,h*s,Math.sin(ang)*offset*s,(2.6-k*.1)*s,(2.53+k*.08)*s,2.48*s,
          ['#52755f','#628661','#769568','#87a279'][k],ang);
      }
    }
  }
}

// Keep the roadside walk clear. Lamps and rest stops sit on the grass side
// of the paving and leave the junctions and front paths open.
export function furnishRoads(island,detail,blocks,parent,homes,frontPaths){
  const fixtures=[],benches=new Map(),roads=island.plan.roads;
  const segments=roads.flatMap(r=>r.pts.slice(1).map((b,i)=>({road:r,a:r.pts[i],b})));
  for(const road of roads){
    if(road.bridge||road.class==='path')continue;
    const main=road.class==='main',spacing=main?26:43;
    let chain=0,next=spacing*.47,index=0;
    for(let i=1;i<road.pts.length;i++){
      const [ax,az]=road.pts[i-1],[bx,bz]=road.pts[i],length=Math.hypot(bx-ax,bz-az);
      if(!length)continue;
      const tx=(bx-ax)/length,tz=(bz-az)/length;
      for(;next<chain+length;next+=spacing,index++){
        const along=next-chain,cx=ax+tx*along,cz=az+tz*along;
        for(const side of [index%2?1:-1,index%2?-1:1]){
          const across=road.width/2+3.45;
          const x=cx-side*tz*across,z=cz+side*tx*across,y=island.sample(x,z);
          if(y<island.waterAt(x,z)+.55||island.slope(x,z)>.24)continue;
          if(detail.some(b=>Math.hypot(b.x-x,b.z-z)<14))continue;
          if(homes.some(b=>Math.hypot(x-b.x,z-b.z)<Math.hypot(b.w,b.d)*.5+3.1))continue;
          if(frontPaths.some(([a,b])=>distSeg(x,z,a.x,a.z,b.x,b.z).d<3.2))continue;
          if(segments.some(s=>s.road!==road&&distSeg(x,z,...s.a,...s.b).d<s.road.width/2+5))continue;
          if(fixtures.some(f=>Math.hypot(x-f.x,z-f.z)<8))continue;
          const key=Math.floor(x/70)+','+Math.floor(z/70);
          if(!blocks.has(key))blocks.set(key,new Pieces(parent));
          const yaw=Math.atan2(side*tz,-side*tx),a=blocks.get(key).frame(x,y,z,yaw);
          const rest=main&&index%3!==1,post=rest?-1.64:0,iron='#405e58',cream='#edddb6';
          a.round(post,.16,0,.38,.32,.38,iron);a.round(post,1.49,0,.12,2.68,.12,iron);
          a.round(post,2.78,0,.25,.12,.25,'#b59562');
          a.round(post,2.92,0,.34,.13,.34,iron);a.ball(post,3.13,0,.40,.46,.40,'#fff0bf');
          a.round(post,3.38,0,.38,.09,.38,iron);a.ball(post,3.47,0,.11,.16,.11,iron);
          if(main){
            a.box(post+.36,2.67,0,.83,.06,.06,iron);
            const cloth=index%2?'#ba7363':'#538b81';
            a.box(post+.39,2.17,0,.54,.91,.055,cloth);
            a.box(post+.39,1.80,.032,.55,.075,.025,cream);
            a.box(post+.39,2.31,.034,.22,.22,.026,cream,0,Math.PI/4);
          }
          if(rest){
            a.box(.30,.032,0,4.78,.095,2.54,'#b7a992');
            for(const dx of [-.75,.75]){
              for(const dz of [-.17,.18])a.box(dx,.23,dz,.10,.45,.10,iron);
              a.box(dx,.71,-.22,.10,.8,.10,iron);
              a.box(dx,.69,0,.072,.070,.55,iron);
            }
            for(const dz of [-.18,0,.18])a.box(0,.48,dz,1.94,.09,.15,wood);
            for(const h of [.72,.91,1.08])a.box(0,h,-.22,1.95,.12,.078,wood);
            flowerBed(a,1.87,-.02,1.02,'quay-'+road.id+index);
          }
          const frame={x,z,y,yaw,c:Math.cos(yaw),s:Math.sin(yaw)};
          fixtures.push({...frame,...toWorld(frame,post,0),w:.34,d:.34,height:3.5});
          if(rest){
            fixtures.push({...frame,...toWorld(frame,1.87,-.02),w:1.09,d:.72,height:.85});
            fixtures.push({...frame,...toWorld(frame,0,-.23),w:1.95,d:.08,height:1.16});
            const id='bench-'+road.id+'-'+index;
            benches.set(id,{...frame,id,kind:'wayside',w:2.45,d:2.25});
          }
          break;
        }
      }
      chain+=length;
    }
  }
  island.streetBenches=benches;return fixtures;
}
