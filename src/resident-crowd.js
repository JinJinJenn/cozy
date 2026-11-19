import * as THREE from 'three';
import {avatar} from './street-art.js';
import {roadContact} from '../packages/sim/src/road-contact.js';
import {settleChassis,vehicleArt} from './vehicle-art.js';
import {wheelbase} from '../packages/sim/src/roadster.js';
import {residentStyle} from './resident-style.js';
import {homeAt} from './home-plan.js';

const matrix=new THREE.Matrix4(),white=new THREE.Color();
const roles=new Map([[0xe46b66,'coat'],[0xd9a779,'skin'],[0x62423f,'hair'],[0xeabb84,'accent'],
  [0x587083,'pants'],[0x435869,'pants'],[0x46566a,'pants'],[0x526b7d,'pants'],[0x4e9589,'paint']]);
const paletteKeys=[...new Set(roles.values())];

// Several batches share each animated joint. Resolve its world transform once
// per resident, stopping at hidden poses such as seated legs or unused props.
function poseBranch(branch,pose){
  if(branch.pose===pose)return branch.visible;
  const {node,parent}=branch;branch.pose=pose;
  branch.visible=!!(node.visible||node.userData.wardrobe)&&(!parent||poseBranch(parent,pose));
  if(branch.visible){
    if(node.matrixAutoUpdate)node.updateMatrix();
    if(parent)node.matrixWorld.multiplyMatrices(parent.node.matrixWorld,node.matrix);
    else node.matrixWorld.copy(node.matrix);
  }
  return branch.visible;
}

// The same resident rig and geometry as a close-up avatar, submitted in shared
// batches. Logical residents remain in the simulation when outside the camera.
export class ResidentCrowd {
  constructor(parent,residents,seed){
    this.parent=parent;this.rig=avatar('#e46b66',undefined,undefined,{});this.car=vehicleArt('car');
    this.rig.rotation.order='YXZ';
    this.sources=[];this.batches=new Map();this.pose=0;
    const branches=new Map(),identity=new THREE.Matrix4();
    const branchFor=node=>{
      if(!branches.has(node))branches.set(node,{node,parent:node.parent?branchFor(node.parent):null,pose:-1});
      return branches.get(node);
    };
    this.styles=residents.map(p=>{
      const style=residentStyle(seed,p.homeLotId);
      for(const key of paletteKeys)style[key]=new THREE.Color(style[key]);
      return style;
    });
    const count=residents.length;
    this.frustum=new THREE.Frustum();this.clip=new THREE.Matrix4();this.sphere=new THREE.Sphere(new THREE.Vector3(),2.25);
    for(const rig of [this.rig,this.car])rig.traverse(m=>{if(!m.isMesh)return;
      const key=m.geometry.uuid+':'+m.material.uuid;
      let batch=this.batches.get(key);
      if(!batch){batch={geometry:m.geometry,material:m.material,capacity:0};this.batches.set(key,batch);}
      const pieces=[];
      for(let i=0;i<(m.isInstancedMesh?m.count:1);i++){
        const local=new THREE.Matrix4(),color=white.clone();
        if(m.isInstancedMesh){m.getMatrixAt(i,local);m.getColorAt(i,color);}
        pieces.push({local,color,role:roles.get(color.getHex())});
      }
      let variant,faceDetails=false;
      for(let o=m;o&&o!==rig;o=o.parent){
        if(o.userData.wardrobe)variant=o.userData.wardrobe;
        if(o.userData.faceDetails)faceDetails=true;
      }
      const wearers=variant?this.styles.reduce((n,style)=>n+Number(style[variant.key]===variant.value),0):count;
      batch.capacity+=pieces.length*(rig===this.car?Math.min(count,12):wearers);
      const joint=!m.matrixAutoUpdate&&m.matrix.equals(identity)?m.parent:m;
      faceDetails ||= variant?.key==='faceDetail'||variant?.key==='glasses';
      this.sources.push({source:m,batch,pieces,branch:branchFor(joint),variant,faceDetails,vehicle:rig===this.car});
    });
    for(const b of this.batches.values()){
      this.allocate(b,Math.max(1,b.capacity));
    }
    this.costumes=this.styles.map(style=>this.sources.filter(s=>!s.vehicle&&(!s.variant||style[s.variant.key]===s.variant.value)));
    this.distantCostumes=this.costumes.map(parts=>parts.filter(s=>!s.faceDetails));
    this.carParts=this.sources.filter(s=>s.vehicle);
  }
  allocate(b,capacity){
    const old=b.mesh;
    b.mesh=new THREE.InstancedMesh(b.geometry,b.material,capacity);
    b.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);b.mesh.matrixAutoUpdate=false;b.mesh.frustumCulled=false;
    b.mesh.setColorAt(0,white);b.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    if(old){
      b.mesh.instanceMatrix.array.set(old.instanceMatrix.array);
      b.mesh.instanceColor.array.set(old.instanceColor.array);
      this.parent.remove(old);old.dispose();
    }
    b.mesh.count=0;this.parent.add(b.mesh);b.capacity=capacity;
  }
  submit(sources,style){
    const pose=++this.pose;
    for(const {source,batch,pieces,branch} of sources){
      if(!source.visible||!poseBranch(branch,pose))continue;
      if(batch.used+pieces.length>batch.capacity)this.allocate(batch,Math.max(batch.used+pieces.length,batch.capacity*2));
      for(const {local,color,role} of pieces){
        matrix.multiplyMatrices(branch.node.matrixWorld,local);
        batch.mesh.setMatrixAt(batch.used,matrix);batch.mesh.setColorAt(batch.used++,role?style[role]:color);
      }
    }
  }
  render(people,camera,now,island,openRoof,pixelHeight){
    const dt=Math.min(.18,Math.max(0,(now-(this.last??now))/1000));this.last=now;
    if(camera){camera.updateMatrixWorld();this.frustum.setFromProjectionMatrix(this.clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));}
    // Keep the full silhouette. Only stop submitting facial markings once
    // the entire face is smaller than half a drawing-buffer pixel.
    const view=camera?.matrixWorldInverse.elements;
    const focal=camera?.isPerspectiveCamera&&pixelHeight?pixelHeight*camera.projectionMatrix.elements[5]/2:Infinity;
    for(const b of this.batches.values())b.used=0;
    this.visible=0;
    for(let i=0;i<people.length;i++){
      const person=people[i],p=person.position,state=person.userData;
      const dx=p.x-(state.x??p.x),dz=p.z-(state.z??p.z);
      state.x=p.x;state.z=p.z;
      this.sphere.center.copy(p);this.sphere.center.y+=.85;
      if(!person.visible||camera&&!this.frustum.intersectsSphere(this.sphere))continue;
      if(camera&&island&&!state.driving&&camera.position.distanceToSquared(p)>36*36){
        const inside=homeAt(island,p,-.68);
        if(inside&&inside.id!==openRoof&&camera.position.y>inside.y+inside.height+2)continue;
      }
      this.visible++;
      const distance=Math.hypot(dx,dz);
      if(!state.driving&&person.scale.y>=.9&&distance>.002&&distance<3)state.heading=Math.atan2(dx,dz);
      const rig=this.rig;rig.position.copy(p);rig.rotation.y=state.heading||0;rig.rotation.x=0;rig.rotation.z=0;
      const style=this.styles[i],seated=person.scale.y<.9||state.driving;
      rig.scale.set(style.width,style.height,style.width);
      rig.setStride(distance<3?distance:0,dt,seated,false,false,undefined,state,style);
      rig.poseResidentHead(style,now*.001,state.driving);
      rig.setSeated(seated);
      if(state.driving){
        const lastYaw=state.carYaw??rig.rotation.y,delta=rig.rotation.y-lastYaw;
        const turn=Math.atan2(Math.sin(delta),Math.cos(delta))*(1-Math.exp(-dt*12));
        state.carYaw=lastYaw+turn;rig.rotation.y=state.carYaw;
        const contact=island&&roadContact(island.tireHeight||island.deckHeight||island.sample,p.x,p.z,state.carYaw,state.roadContact??={});
        if(contact){rig.position.y=contact.y;rig.rotation.x=contact.pitch;rig.rotation.z=contact.roll;}
        this.car.position.copy(rig.position);this.car.rotation.copy(rig.rotation);
        state.wheelPhase=(state.wheelPhase||0)+(distance<8?distance/.28:0);
        const frontAngle=distance>.001?THREE.MathUtils.clamp(Math.atan2(turn*wheelbase,distance),-.60,.60):0;
        const speed=dt>0?distance/dt:0,braking=state.braking??((state.carSpeed||0)-speed>dt*3);
        const accel=dt>0&&state.carSpeed!==undefined?(speed-state.carSpeed)/dt:0;
        settleChassis(state,dt>0?speed*turn/dt:0,accel,dt);
        rig.setRide('car',0,state.roll,state.pitch);
        state.carSpeed=speed;
        this.car.updateRide(0,0,0,state.wheelPhase,braking,state.roll,state.pitch,frontAngle,contact?.travel);this.submit(this.carParts,style);
      }else{
        state.carYaw=undefined;state.carSpeed=undefined;
        if(this.wasDriver)rig.setDomestic('',0);
      }
      this.wasDriver=state.driving;
      const depth=view?-(view[2]*p.x+view[6]*p.y+view[10]*p.z+view[14]):0;
      const costumes=depth*.5>focal*.56*style.width*style.faceWidth?this.distantCostumes:this.costumes;
      this.submit(costumes[i],style);
    }
    for(const b of this.batches.values()){
      b.mesh.count=b.used;b.mesh.visible=b.used>0;
      if(b.used){
        b.mesh.instanceMatrix.addUpdateRange(0,b.used*16);b.mesh.instanceMatrix.needsUpdate=true;
        b.mesh.instanceColor.addUpdateRange(0,b.used*3);b.mesh.instanceColor.needsUpdate=true;
      }
    }
  }
  dispose(){
    for(const b of this.batches.values()){this.parent.remove(b.mesh);b.mesh.dispose();}
    for(const rig of [this.rig,this.car])rig.traverse(m=>{if(m.isInstancedMesh)m.dispose();else if(m.isMesh){m.geometry.dispose();m.material.dispose();}});
  }
}
