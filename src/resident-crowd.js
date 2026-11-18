import * as THREE from 'three';
import {avatar} from './street-art.js';
import {vehicleArt} from './vehicle-art.js';
import {residentStyle} from './resident-style.js';
import {homeAt} from './home-plan.js';

const matrix=new THREE.Matrix4(),white=new THREE.Color();
const roles=new Map([[0xe46b66,'coat'],[0xd9a779,'skin'],[0x62423f,'hair'],[0xeabb84,'accent'],
  [0x587083,'pants'],[0x435869,'pants'],[0x46566a,'pants'],[0x526b7d,'pants'],[0x4e9589,'paint']]);
const paletteKeys=[...new Set(roles.values())];

// The same resident rig and geometry as a close-up avatar, submitted in shared
// batches. Logical residents remain in the simulation when outside the camera.
export class ResidentCrowd {
  constructor(parent,residents,seed){
    this.parent=parent;this.rig=avatar('#e46b66',undefined,undefined,{});this.car=vehicleArt('car');
    this.sources=[];this.batches=new Map();
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
      const parents=[];let variant;
      for(let o=m;o&&o!==rig;o=o.parent){
        if(o.userData.wardrobe)variant=o.userData.wardrobe;else parents.push(o);
      }
      batch.capacity+=pieces.length*(rig===this.car?Math.min(count,12):count);
      this.sources.push({source:m,batch,pieces,parents,variant,vehicle:rig===this.car});
    });
    for(const b of this.batches.values()){
      this.allocate(b,Math.max(1,b.capacity));
    }
    this.costumes=this.styles.map(style=>this.sources.filter(s=>!s.vehicle&&(!s.variant||style[s.variant.key]===s.variant.value)));
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
    for(const {source,batch,pieces,parents} of sources){
      if(parents.some(p=>!p.visible))continue;
      if(batch.used+pieces.length>batch.capacity)this.allocate(batch,Math.max(batch.used+pieces.length,batch.capacity*2));
      for(const {local,color,role} of pieces){
        matrix.multiplyMatrices(source.matrixWorld,local);
        batch.mesh.setMatrixAt(batch.used,matrix);batch.mesh.setColorAt(batch.used++,role?style[role]:color);
      }
    }
  }
  render(people,camera,now,island,openRoof){
    const dt=Math.min(.18,Math.max(0,(now-(this.last??now))/1000));this.last=now;
    if(camera){camera.updateMatrixWorld();this.frustum.setFromProjectionMatrix(this.clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));}
    for(const b of this.batches.values())b.used=0;
    this.visible=0;
    for(let i=0;i<people.length;i++){
      const person=people[i],p=person.position,state=person.userData;
      const dx=p.x-(state.x??p.x),dz=p.z-(state.z??p.z);state.x=p.x;state.z=p.z;
      this.sphere.center.copy(p);this.sphere.center.y+=.85;
      if(!person.visible||camera&&!this.frustum.intersectsSphere(this.sphere))continue;
      if(camera&&island&&!state.driving&&camera.position.distanceToSquared(p)>36*36){
        const inside=homeAt(island,p,-.68);
        if(inside&&inside.id!==openRoof&&camera.position.y>inside.y+inside.height+2)continue;
      }
      this.visible++;
      const distance=Math.hypot(dx,dz);
      if(!state.driving&&person.scale.y>=.9&&distance>.002&&distance<3)state.heading=Math.atan2(dx,dz);
      const rig=this.rig;rig.position.copy(p);rig.rotation.y=state.heading||0;
      const style=this.styles[i],seated=person.scale.y<.9||state.driving;
      rig.scale.set(style.width,style.height,style.width);
      rig.setStride(distance<3?distance:0,dt,seated,false,false,undefined,state);
      rig.setSeated(seated);
      if(state.driving){
        const lastYaw=state.carYaw??rig.rotation.y,delta=rig.rotation.y-lastYaw;
        const turn=Math.atan2(Math.sin(delta),Math.cos(delta))*(1-Math.exp(-dt*12));
        state.carYaw=lastYaw+turn;rig.rotation.y=state.carYaw;
        rig.setRide('car',0);this.car.position.copy(p);this.car.rotation.y=state.carYaw;
        state.wheelPhase=(state.wheelPhase||0)+(distance<8?distance/.28:0);
        const steer=distance>.001?THREE.MathUtils.clamp(-Math.atan2(turn*2.02,distance)/.62,-1,1):0;
        const speed=dt>0?distance/dt:0,braking=(state.carSpeed||0)-speed>dt*3;
        state.carSpeed=speed;
        this.car.updateRide(0,0,steer,state.wheelPhase,braking);this.car.updateMatrixWorld(true);this.submit(this.carParts,style);
      }else{
        state.carYaw=undefined;state.carSpeed=0;
        if(this.wasDriver)rig.setDomestic('',0);
      }
      this.wasDriver=state.driving;rig.updateMatrixWorld(true);
      this.submit(this.costumes[i],style);
    }
    for(const b of this.batches.values()){
      b.mesh.count=b.used;b.mesh.visible=b.used>0;
      if(b.used){
        b.mesh.instanceMatrix.addUpdateRange(0,b.used*16);b.mesh.instanceMatrix.needsUpdate=true;
        b.mesh.instanceColor.addUpdateRange(0,b.used*3);b.mesh.instanceColor.needsUpdate=true;
      }
    }
  }
  async warm(renderer,scene,camera){
    const previous=[];
    for(const b of this.batches.values()){previous.push(b.mesh.visible);b.mesh.visible=true;}
    try{await renderer.compileAsync(scene,camera);}
    finally{let i=0;for(const b of this.batches.values())b.mesh.visible=previous[i++];}
  }
  dispose(){
    for(const b of this.batches.values()){this.parent.remove(b.mesh);b.mesh.dispose();}
    for(const rig of [this.rig,this.car])rig.traverse(m=>{if(m.isInstancedMesh)m.dispose();else if(m.isMesh){m.geometry.dispose();m.material.dispose();}});
  }
}
