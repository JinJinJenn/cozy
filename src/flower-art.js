import * as THREE from 'three';
import {Pieces,setPieceVisibility} from './street-pieces.js';
import {flowers} from './roadside-flowers.js';

// Each flower head is a single scalloped, cupped surface. All heads of one
// species share the same geometry, including the flower worn on a shirt.
const heads={};
for(const [kind,style] of Object.entries(flowers)){
  const verts=[],indices=[],steps=style.count*4;
  verts.push(0,0,0);
  for(let i=0;i<steps;i++){
    const angle=i*2*Math.PI/steps,r=[.24,.43,.50,.43][i%4];
    verts.push(Math.sin(angle)*r,.14*r,Math.cos(angle)*r);
    indices.push(0,i+1,(i+1)%steps+1);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  geo.setIndex(indices);geo.computeVertexNormals();heads[kind]=geo;
}
function bloom(p,x,y,z,kind,size,tilt){
  const style=flowers[kind];
  p.put(heads[kind],x,y,z,size,size,size,style.petals,0,0,tilt);
  p.ball(x,y+.04*size*Math.cos(tilt),z+.04*size*Math.sin(tilt),size*.28,size*.16,size*.28,style.center,0,0,tilt);
}
export function roadsideBed(a,x,z,kind,handle){
  const wood='#936c52',trim='#ba916d';
  a.box(x,.18,z,1.02,.36,.65,wood);a.box(x,.375,z,1.1,.10,.73,trim);
  a.box(x,.425,z,1.00,.015,.63,'#605142');
  const flowers=a.tagged(handle);
  for(const [dx,dz,h,tilt] of [[-.34,.09,.67,.28],[-.12,-.13,.81,.32],[.12,.13,.74,.48],[.35,-.10,.70,.16]]){
    a.round(x+dx,(h+.43)/2,z+dz,.024,h-.43,.024,'#628355');
    a.ball(x+dx-.046,.52,z+dz,.13,.22,.065,'#688851',0,-.55);
    a.ball(x+dx+.046,.54,z+dz,.14,.24,.079,'#789960',0,.55);
    a.ball(x+dx,h-.028,z+dz,.078,.087,.078,'#859754');
    bloom(flowers,x+dx,h,z+dz,kind,.28,tilt);
  }
}
const empty=Object.freeze([]);
export function flowerDisplay(beds){
  let cut=empty;
  const growing=new Set(),matrix=new THREE.Matrix4(),scale=new THREE.Vector3();
  function open(id,amount){
    const bed=beds.get(id);if(!bed||bed.amount===amount)return;
    bed.amount=amount;
    if(amount===0||amount===1){setPieceVisibility(bed,amount===1);return;}
    bed.visible=undefined;scale.setScalar(amount);
    for(const piece of bed.instances){
      piece.mesh.setMatrixAt(piece.index,matrix.copy(piece.matrix).scale(scale));
      piece.mesh.instanceMatrix.needsUpdate=true;
    }
  }
  return session=>{
    const next=session.layout.cutFlowerBeds||empty;
    if(cut!==next&&(cut.length!==next.length||cut.some((id,i)=>id!==next[i]))){
      for(const id of cut)if(!next.includes(id))open(id,1);
      for(const id of next)if(!cut.includes(id))open(id,0);
    }
    cut=next;
    if(!cut.length&&!growing.size)return;
    for(const id of growing){
      let active=false;
      for(const a of session.actors.values())if(a.activity==='water'&&a.using?.lot===id){active=true;break;}
      if(!active){open(id,cut.includes(id)?0:1);growing.delete(id);}
    }
    for(const a of session.actors.values())if(a.activity==='water'&&cut.includes(a.using?.lot)){
      const amount=Math.min(1,Math.max(0,1-(a.useUntil-session.time)/3));
      if(!Number.isFinite(amount))continue;
      growing.add(a.using.lot);open(a.using.lot,Math.round(amount*30)/30);
    }
  };
}
export function lapelArt(torso,kind){
  const group=new THREE.Group();torso.add(group);group.name='lapel-'+kind;
  const p=new Pieces(group);
  p.ball(.125,1.105,.169,.056,.098,.029,'#72905d',0,-.51);
  bloom(p,.145,1.155,.178,kind,.153,1.30);p.finish();
  return group;
}
export function wateringCan(arm){
  const grip=new THREE.Group();grip.name='watering-can';arm.add(grip);
  grip.position.set(.05,-.428,.027);
  const g=new THREE.Group();grip.add(g);g.position.set(0,-.368,.015);
  const p=new Pieces(g),teal='#4b8580',rim='#c5c7a5';
  p.round(0,0,0,.32,.27,.30,teal);p.round(0,-.126,0,.33,.035,.31,rim);
  p.round(0,.135,0,.30,.025,.29,rim);p.round(0,.148,-.015,.15,.018,.125,'#425e56');
  p.box(0,.27,-.12,.045,.21,.045,teal);
  p.box(0,.368,-.015,.052,.046,.24,teal);p.box(0,.27,.097,.045,.21,.045,teal);
  p.round(0,.026,.211,.073,.28,.073,teal,0,0,.90);
  p.round(0,.12,.325,.132,.06,.132,rim,0,0,1.45);
  p.finish();
  const drops=new THREE.Group();g.add(drops);const water=new Pieces(drops);
  for(let i=0;i<6;i++)water.ball((i%3-1)*.032,-(i%2)*.048,.016*i,.027,.056,.032,'#9edddd');
  water.finish();
  const tilt=new THREE.Quaternion(),axis=new THREE.Vector3(1,0,0);
  grip.updatePour=t=>{
    tilt.setFromAxisAngle(axis,.64+.09*Math.sin(t*2.7));
    grip.quaternion.copy(arm.quaternion).invert().multiply(tilt);
    const f=(t*2.4)%1;drops.position.set(0,.10-.22*f,.37+.22*f);
  };
  return grip;
}
