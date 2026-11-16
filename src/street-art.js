import * as THREE from 'three';
import {polyCentroid,pointInPoly} from '../packages/settlement/src/geom.js';
import {toWorld,toRoom,isHome,hasEditableFront,frontAt,wallState} from './street-world.js';
import {scoreStep,noteAtStep} from './street-music.js';

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

const moonShape=new THREE.Shape();
moonShape.moveTo(.28,.48);
moonShape.bezierCurveTo(-.64,.66,-.76,-.52,-.02,-.55);
moonShape.bezierCurveTo(.20,-.57,.38,-.46,.48,-.29);
moonShape.bezierCurveTo(-.08,-.47,-.30,.19,.28,.48);
const crescent=new THREE.ShapeGeometry(moonShape,28);
const brass='#edb96e',walnut='#85543d';
function moonBackdrop(back,z){
  back.box(0,1.48,z,6.40,2.93,.09,'#29263e');
  for(const side of [-1,1]){
    for(let i=0;i<7;i++)back.round(side*(3.04-i*.18),1.46,z+.07,.26,2.86,.19,i%2?'#793e62':'#9c526d');
    back.box(side*1.89,1.48,z+.10,.05,2.83,.05,brass);
    for(let i=0;i<3;i++)back.box(side*(1.45+i*.11),1.53,z+.07,.032,1.64+i*.30,.03,brass);
  }
  back.put(crescent,0,1.84,z+.14,1.37,1.37,1,'#ffe3a2');
  for(const [x,y,size] of [[-.98,2.34,.13],[.89,2.44,.10],[1.12,1.61,.14],[-.87,1.36,.08],[.61,1.06,.085]]){
    back.box(x,y,z+.11,size*.20,size*1.8,.026,brass);
    back.box(x,y,z+.12,size,size*.20,.026,brass);
  }
  back.box(0,2.91,z+.12,6.39,.08,.14,brass);
}
function clubKeyboard(a,x){
  for(const side of [-1,1]){
    a.box(x+side*.74,.38,-2,.1,.73,.48,walnut);
    a.box(x+side*.74,.07,-2,.22,.11,.63,'#453746');
    a.box(x+side*.88,.81,-1.98,.09,.24,.79,walnut);
    a.box(x+side*.31,.21,-1.1,.07,.42,.31,walnut);
  }
  a.box(x,.32,-2.12,1.48,.055,.08,brass);
  a.box(x,.73,-1.98,1.8,.16,.79,'#302d40');
  for(let k=0;k<14;k++){
    const keyX=x-.79+(k+.5)*1.58/14;
    a.box(keyX,.84,-1.85,1.58/14-.009,.06,.47,'#fff0d5');
    if(k%7!==2&&k%7!==6)a.box(keyX+.055,.89,-1.96,.065,.060,.25,'#282534');
  }
  a.box(x,.89,-2.26,1.67,.17,.18,walnut);
  for(let i=0;i<4;i++)a.round(x-.65+i*.12,1.0,-2.26,.065,.045,.065,brass);
  a.box(x,.43,-1.1,.82,.15,.46,'#b76e74');
}
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
    a.box(0,.031,.45,5.23,.026,2.79,brass);
    for(let x=-2;x<=2;x++)for(let z=-1;z<=1;z++)a.box(x*1.03,.052,.45+z*.90,1.01,.026,.88,
      ['#b9738c','#777da2','#74aba7','#c29a72'][(x+z+6)%4]);
    for(const x of [-1.7,1.7])clubKeyboard(a,x);
  }else{
    const peach=b.kind==='cottage',trim=peach?'#bb765c':'#526e85';
    a.box(0,.025,-.8,4.95,.04,3.8,peach?'#cc9e73':'#79949a');
    for(let i=0;i<7;i++)a.box(0,.051,-2.48+i*.55,4.76,.018,.055,cream);
    a.box(-1.65,.45,-1.74,1.22,.65,2.2,wood);a.box(-1.65,.83,-1.74,1.24,.18,2.24,'#b6c6bc');a.box(-1.65,.99,-2.45,.95,.15,.4,cream);
    table(a,1.38,-.94);chair(a,1.38,-.14,'#b08870');planter(a,2.38,-2.65,.8);
    if(peach){
      a.box(.15,.48,-3.06,2.65,.92,.65,trim);a.box(.15,.99,-3.06,2.73,.11,.69,cream);
      for(const x of [-.55,.65]){a.box(x,.52,-2.72,1.05,.69,.04,'#da9e7c');a.box(x,.68,-2.68,.24,.05,.05,wood);}
      a.round(-.58,1.06,-3.04,.47,.055,.47,dark);a.round(-.58,1.17,-3.04,.32,.19,.32,'#c46c55');
    }else{
      a.box(.13,.86,-3.12,2.37,1.72,.45,trim);
      for(let n=0;n<3;n++){a.box(.13,.2+n*.52,-2.85,2.4,.1,.54,wood);
        for(let j=0;j<7;j++){const h=.22+.05*((n+j)%4);a.box(-.78+j*.26,.24+n*.52+h/2,-2.86,.18,h,.31,[clay,cream,glass][(n+j)%3]);}}
    }
    a.box(-.78,.65,-1.85,.12,1.3,3.13,peach?'#ecd2ad':'#b5cbcd');
    a.box(-.78,1.34,-1.85,.18,.09,3.17,wood);
    a.box(-1.65,.939,-1.2,1.245,.028,.72,trim);
    for(const z of [-1.43,-1.35])a.box(-1.65,.958,z,1.25,.018,.035,cream);
  }
}

function building(b,island){
  const g=new THREE.Group();g.position.set(b.x,b.y,b.z);g.rotation.y=b.yaw;
  const a=new Pieces(g),hw=b.w/2,hd=b.d/2,[name,wall,col]=places[b.kind],h=3.02;
  const slab=new THREE.Group(),base=new Pieces(slab);g.add(slab);
  base.box(0,-.32,0,b.w+.38,.64,b.d+.38,'#b6a18a');base.box(0,-.035,0,b.w,.09,b.d,'#e8d3af');
  if(b.kind==='club')base.box(0,.015,0,b.w-.15,.019,b.d-.12,'#483c51');
  if(isHome(b)){
    for(let i=0;i<14;i++){
      const z=-hd+(i+.5)*b.d/14;
      base.box(0,.012,z,b.w-.18,.012,b.d/14-.013,['#e1c39c','#e6cca8','#ddbd95'][i%3]);
      base.box(i%2?1.2:-1.2,.020,z,.012,.008,b.d/14,'#ceb18e');
    }
  }
  base.finish();
  const faces=[0,1,2,3].map(()=>new THREE.Group()),[left,right,back,front]=faces.map(f=>new Pieces(f));
  g.add(...faces);
  left.box(-hw,h/2,0,.18,h,b.d,wall);right.box(hw,h/2,0,.18,h,b.d,wall);
  for(const s of [-1,1]){
    front.box(s*(hw+1.05)/2,h/2,hd,hw-1.05,h,.17,wall);windows(front,s*(hw+1.05)/2,hd+.1,Math.min(1.8,hw-1.5));
    front.box(s*(hw-.04),h/2,hd+.06,.16,h,.19,col);}
  back.box(0,h/2,-hd,b.w,h,.18,wall);front.box(0,2.72,hd,2.1,.6,.18,wall);
  if(b.kind==='club'){
    moonBackdrop(back,-hd+.14);
    for(const [side,panel] of [[-1,left],[1,right]]){
      const x=side*(hw-.12);
      panel.box(x,1.5,0,.07,2.96,b.d-.10,'#494057');
      panel.box(x-side*.05,.56,0,.06,1.08,b.d-.12,'#5c404a');
      panel.box(x-side*.09,1.10,0,.05,.06,b.d-.14,brass);
      for(const z of [-2,1.6]){
        panel.box(x-side*.08,1.96,z,.06,.69,.32,'#342b3a');
        panel.box(x-side*.14,1.99,z,.13,.46,.18,'#ffdda2');
        panel.box(x-side*.18,1.74,z,.14,.06,.29,brass);
      }
    }
    front.box(1.035,1.06,hd-.5,.12,2.12,1,'#624251');
    front.box(.96,1.45,hd-.5,.03,.76,.62,'#b7c8bf');
    front.ball(.94,.96,hd-.92,.095,.095,.095,brass);
  }
  const porch=new THREE.Group(),p=new Pieces(porch);g.add(porch);
  p.box(0,-.04,hd+.7,2.65,.16,1.4,'#ccbba5');
  planter(p,-hw+.52,hd+.58);planter(p,hw-.52,hd+.58);
  const home=['house','cottage'].includes(b.kind);
  const walkway=new THREE.Group(),tiles=new Pieces(walkway);g.add(walkway);
  for(let i=0;i<5;i++){
    const z=hd+1.7+i*.8,point=toWorld(b,0,z);
    tiles.box(0,island.sample(point.x,point.z)-b.y+.045,z,1.7,.085,.7,'#ddcbb1');
  }
  tiles.finish();
  if(!home){
    if(b.kind==='club'){
      front.box(0,2.63,hd+.54,b.w-.16,.22,1.07,'#5b3b55');
      front.box(0,2.60,hd+1.09,b.w-.16,.045,.065,brass);
      for(let i=-6;i<=6;i++)front.ball(i*.47,2.68,hd+1.09,.10,.10,.08,'#ffe3a2');
    }else for(let i=0;i<13;i++)front.box((i-6)*(b.w-.22)/13,2.65,hd+.57,(b.w-.22)/13, .16,1.14,i%2?cream:col);
    sign(faces[3],name,Math.min(4.55,b.w*.78),3.36,hd+.50,col,cream);
    table(p,-hw+1.45,hd+1.9);chair(p,-hw+1.46,hd+2.58,col);
  }else{
    sign(faces[3],name,2.2,2.74,hd+.14,col,cream);
    for(const s of [-1,1]){
      const x=s*(hw+1.05)/2,w=1.75;
      front.box(x,1.7,hd-.11,w+.14,1.26,.09,wood);front.box(x,1.73,hd-.18,w,1.10,.09,'#a4c8c9');
      front.box(x,1.73,hd-.24,.07,1.14,.06,cream);front.box(x,1.72,hd-.24,w,.07,.06,cream);
      front.box(x,1.10,hd-.18,w+.22,.1,.32,cream);
      for(const edge of [-1,1])front.box(x+edge*.74,1.82,hd-.28,.2,1.18,.10,col);
      back.box(s*1.61,2.02,-hd+.10,1.0,.81,.07,wood);
      back.box(s*1.61,2.02,-hd+.15,.84,.65,.04,s>0?col:glass);
    }
    front.box(1.035,1.06,hd-.5,.12,2.12,1,col);
    front.box(.96,1.45,hd-.5,.03,.76,.65,glass);
    front.ball(.94,.96,hd-.92,.095,.095,.095,'#d1aa63');
  }
  for(const s of [-1,1])front.box(s*1.06,1.18,hd+.11,.12,2.36,.2,col);
  front.box(0,2.35,hd+.12,2.22,.15,.2,col);
  for(const f of [left,right,back,front,p])f.finish();
  furnish(a,b);a.finish();
  const top=new THREE.Group(),r=new Pieces(top);r.box(0,h+.05,0,b.w+.57,.21,b.d+.57,col);
  if(home){r.put(roof,0,h+.15,0,b.w+.76,1.68,b.d+.74,col);r.box(hw*.55,4.12,-hd*.4,.63,1.65,.67,'#9e7665');}
  else{r.box(0,h+.2,0,b.w+.18,.16,b.d+.2,'#ab9786');}
  r.finish();g.add(top);
  return {g,top,faces,resize(offset){
    for(const part of [faces[0],faces[1],slab,top]){
      part.scale.z=(b.d+offset)/b.d;part.position.z=offset/2;
    }
    faces[3].position.z=porch.position.z=offset;
    walkway.scale.z=1-offset/3.9;walkway.position.z=(hd+5.25)*(1-walkway.scale.z);
  }};
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
  const g=new THREE.Group(), houses=plots.map(b=>building(b,island)),cafe=plots.find(b=>b.cafe);scene.add(g);
  for(const h of houses)g.add(h.g);
  const wall=partition();houses[plots.indexOf(cafe)].g.add(wall);
  const clubIndex=plots.findIndex(b=>b.kind==='club'),club=plots[clubIndex];
  const meters=['melody','bass'].map((part,i)=>{
    const mat=new THREE.MeshBasicMaterial({color:i?'#9be6d2':'#ffd19a'});
    const mesh=new THREE.InstancedMesh(box,mat,6);
    for(let n=0;n<6;n++){
      helper.position.set((i?1:-1)*1.1,.54+n*.09,-club.d/2+.23);
      helper.scale.set(.45,.045,.035);helper.rotation.set(0,0,0);helper.updateMatrix();mesh.setMatrixAt(n,helper.matrix);
    }
    mesh.computeBoundingSphere();mesh.count=0;houses[clubIndex].faces[2].add(mesh);
    return {part,mesh,mat};
  });
  const ghost=partition(),outline=new THREE.MeshBasicMaterial({color:0x338876,transparent:true,opacity:.34,depthWrite:false});
  const ghosts=new Map([[cafe.id,ghost]]);
  wall.parent.add(ghost);
  for(const [i,b] of plots.entries())if(hasEditableFront(b)){
    const frame=new THREE.Group(),f=new Pieces(frame),hw=b.w/2,hd=b.d/2;
    for(const side of [-1,1])f.box(side*(hw+1.05)/2,1.4,hd,hw-1.05,2.8,.12,'#ffffff');
    f.box(0,2.72,hd,2.1,.6,.12,'#ffffff');f.box(1.035,1.06,hd-.5,.12,2.12,1,'#ffffff');
    f.finish();houses[i].g.add(frame);ghosts.set(b.id,frame);
  }
  for(const frame of ghosts.values()){frame.traverse(m=>{if(m.isMesh)m.material=outline;});frame.visible=false;}
  const lanterns=new THREE.Group();houses[plots.indexOf(cafe)].g.add(lanterns);const L=new Pieces(lanterns);
  for(const x of [-2.6,0,2.6])L.ball(x,2.38,cafe.d/2+.8,.28,.3,.28,'#ffe39a');L.finish();
  const street=new Pieces(g);
  const road=island.plan.roads.find(r=>r.id===cafe.road);
  if(road)g.add(promenade(island,road,plots));
  for(const b of plots){
    for(const [side,depth] of [[-b.w/2-1.42,.7],[b.w/2+1.44,-2.1]]){const p=toWorld(b,side,depth),y=island.sample(p.x,p.z);
      street.round(p.x,y+.94,p.z,.28,1.95,.27,wood);street.ball(p.x,y+2.55,p.z,2.65,2.9,2.48,'#678768');street.ball(p.x+.51,y+2.95,p.z-.24,1.77,1.72,1.82,'#8ca878');}
    const q=toWorld(b,b.w/2+.72,b.d/2+2.6),y=island.sample(q.x,q.z);
    street.round(q.x,y+1.25,q.z,.11,2.5,.11,dark);street.ball(q.x,y+2.65,q.z,.35,.44,.35,cream);
  }
  // A path runs outside the last cottage down to the actual sampled shoreline.
  const last=plots.find(b=>b.kind==='gym'),edge=last.w/2+.85;
  for(let i=0;i<52;i++){const side=-edge-Math.max(0,i-16)*.37,p=toWorld(last,side,last.d/2+2-i*.82),y=island.sample(p.x,p.z);
    if(y<.12)break;street.box(p.x,y+.025,p.z,1.85,.085,.9,i%3?'#ddc19a':'#e7cfaa',last.yaw);}
  street.finish();
  return {g,wall,lanterns,updateMeters(time,actors){
    const step=scoreStep(time);
    let melody=false,bass=false;
    for(const a of actors){if(a.part==='melody')melody=true;if(a.part==='bass')bass=true;}
    for(const {part,mesh} of meters){
      const active=part==='melody'?melody:bass;
      const note=active?noteAtStep(part,step):null;
      mesh.count=note===null?0:2+note%5;
    }
  },preview(b,value,show){
    for(const [id,frame] of ghosts){frame.visible=show&&b?.id===id;if(frame.visible)frame.position.z=value;}
  },update(pos,layout,camera=pos,buildLot){wall.position.z=layout.wall;lanterns.visible=layout.lights;
    houses.forEach((h,i)=>{const b=plots[i],p=toRoom(b,pos),eye=toRoom(b,camera);
      if(hasEditableFront(b))h.resize(wallState(layout,b).wall);
      const cut=(Math.abs(p.x)<=b.w/2+.28&&p.z>=-b.d/2-.28&&p.z<=frontAt(b,layout)+.28)||buildLot===b.id;
      h.top.visible=!cut;const sides=[eye.x<0,eye.x>0,eye.z<0,eye.z>0];
      h.faces.forEach((f,k)=>f.visible=!cut||!sides[k]);});},
    dispose(){disposeGroup(g);outline.dispose();for(const m of meters)m.mat.dispose();scene.remove(g);}};
}
export function disposeGroup(g){g.traverse(m=>{if(m.isInstancedMesh)m.dispose();else if(m.isMesh){m.material.map?.dispose();m.material.dispose();m.geometry.dispose();}});}

export function avatar(color,skin='#d9a779'){
  const g=new THREE.Group(),torso=new THREE.Group(),standing=new THREE.Group(),sitting=new THREE.Group();
  const restingArms=new THREE.Group(),hands=[];
  const a=new Pieces(torso),legs=new Pieces(standing),seated=new Pieces(sitting),arms=new Pieces(restingArms);
  for(const s of [-1,1]){
    legs.box(s*.135,.26,0,.2,.44,.21,'#46566a');legs.ball(s*.135,.088,.05,.24,.17,.34,dark);
    legs.ball(s*.33,.9,0,.18,.54,.2,color);
    seated.box(s*.14,.50,.13,.22,.20,.38,'#46566a');seated.box(s*.14,.28,.31,.18,.34,.18,'#46566a');
    seated.ball(s*.14,.105,.37,.23,.17,.33,dark);
    arms.ball(s*.31,.85,.03,.18,.39,.18,color);arms.ball(s*.31,.705,.17,.145,.14,.30,skin);
    const arm=new THREE.Group(),p=new Pieces(arm);
    arm.position.set(s*.27,.99,.06);
    p.ball(s*.04,-.08,.075,.18,.27,.22,color);
    p.ball(s*.04,-.15,.28,.14,.13,.37,skin);
    p.box(s*.035,-.16,.49,.17,.075,.14,skin);
    p.finish();hands.push(arm);sitting.add(arm);
  }
  a.ball(0,.86,0,.61,.85,.43,color);a.ball(0,1.47,0,.48,.52,.45,skin);
  a.ball(0,1.62,-.04,.51,.3,.47,'#584543');
  for(const s of [-1,1])a.ball(s*.09,1.48,.207,.037,.049,.028,dark);
  a.finish();legs.finish();seated.finish();arms.finish();sitting.add(restingArms);g.add(torso,standing,sitting);
  g.setSeated=(value,part,time=0)=>{
    standing.visible=!value;sitting.visible=value;torso.position.y=value?-.055:0;
    restingArms.visible=!part;
    for(const [i,arm] of hands.entries()){
      arm.visible=!!part;
      if(part){const beat=time/.30,step=Math.floor(beat);
        arm.rotation.x=noteAtStep(part,step)!==null&&i===step%2?.13*Math.sin((beat-step)*Math.PI):0;}
    }
  };
  g.setSeated(false);return g;
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
