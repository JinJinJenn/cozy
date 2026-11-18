import * as THREE from 'three';
import {roof} from './street-pieces.js';
import {crownGeometry} from './foliage.js';
import {toWorld} from './street-world.js';
import {rng} from '../packages/island-gen/src/rng.js';

const linen='#fff0d1',oak='#976645',leaf='#4f8053',slate='#405968',iron='#394c50';
const hip=new THREE.BufferGeometry(),vertices=[];
const lower=[[-.5,0,.5],[.5,0,.5],[.5,0,-.5],[-.5,0,-.5]];
const upper=lower.map(([x,,z])=>[x*.68,1,z*.56]);
for(let i=0;i<4;i++){
  const j=(i+1)%4;
  vertices.push(...lower[i],...lower[j],...upper[j],...lower[i],...upper[j],...upper[i]);
}
vertices.push(...upper[0],...upper[1],...upper[2],...upper[0],...upper[2],...upper[3]);
hip.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));hip.computeVertexNormals();hip.userData.slate=true;

const paints=[
  ['#efd6b4','#647c82','#647b70'],['#dfa48c','#82635f','#446b6b'],
  ['#a6bfb3','#536777','#af7359'],['#e7c57e','#716878','#557f85'],
  ['#a8bbc9','#546379','#687c69'],['#dec3bd','#715d70','#567163'],
];
function sash(a,x,y,z,w,h,trim,shutters=false){
  a.box(x,y,z,w+.18,h+.20,.13,linen);
  a.box(x,y,z+.083,w,h,.07,'#698e98');
  a.box(x,y+h*.22,z+.124,w-.08,h*.39,.023,'#a8c4c2');
  a.box(x,y,z+.15,.064,h,.055,linen);
  a.box(x,y+h*.03,z+.15,w,.070,.055,linen);
  a.box(x,y-h*.5-.09,z+.09,w+.35,.115,.28,trim);
  if(shutters)for(const side of [-1,1]){
    const sx=x+side*(w*.5+.24);
    a.box(sx,y,z+.02,.28,h+.14,.12,trim);
    for(const t of [-1,1])a.box(sx,y+t*h*.31,z+.09,.24,.045,.04,linen);
  }
}
function ridge(a,x,z,w,d,h,rise,color,sideways=false){
  const part=a.frame(x,h,z,sideways?Math.PI/2:0);
  if(sideways)[w,d]=[d,w];
  part.box(0,0,0,w+.27,.18,d+.27,linen);
  part.put(roof,0,.07,0,w+.46,rise,d+.45,color);
  part.box(0,rise+.07,0,.14,.11,d+.46,color);
}
function chimney(a,x,y,z){
  a.box(x,y+.52,z,.55,1.37,.53,'#ad775e');
  a.box(x,y+1.19,z,.71,.15,.68,'#d4a887');
  for(const s of [-1,1])a.round(x+s*.15,y+1.42,z,.18,.35,.22,'#a8664f');
}
export function coastalHouse(a,w,d,district,random){
  const type=Math.floor(random()*4),[wall,tile,trim]=paints[Math.floor(random()*paints.length)];
  const two=type===2||(district==='centre'&&type!==0),h=two?4.55:2.75+random()*.36;
  const wing=type===1||type===3,bodyD=wing?d*.70:d*.90,cz=wing?-d*.14:0;
  const bodyW=type===2?w*.76:w*.96,front=cz+bodyD/2,back=cz-bodyD/2;
  const parts=[{x:0,z:cz,w:bodyW,d:bodyD,height:h+Math.min(2.5,bodyW*.29)}];
  function shell(x,z,bw,bd,height){
    a.clad(x,height/2-.22,z,bw,height+.44,bd,wall);
    a.box(x,.18,z,bw+.12,.37,bd+.12,'#ac9981');
    a.box(x,height-.16,z,bw+.12,.13,bd+.12,linen);
    if(two)a.box(x,height*.5,z,bw+.07,.105,bd+.07,trim);
  }
  shell(0,cz,bodyW,bodyD,h);
  ridge(a,0,cz,bodyW,bodyD,h,Math.min(2.5,bodyW*.29),tile,type!==2);
  const wingW=w*.46,wingX=type===1?-w*.23:w*.23,tail=d*.29;
  if(wing){
    const wz=front+tail*.5;
    shell(wingX,wz,wingW,tail,h-.18);
    ridge(a,wingX,wz,wingW,tail+.38,h-.18,wingW*.39,tile);
    parts.push({x:wingX,z:wz,w:wingW,d:tail,height:h+wingW*.39});
    sash(a,wingX,1.57,front+tail+.06,Math.min(wingW*.43,1.22),1.16,trim,true);
    if(two)sash(a,wingX,3.48,front+tail+.06,.83,.80,trim);
  }
  const doorX=wing?-wingX:bodyW*.13,porchWidth=Math.min(2.65,bodyW*.44);
  a.box(doorX,1.12,front+.07,1.12,2.22,.16,linen);
  a.box(doorX,1.05,front+.17,.88,2.05,.1,trim);
  a.box(doorX,1.52,front+.235,.58,.60,.045,'#acc6c1');
  a.box(doorX,.58,front+.235,.6,.61,.03,wall);
  a.ball(doorX+.31,.96,front+.26,.09,.09,.09,'#d9b876');
  a.box(doorX,.12,front+.54,porchWidth,.26,1.05,'#bd9f7c');
  a.box(doorX,2.34,front+.49,porchWidth+.2,.16,1.18,tile);
  for(const s of [-1,1])a.box(doorX+s*(porchWidth*.47),1.24,front+.92,.12,2.13,.12,linen);
  if(!wing)sash(a,-bodyW*.28,1.5,front+.08,Math.min(1.24,bodyW*.20),1.12,trim,bodyW>6);
  if(two)sash(a,doorX,3.45,front+.08,1.12,1.08,trim);
  const rear=a.frame(0,0,back,Math.PI);
  for(const side of [-1,1]){
    sash(rear,bodyW*side*.24,1.55,.07,Math.min(1.18,bodyW*.23),1.08,trim);
    const flank=a.frame(side*bodyW*.5,0,cz,side*Math.PI/2);
    sash(flank,0,1.53,.09,Math.min(1.32,bodyD*.30),1.13,trim,true);
    if(two)sash(flank,0,3.5,.09,1,.9,trim);
  }
  chimney(a,-bodyW*.28,h+.58,cz-bodyD*.19);
  return {parts,door:{x:doorX,z:front+1}};
}

const gardenCrowns=new Map();
export function gardenTree(a,variant,scale){
  const pink=variant===2, tall=variant===3;
  const colors=pink?['#aa6978','#db8e9f','#f4b6c1','#f6c8c3']:
    tall?['#365a51','#4c7360','#68906c','#86a77a']:['#456c57','#648658','#86a567','#a1ba7e'];
  const s=scale*(tall?1.10:1);
  if(!gardenCrowns.has(variant)){
    const lobes=[];
    for(let i=0;i<5;i++){
      const ang=i*2.4+variant*.72,r=i===4?.18:.89,x=Math.cos(ang)*r,z=Math.sin(ang)*r,y=i===4?4.05:3.03+.34*(i%2);
      lobes.push({position:[x,y,z],scale:[2.18,1.71,2.11],color:colors[i%3],yaw:ang},
        {position:[x+.24,y+.39,z+.21],scale:[1.50,1.23,1.50],color:colors[2+i%2],yaw:ang+.4});
    }
    gardenCrowns.set(variant,crownGeometry(lobes));
  }
  a.put(gardenCrowns.get(variant),0,0,0,s,s,s,'#ffffff');
  a.round(0,1.40*s,0,.35*s,2.85*s,.33*s,'#856749');
  for(let i=0;i<5;i++){
    const ang=i*2.4+variant*.72;
    const limb=a.frame(0,0,0,-ang);
    limb.put(branch,.46*s,2.38*s,0,.17*s,1.68*s,.17*s,'#876849',0,-.56);
  }
}
const branch=new THREE.CylinderGeometry(.39,.51,1,7);
export function flowerBed(a,x,z,length,seed){
  const rand=rng(seed);
  a.box(x,.17,z,length,.36,.65,'#9c7159');
  a.box(x,.37,z,length+.08,.12,.72,'#c39775');
  const count=Math.max(3,Math.round(length*3.8));
  for(let i=0;i<count;i++){
    const px=x-length*.46+length*.92*i/(count-1),pz=z+(rand()-.5)*.30,h=.54+rand()*.17;
    a.ball(px,.47,pz,.48,.43,.48,i%2?'#74965e':'#587858');
    a.ball(px+.04,h,pz+.03,.26,.24,.24,['#efaaa9','#eecc94','#ec8793','#e4b9cf'][i%4]);
  }
}
function dormer(a,x,z,y,col){
  a.box(x,y+.42,z,1.15,.88,.86,linen);
  sash(a,x,y+.44,z+.45,.74,.65,col);
  a.put(roof,x,y+.88,z,1.53,.55,1.10,col);
}
export function harborRoof(a,b,h,col){
  const w=b.w,d=b.d;
  if(b.cafe){
    a.box(0,h+.24,0,w+.44,.35,d+.37,'#f4d5b8');
    a.box(0,h+.47,0,w+.59,.17,d+.55,'#673f45');
    a.put(hip,0,h+.55,0,w+.67,1.67,d+.67,'#536777');
    a.box(0,h+2.24,0,(w+.67)*.69,.15,(d+.67)*.57,slate);
    for(const n of [-1,0,1])dormer(a,n*w*.31,d*.46,h+.57,'#617783');
    for(const side of [-1,1]){
      const flank=a.frame(side*(w*.5-.1),0,-.27,side*Math.PI/2);
      dormer(flank,0,0,h+.54,'#647981');
    }
    chimney(a,-w*.28,h+1.85,-d*.24);
  }else if(b.kind==='restaurant'||b.kind==='spa'){
    a.put(hip,0,h+.14,0,w+.56,1.33,d+.5,col);
    const cap=a.frame(0,h+1.51,-.2,0);
    cap.box(0,.19,0,w*.44,.46,d*.39,linen);
    for(const s of [-1,0,1])cap.box(s*.75,.20,d*.20,.40,.26,.08,'#709294');
    cap.put(roof,0,.43,0,w*.48,.59,d*.45,col);
  }else{
    a.box(0,h+.19,0,w+.28,.19,d+.25,col);
    for(const side of [-1,1]){
      a.box(side*w*.49,h+.46,0,.2,.57,d,'#ccb6a3');
      a.box(0,h+.46,side*d*.49,w,.57,.19,col);
    }
    if(b.kind==='club'){
      for(let i=0;i<3;i++)a.box(0,h+.75+i*.19,d*.49,3.38-i*.62,.23,.23,i%2?'#dfb16c':col);
    }
  }
}

export function shopFront({b,left,right,back,front,rightFront=front,porch,wall,col}){
  const hw=b.w/2,hd=b.d/2;
  for(const [side,pieces] of [[-1,left],[1,right],[0,back]]){
    const f=side?pieces.frame(side*hw,0,0,side*Math.PI/2):pieces.frame(0,0,-hd,Math.PI);
    const width=side?b.d:b.w;
    f.box(0,.37,.11,width,.58,.14,col);
    f.box(0,.70,.15,width,.09,.17,linen);
    f.box(0,2.85,.13,width,.16,.19,linen);
    for(const edge of [-1,1]){
      f.box(edge*(width/2-.11),1.52,.13,.19,2.75,.19,linen);
      sash(f,edge*width*.245,1.73,.15,width*.19,1.27,col,true);
    }
  }
  for(const side of [-1,1]){
    const x=side*(hw+1.05)/2;
    flowerBed(side>0?rightFront:front,x,hd+.32,Math.min(1.75,hw-1.08),b.kind+side);
    if(b.cafe){
      front.box(x,.58,hd+.12,2.18,.61,.14,col);
      front.box(x,.58,hd+.20,1.91,.41,.045,'#679388');
      front.box(side*(hw-.20),1.42,hd+.13,.26,2.88,.22,linen);
    }
  }
  if(!b.cafe)return;
  front.box(0,3.0,hd+.17,b.w+.20,.20,.31,linen);
  // Cake stands and a pastry display sit in front of the lower panes.
  const display=front.frame(-2.81,0,hd+.23);
  display.box(0,1.22,0,1.36,.05,.32,'#b68562');
  for(const [i,x] of [-.43,0,.43].entries()){
    display.round(x,1.27,.02,.32,.04,.32,linen);
    display.round(x,1.34,.02,.24,.13,.24,i===1?'#834f43':'#dbab76');
    display.round(x,1.42,.02,.23,.04,.23,i===1?'#e5aaab':linen);
    display.ball(x+.01,1.47,.02,.075,.076,.075,'#bd5e68');
  }
  const menu=porch.frame(hw-1.76,0,hd+2.10,-.25);
  for(const x of [-.29,.29]){
    menu.box(x,.52,0,.07,1.05,.08,oak);
    menu.box(x,.46,-.26,.07,.96,.07,oak,0,0,.25);
  }
  menu.box(0,.70,0,.67,.74,.10,oak);menu.box(0,.70,.067,.55,.62,.032,'#365859');
  menu.round(0,.81,.093,.22,.038,.22,linen,0,0,Math.PI/2);
  for(let i=0;i<3;i++)menu.box(0,.65-i*.073,.10,.32-i*.05,.018,.02,'#e8ce98');
  flowerBed(porch,hw-1.14,hd+.99,1.62,'cafe terrace');
}
export function patioParasol(canopy){
  canopy.round(0,1.17,0,.075,2.28,.075,oak);
  // Scalloped parasol petals follow the mast around the bistro table.
  for(let i=0;i<10;i++){
    const t=i*Math.PI/5,petal=canopy.frame(0,0,0,t);
    petal.ball(0,2.21,.40,.66,.17,.91,i%2?'#efb0a2':'#fff1d4');
  }
  canopy.ball(0,2.32,0,.54,.15,.54,'#d88374');
}

export function coastPlanting(pieces,island,plots){
  const random=rng(island.seed+':harbor-gardens');
  for(const b of plots){
    const hw=b.w/2,hd=b.d/2;
    // Borders sit beside and behind the walls, clear of the pavement and doors.
    for(const side of [-1,1]){
      for(let k=0;k<10;k++){
        const p=toWorld(b,side*(hw+.55+random()*.27),-hd+(k+.4)*b.d/10);
        const bed=pieces.frame(p.x,island.sample(p.x,p.z),p.z,b.yaw);
        const h=.30+random()*.32;
        bed.ball(0,h*.45,0,.76,h,.79,k%2?'#73955c':'#547b5b');
        for(let j=0;j<3;j++)bed.ball((random()-.5)*.47,h*.89,(random()-.5)*.48,.21,.18,.20,['#efb4ba','#e5b0c8','#ffdda3'][(j+k)%3]);
      }
    }
    for(let i=0;i<22;i++){
      const lx=(random()-.5)*b.w*1.48,lz=-hd-2-random()*13;
      const p=toWorld(b,lx,lz),y=island.sample(p.x,p.z);
      if(y<.25||y>3.7)continue;
      const rock=pieces.frame(p.x,y-.09,p.z,b.yaw),s=.36+random()*.82;
      rock.ball(0,.23*s,0,s,.75*s,s*.88,i%2?'#b4af98':'#8d9a8c',random()*3);
      for(let k=0;k<3;k++)rock.ball(.28*s+k*.12,.20+s*.17,k*.08,.10,.42+s*.24,.14,'#859c60',0,(k-1)*.28);
    }
  }
}
