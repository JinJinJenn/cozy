import * as THREE from 'three';
import {Pieces,roof} from './street-pieces.js';
import {gardenTree,flowerBed} from './harbor-art.js';
import {toWorld} from './street-world.js';

const stone='#d9cbb0',trim='#f0dfbf',brick='#a85f49',slate='#455969',iron='#465e57',water='#72bcb5';
const cone=new THREE.ConeGeometry(.5,1,8),clock=new THREE.CylinderGeometry(.5,.5,1,24);
const canopy=new THREE.SphereGeometry(.5,16,8,0,Math.PI*2,0,Math.PI/2);
function hall(a,r){
  const w=r*1.67,d=r*.87,h=6.5;
  a.box(0,.18,0,w+.9,.6,d+1,stone);
  a.box(0,3.3,0,w,h,d,brick);
  for(const y of [.61,3.30,6.43])a.box(0,y,0,w+.34,.22,d+.32,trim);
  a.box(0,6.69,0,w+.67,.32,d+.62,slate);
  a.put(roof,0,6.82,0,d+.68,2.65,w+.57,slate,Math.PI/2);
  for(const side of [-1,1]){
    const face=a.frame(0,0,side*d/2,side>0?0:Math.PI);
    for(const sign of [-1,1])for(let i=0;i<3;i++){
      const x=sign*w*(.205+.102*i);
      face.box(x,3.34,.07,.26,6.12,.24,stone);
      for(const y of [1.95,4.93]){
        const px=x+sign*w*.046;
        face.box(px,y,.09,1.0,1.77,.16,trim);face.box(px,y,.20,.78,1.52,.09,'#557680');
        face.box(px,y,.26,.06,1.53,.04,trim);face.box(px,y+.16,.26,.82,.065,.04,trim);
        face.box(px,y-.92,.17,1.15,.12,.33,stone);
      }
    }
  }
  for(let i=0;i<4;i++)a.box(0,.12+i*.12,d/2+2.5-i*.40,7.2-i*.20,.24+i*.24,1.7,stone);
  a.box(0,1.93,d/2+.1,2.3,3.25,.25,slate);
  for(const x of [-2.5,-1.55,1.55,2.5]){
    a.round(x,2.50,d/2+1.55,.37,4.01,.37,trim);a.box(x,.61,d/2+1.55,.58,.43,.58,stone);
  }
  a.box(0,4.60,d/2+1.1,6.55,.38,3.37,trim);a.put(roof,0,4.78,d/2+1.13,6.70,1.39,3.49,brick);
  a.box(0,8.68,.15,4.32,4.95,4.08,brick);
  for(const y of [8.95,11.00])a.box(0,y,.15,4.75,.28,4.55,trim);
  for(let i=0;i<4;i++){
    const face=a.frame(0,0,.15,i*Math.PI/2);
    face.put(clock,0,10.04,2.18,1.58,.12,1.58,slate,0,0,Math.PI/2);
    face.put(clock,0,10.04,2.26,1.34,.06,1.34,'#f5e4b6',0,0,Math.PI/2);
    for(let j=0;j<12;j++){const t=j*Math.PI/6;
      face.box(.54*Math.sin(t),10.04+.54*Math.cos(t),2.31,.044,.10,.035,iron,0,-t);}
    face.box(-.13,10.19,2.35,.075,.45,.045,iron,0,.69);
    face.box(.17,10.14,2.36,.052,.46,.042,iron,0,-1.04);
  }
  a.put(canopy,0,11.14,.15,4.85,4.40,4.85,'#627a73');
  a.round(0,13.55,.15,.57,.7,.57,stone);a.put(cone,0,14.16,.15,.86,.86,.86,slate);a.round(0,14.92,.15,.07,.9,.07,iron);
  return {w,d:d+3.9,height:14.9};
}
function common(a,r){
  const edge=r-.42,green='#79965a',hedge='#668155',sand='#dac39c';
  a.box(0,.01,0,r*2,.10,r*2,stone);
  a.box(0,.076,0,edge*2,.05,edge*2,green);
  for(const side of [-1,1]){
    a.box(side*(r-1.0),.111,0,1.05,.04,2*edge,sand);
    a.box(0,.113,side*(r-1.0),2*edge,.04,1.05,sand);
  }
  for(const ang of [-Math.PI/4,Math.PI/4])a.box(0,.122,0,1.72,.05,(r-.75)*2.82,sand,ang);
  a.box(0,.124,0,1.88,.05,2*edge,sand);a.box(0,.127,0,2*edge,.05,1.88,sand);
  a.round(0,.17,0,7.8,.12,7.8,'#b87857');a.round(0,.245,0,7.1,.07,7.1,stone);
  for(let k=0;k<4;k++){
    const f=a.frame(0,0,0,k*Math.PI/2);
    for(const side of [-1,1]){
      const patch=f.frame(side*r*.30,0,r*.71);
      patch.box(0,.26,0,r*.40,.38,.80,hedge);
      for(let n=0;n<7;n++)patch.ball((n-3)*r*.05,.51,.0,.48,.23,.45,n%2?'#dba389':'#e2c475');
    }
    const tree=f.frame(r*.56,0,r*.83);gardenTree(tree,k%2,.76);
  }
  a.round(0,.44,0,4.05,.48,4.05,stone);a.round(0,.69,0,4.16,.13,4.16,trim);
  a.round(0,.765,0,3.83,.05,3.83,water);a.round(0,1.16,0,.70,.92,.70,'#8a9b84');
  a.round(0,1.64,0,1.76,.19,1.76,stone);a.round(0,1.75,0,1.56,.06,1.56,water);
  a.round(0,2.01,0,.24,.57,.24,stone);a.ball(0,2.35,0,.39,.48,.39,trim);
}
export function buildCentre(island,parent){
  const civic=island.plan.civic,obstacles=[];
  if(!civic)return obstacles;
  for(const [kind,b] of [['square',civic.square],['hall',civic.hall]]){
    if(!b)continue;
    const y=island.sample(b.x,b.z),a=new Pieces(parent).frame(b.x,y,b.z,b.yaw);
    const frame={...b,y,c:Math.cos(b.yaw),s:Math.sin(b.yaw)};
    if(kind==='square'){
      common(a,b.half);obstacles.push({...frame,w:3.85,d:3.85,height:2.45});
      island.townSquare={...frame,id:'town-square',kind:'square',w:b.half*2,d:b.half*2,entry:toWorld(frame,0,b.half*.52)};
    }else{
      a.box(0,.015,0,b.half*1.9,.11,b.half*1.87,'#9ca779');
      a.box(0,.10,b.half*.67,4.85,.13,b.half*.55,stone);
      for(const s of [-1,1])flowerBed(a,s*b.half*.60,b.half*.72,b.half*.42,'hall'+s);
      const shell=hall(a,b.half);
      obstacles.push({...frame,...toWorld(frame,0,1.35),...shell});
    }
    a.finish();
  }
  return obstacles;
}
export function marketFront(a,w,d,random){
  const h=4.9+random()*.75,wall=['#b67863','#b59b70','#889d91'][Math.floor(random()*3)];
  a.clad(0,h/2-.15,0,w,h+.30,d,wall);
  a.box(0,h+.04,0,w+.34,.22,d+.35,trim);a.box(0,h+.19,0,w+.13,.15,d+.12,slate);
  for(const side of [-1,1]){
    a.box(side*w*.49,h+.41,0,.16,.48,d,wall);
    a.box(0,h+.42,side*d*.49,w,.50,.17,wall);
    for(const y of [1.34,3.87]){
      const x=side*w*.28;
      a.box(x,y,d*.5+.06,w*.30,1.60,.13,trim);a.box(x,y,d*.5+.16,w*.27,1.39,.06,'#719498');
      a.box(x,y,d*.5+.21,.08,1.43,.05,trim);
    }
  }
  a.box(0,1.10,d*.5+.11,.98,2.18,.19,iron);
  const fabric=random()>.5?'#9e5d50':'#527c75';
  for(let i=0;i<11;i++){const x=(i-5)*w*.087,col=i%2?trim:fabric;
    a.box(x,2.51,d*.5+.64,w*.088,.10,1.22,col,0,0,.18);a.box(x,2.31,d*.5+1.19,w*.088,.23,.09,col);}
  return {parts:[{x:0,z:0,w,d,height:h+.7}],door:{x:0,z:d*.5+.3}};
}
