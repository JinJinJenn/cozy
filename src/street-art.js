import * as THREE from 'three';
import {polyCentroid,pointInPoly} from '../packages/settlement/src/geom.js';
import {toWorld,toRoom,floorAt} from './street-world.js';

const clay='#bf6251', wood='#986647', cream='#fff1d3', dark='#334747', glass='#91c9c8', pine='#476b50';
export const places={
  cottage:['Peach Cottage','#edbc96','#ad6556'],house:['Bluebell House','#acc5d4','#596a81'],
  cafe:["Jenn’s Café",'#f1cb91','#386b66'],spa:['Tidepool Spa','#bbdacc','#618b82'],
  gym:['Harbor Gym','#d4bbb0','#885c54'],club:['The Moon Room','#aa9bb9','#574d76'],
  restaurant:['Bay Kitchen','#e4b493','#9a4e45']
};
const box=new THREE.BoxGeometry(1,1,1),ball=new THREE.IcosahedronGeometry(.5,1);
const round=new THREE.CylinderGeometry(.5,.48,1,12);
const roof=new THREE.BufferGeometry();
roof.setAttribute('position',new THREE.Float32BufferAttribute([
  -.5,0,.5,.5,0,.5,0,1,.5, -.5,0,-.5,0,1,-.5,.5,0,-.5,
  -.5,0,-.5,-.5,0,.5,0,1,.5,-.5,0,-.5,0,1,.5,0,1,-.5,
  .5,0,.5,.5,0,-.5,0,1,-.5,.5,0,.5,0,1,-.5,0,1,.5
],3));roof.computeVertexNormals();
const material=new THREE.MeshLambertMaterial({side:THREE.DoubleSide});
const helper=new THREE.Object3D();
class Pieces {
  constructor(parent){this.parent=parent;this.batches=new Map();}
  put(shape,x,y,z,w,h,d,color,ry=0,rz=0){
    let b=this.batches.get(shape);if(!b)this.batches.set(shape,b=[]);
    helper.position.set(x,y,z);helper.scale.set(w,h,d);helper.rotation.set(0,ry,rz);helper.updateMatrix();
    b.push([helper.matrix.clone(),new THREE.Color(color)]);
  }
  box(...args){this.put(box,...args);}
  round(...args){this.put(round,...args);}
  ball(...args){this.put(ball,...args);}
  finish(){for(const [shape,items] of this.batches){const mesh=new THREE.InstancedMesh(shape,material,items.length);
    items.forEach(([m,c],i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,c)});this.parent.add(mesh);}}
}
function sign(parent,text,w,y,z,bg,ink){
  const canvas=document.createElement('canvas');canvas.width=704;canvas.height=144;const c=canvas.getContext('2d');
  c.fillStyle=bg;c.fillRect(0,0,704,144);c.strokeStyle=ink;c.lineWidth=4;c.strokeRect(8,8,688,128);
  c.fillStyle=ink;c.font='bold 63px Georgia';c.textAlign='center';c.textBaseline='middle';c.fillText(text,352,74,655);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w*144/704),new THREE.MeshBasicMaterial({map:tex}));
  m.position.set(0,y,z);parent.add(m);
}
function planter(a,x,z,scale=1){a.round(x,.25*scale,z,.69*scale,.5*scale,.69*scale,clay);
  a.ball(x,.72*scale,z,.94*scale,.8*scale,.85*scale,pine);
  for(let i=0;i<4;i++)a.ball(x+Math.cos(i*2)*.3*scale,.89*scale,z+Math.sin(i*2)*.27*scale,.22*scale,.21*scale,.22*scale,i%2?'#e99b81':'#f6cd8c');}
function windows(a,x,z,w){a.box(x,1.73,z,w+.15,1.34,.16,cream);a.box(x,1.76,z+.09,w,1.1,.04,glass);
  a.box(x,1.76,z+.13,.07,1.12,.05,cream);a.box(x,1.74,z+.14,w,.065,.04,cream);a.box(x,1.05,z+.12,w+.2,.13,.32,wood);}
function table(a,x,z){a.round(x,.75,z,.9,.11,.9,'#cf9671');a.round(x,.36,z,.13,.72,.13,dark);
  a.round(x,.07,z,.46,.09,.46,dark);a.round(x+.12,.9,z,.15,.18,.15,cream);
  a.round(x-.12,.89,z-.08,.12,.15,.12,'#ceb48e');a.ball(x-.12,1,z-.08,.18,.21,.18,pine);}
function chair(a,x,z,col,dir=1){a.box(x,.43,z,.54,.13,.53,col);a.box(x,.69,z+.23*dir,.54,.55,.09,col);
  for(const s of [-1,1])for(const k of [-1,1])a.box(x+s*.2,.2,z+k*.19,.07,.4,.07,wood);}

function furnish(a,b) {
  const hd=b.d/2;
  if(b.cafe){
    for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)if((x+z)%2===0)a.box(x,.025,z,.98,.025,.98,'#dbcfb5');
    for(const x of [-2.95,2.95]){table(a,x,2.76);chair(a,x,3.5,'#a75d53');chair(a,x,2.05,'#a75d53',-1);}
    a.box(0,.51,-3.14,5,1.02,.8,'#517d70');a.box(0,1.07,-3.14,5.2,.12,1,cream);
    a.box(-1.2,1.34,-3.13,.77,.46,.53,dark);a.round(-1.18,1.68,-3.13,.4,.28,.4,'#875d44');
    for(let i=0;i<5;i++)a.round(.1+i*.32,1.23,-3.12,.19,.17,.19,cream);
  }else if(b.kind==='restaurant'){
    for(const x of [-1.65,1.65]){
      a.box(x,.74,-.3,1.15,.11,.85,wood);a.box(x,.35,-.3,.22,.68,.32,dark);
      for(const s of [-1,1]){chair(a,x,-.3+s*.87,'#b35749',s);a.round(x,.82,-.3+s*.22,.36,.03,.36,cream);}
      a.round(x+.34,.93,-.3,.12,.26,.12,'#8a9c6f');
    }a.box(0,.55,-2.8,4.9,1.1,.72,'#8f6857');a.box(0,1.15,-2.8,5,.1,.8,cream);
  }else if(b.kind==='spa'){
    a.box(-1.65,.3,-1.28,1.8,.52,2.65,'#ceb598');a.box(-1.65,.58,-1.28,1.56,.08,2.39,'#7eb9b1');
    for(let i=0;i<3;i++)a.round(1.85-i*.38,.66,-2.3,.32,.27,.32,cream);
    a.box(1.25,.38,-2.1,2.4,.5,.84,wood);planter(a,2.4,-.15);
  }else if(b.kind==='gym'){
    for(const x of [-1.52,1.52]){a.box(x,.44,-.85,.85,.2,2.2,'#3c5963');
      for(const k of [-1,1]){a.box(x+k*.65,.86,-1.64,.11,1.6,.13,dark);a.round(x+k*.74,1.64,-1.64,.5,.2,.5,'#454651',0,Math.PI/2);}
      a.round(x,1.64,-1.64,.08,1.8,.08,'#aab1ab',0,Math.PI/2);}
  }else if(b.kind==='club'){
    for(let x=-2;x<=2;x++)for(let z=-1;z<=1;z++)a.box(x,.035,z,.91,.04,.91,['#cd8c9c','#8497bf','#75b8ba'][(x+z+6)%3]);
    for(const x of [-1.7,1.7]){a.box(x,.75,-2,1.8,.18,.74,'#343447');for(let i=0;i<10;i++)a.box(x-.72+i*.16,.87,-1.98,.14,.07,.5,cream);}
    a.ball(0,2.7,-.7,.6,.6,.6,'#c6d6d9');
  }else{
    a.box(-1.65,.45,-1.74,1.22,.65,2.2,wood);a.box(-1.65,.83,-1.74,1.24,.18,2.24,'#b6c6bc');a.box(-1.65,.99,-2.45,.95,.15,.4,cream);
    table(a,1.38,-.94);chair(a,1.38,-.14,'#b08870');planter(a,2.38,-2.65,.8);
  }
  planter(a,-b.w/2+.52,hd+.58);planter(a,b.w/2-.52,hd+.58);
}

function building(b){
  const g=new THREE.Group();g.position.set(b.x,b.y,b.z);g.rotation.y=b.yaw;
  const a=new Pieces(g),hw=b.w/2,hd=b.d/2,[name,wall,col]=places[b.kind],h=3.02;
  a.box(0,-.32,0,b.w+.38,.64,b.d+.38,'#b6a18a');a.box(0,-.035,0,b.w,.09,b.d,'#e8d3af');
  const faces=[0,1,2,3].map(()=>new THREE.Group()),[left,right,back,front]=faces.map(f=>new Pieces(f));
  g.add(...faces);
  left.box(-hw,h/2,0,.18,h,b.d,wall);right.box(hw,h/2,0,.18,h,b.d,wall);
  for(const s of [-1,1]){
    front.box(s*(hw+1.05)/2,h/2,hd,hw-1.05,h,.17,wall);windows(front,s*(hw+1.05)/2,hd+.1,Math.min(1.8,hw-1.5));
    front.box(s*(hw-.04),h/2,hd+.06,.16,h,.19,col);}
  back.box(0,h/2,-hd,b.w,h,.18,wall);front.box(0,2.72,hd,2.1,.6,.18,wall);
  a.box(0,-.04,hd+.7,2.65,.16,1.4,'#ccbba5');
  const home=['house','cottage'].includes(b.kind);
  if(!home){
    for(let i=0;i<13;i++)front.box((i-6)*(b.w-.22)/13,2.65,hd+.57,(b.w-.22)/13, .16,1.14,i%2?cream:col);
    sign(faces[3],name,Math.min(4.55,b.w*.78),3.36,hd+.50,col,cream);
    table(a,-hw+1.45,hd+1.9);chair(a,-hw+1.46,hd+2.58,col);
  }else{sign(faces[3],name,2.2,2.74,hd+.14,col,cream);}
  for(const s of [-1,1])front.box(s*1.06,1.18,hd+.11,.12,2.36,.2,col);
  front.box(0,2.35,hd+.12,2.22,.15,.2,col);
  for(const f of [left,right,back,front])f.finish();
  furnish(a,b);a.finish();
  const top=new THREE.Group(),r=new Pieces(top);r.box(0,h+.05,0,b.w+.57,.21,b.d+.57,col);
  if(home){r.put(roof,0,h+.15,0,b.w+.76,1.68,b.d+.74,col);r.box(hw*.55,4.12,-hd*.4,.63,1.65,.67,'#9e7665');}
  else{r.box(0,h+.2,0,b.w+.18,.16,b.d+.2,'#ab9786');}
  r.finish();g.add(top);return {g,top,faces};
}
function partition(){
  const g=new THREE.Group(),a=new Pieces(g);
  for(const s of [-1,1]){a.box(s*2.77,.85,0,3.64,1.7,.17,'#75a396');a.box(s*2.77,1.74,0,3.64,.12,.23,cream);}
  for(const s of [-1,1])a.box(s*.98,1.14,0,.12,2.28,.22,wood);
  a.box(0,2.29,0,2.08,.13,.24,wood);a.box(1.02,1.03,-.53,.13,2.06,1.06,'#c48a64');
  a.box(.94,1.43,-.58,.05,.66,.65,glass);a.finish();return g;
}
// Share each sampled cross-section between adjacent segments, including bends.
// Subdivide across the road so its surface follows the graded elevation on both sides.
function promenade(island,road,plots){
  const rows=[],points=road.pts;
  let distance=0;
  for(let k=1;k<points.length;k++){
    const [x,z]=points[k-1],[ex,ez]=points[k],length=Math.hypot(ex-x,ez-z),n=Math.ceil(length/.75);
    for(let j=0;j<n;j++)rows.push({x:x+(ex-x)*j/n,z:z+(ez-z)*j/n,d:distance+length*j/n});
    distance+=length;
  }
  rows.push({x:points.at(-1)[0],z:points.at(-1)[1],d:distance});
  for(const [i,r] of rows.entries()){
    const a=rows[Math.max(0,i-1)],b=rows[Math.min(rows.length-1,i+1)],len=Math.hypot(b.x-a.x,b.z-a.z);
    r.nx=-(b.z-a.z)/len;r.nz=(b.x-a.x)/len;
  }
  const positions=[],colors=[];
  function vertex(r,offset,lift,color){
    const x=r.x+r.nx*offset,z=r.z+r.nz*offset;
    positions.push(x,island.sample(x,z)+lift,z);colors.push(color.r,color.g,color.b);
  }
  const half=road.width/2;
  const bands=[
    [-half-2,-half-.15,.19,.19,'#d7c8b6'],[-half-.15,-half,.19,.19,'#e8d9c9'],[-half,-half,.19,.08,'#ac9a88'],
    [-half,-half/2,.08,.08,'#9b928c'],[-half/2,-.075,.08,.08,'#9b928c'],[-.075,.075,.08,.08,'#9b928c'],
    [.075,half/2,.08,.08,'#9b928c'],[half/2,half,.08,.08,'#9b928c'],[half,half,.08,.19,'#ac9a88'],
    [half,half+.15,.19,.19,'#e8d9c9'],[half+.15,half+2,.19,.19,'#d7c8b6']];
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i];
    if(!plots.some(p=>Math.hypot(a.x-p.x,a.z-p.z)<32))continue;
    for(const [left,right,h1,h2,base] of bands){
      const color=new THREE.Color(left===-.075&&Math.floor(a.d/3)%2===0?'#ead8a1':base);
      for(const [r,o,h] of [[a,left,h1],[b,left,h1],[a,right,h2],[a,right,h2],[b,left,h1],[b,right,h2]])vertex(r,o,h,color);
    }
  }
  const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geom.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geom.computeVertexNormals();
  return new THREE.Mesh(geom,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));
}
export function streetArt(island,plots,scene) {
  const g=new THREE.Group(), houses=plots.map(building),cafe=plots.find(b=>b.cafe);scene.add(g);
  for(const h of houses)g.add(h.g);
  const wall=partition();houses[plots.indexOf(cafe)].g.add(wall);
  const ghost=partition(),outline=new THREE.MeshBasicMaterial({color:0x338876,transparent:true,opacity:.34,depthWrite:false});
  ghost.traverse(m=>{if(m.isMesh)m.material=outline;});ghost.visible=false;wall.parent.add(ghost);
  const lanterns=new THREE.Group();houses[plots.indexOf(cafe)].g.add(lanterns);const L=new Pieces(lanterns);
  for(const x of [-2.6,0,2.6])L.ball(x,2.38,cafe.d/2+.8,.28,.3,.28,'#ffe39a');L.finish();
  const street=new Pieces(g);
  const road=island.plan.roads.find(r=>r.id===cafe.road);
  if(road)g.add(promenade(island,road,plots));
  for(const b of plots){
    for(const [side,depth] of [[-b.w/2-.85,1.1],[b.w/2+.75,-1.5]]){const p=toWorld(b,side,depth),y=island.sample(p.x,p.z);
      street.round(p.x,y+.94,p.z,.28,1.95,.27,wood);street.ball(p.x,y+2.55,p.z,2.65,2.9,2.48,'#678768');street.ball(p.x+.51,y+2.95,p.z-.24,1.77,1.72,1.82,'#8ca878');}
    const q=toWorld(b,b.w/2+.72,b.d/2+2.6),y=island.sample(q.x,q.z);
    street.round(q.x,y+1.25,q.z,.11,2.5,.11,dark);street.ball(q.x,y+2.65,q.z,.35,.44,.35,cream);
    for(let i=0;i<5;i++){const p=toWorld(b,0,b.d/2+1.7+i*.8);street.box(p.x,island.sample(p.x,p.z)+.045,p.z,1.7,.085,.7,'#ddcbb1',b.yaw);}
  }
  // A path runs outside the last cottage down to the actual sampled shoreline.
  const last=plots.find(b=>b.kind==='gym'),edge=last.w/2+.85;
  for(let i=0;i<52;i++){const side=-edge-Math.max(0,i-16)*.37,p=toWorld(last,side,last.d/2+2-i*.82),y=island.sample(p.x,p.z);
    if(y<.12)break;street.box(p.x,y+.025,p.z,1.85,.085,.9,i%3?'#ddc19a':'#e7cfaa',last.yaw);}
  street.finish();
  return {g,wall,ghost,lanterns,update(pos,layout,camera=pos,build=false){wall.position.z=layout.wall;lanterns.visible=layout.lights;
    houses.forEach((h,i)=>{const b=plots[i],p=toRoom(b,pos),eye=toRoom(b,camera);
      const cut=(Math.abs(p.x)<=b.w/2+.28&&Math.abs(p.z)<=b.d/2+.28)||(build&&b.cafe);
      h.top.visible=!cut;const sides=[eye.x<0,eye.x>0,eye.z<0,eye.z>0];
      h.faces.forEach((f,k)=>f.visible=!cut||!sides[k]);});},
    dispose(){disposeGroup(g);outline.dispose();scene.remove(g);}};
}
export function disposeGroup(g){g.traverse(m=>{if(m.isInstancedMesh)m.dispose();else if(m.isMesh){m.material.map?.dispose();m.material.dispose();m.geometry.dispose();}});}

export function avatar(color,skin='#d9a779'){
  const g=new THREE.Group(),a=new Pieces(g);
  for(const s of [-1,1]){a.box(s*.135,.26,0,.2,.44,.21,'#46566a');a.ball(s*.135,.088,.05,.24,.17,.34,dark);
    a.ball(s*.33,.9,0,.18,.54,.2,color);}
  a.ball(0,.86,0,.61,.85,.43,color);a.ball(0,1.47,0,.48,.52,.45,skin);
  a.ball(0,1.62,-.04,.51,.3,.47,'#584543');
  for(const s of [-1,1])a.ball(s*.09,1.48,.207,.037,.049,.028,dark);
  a.finish();return g;
}

export function townExteriors(island,detail,scene){
  const parent=new THREE.Group(),a=new Pieces(parent),skip=new Set(detail.map(b=>b.id)),footprints=[];
  const walls=['#ddbfaa','#d6cfb1','#b8cfc4','#ddd6c7','#c6b8bd'],roofs=['#9e786e','#70858a','#7a8876','#927d89'];
  for(const [i,l] of island.plan.lots.entries()){
    if(!l.buildable || skip.has(l.id) || i%7===3)continue;
    const [x,z]=polyCentroid(l.poly),yaw=Math.PI/2-l.facing;
    const b={x,z,c:Math.cos(yaw),s:Math.sin(yaw)},h=(l.district==='centre'?4:2.7)+(i%4)*.42;
    let w=Math.min(11,Math.sqrt(l.area)*.72),d=w*.84;
    while(w>=3.5&&![-1,1].every(s=>[-1,1].every(t=>{const p=toWorld(b,s*w*.54,t*d*.54);return pointInPoly(p.x,p.z,l.poly)}))){w*=.88;d*=.88;}
    if(w<3.5)continue;
    const y=island.sample(x,z),col=walls[i%walls.length],r=roofs[(i*3)%roofs.length];
    a.box(x,y+h/2-.28,z,w,h+.56,d,col,yaw);
    if(i%4===0)a.box(x,y+h+.12,z,w+.48,.26,d+.48,r,yaw);
    else a.put(roof,x,y+h,z,w+.6,1.35+i%3*.2,d+.56,r,yaw);
    for(const v of [-.29,.29]){const p=toWorld(b,w*v,d/2+.06);a.box(p.x,y+1.64,p.z,w*.17,1.04,.13,glass,yaw);}
    const front=toWorld(b,0,d/2+.08);a.box(front.x,y+.99,front.z,1.03,1.98,.12,wood,yaw);
    footprints.push({...b,w,d});
  }
  a.finish();scene.add(parent);island.streetFootprints=footprints;
  island.footprintCells=new Map();
  for(const b of footprints){const reach=Math.hypot(b.w,b.d)/2+1;
    for(let x=Math.floor((b.x-reach)/32);x<=Math.floor((b.x+reach)/32);x++)
      for(let z=Math.floor((b.z-reach)/32);z<=Math.floor((b.z+reach)/32);z++){
        const k=x+','+z;if(!island.footprintCells.has(k))island.footprintCells.set(k,[]);island.footprintCells.get(k).push(b);
      }}
  return ()=>{scene.remove(parent);disposeGroup(parent);};
}
