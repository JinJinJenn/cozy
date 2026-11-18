import * as THREE from 'three';
import {avatar} from './street-art.js';

const coats=['#e46b66','#428ca4','#dfaa43','#7967a4','#559784','#c15a81','#536da1','#c77b4b'];
const matrix=new THREE.Matrix4(),color=new THREE.Color(),coat=new THREE.Color(coats[0]);
const skin=new THREE.Color('#d9a779'),hair=new THREE.Color('#62423f');
const skins=['#e1ac89','#b67856','#f1c5a3','#965e46'],hairs=['#654237','#453a40','#ab7045','#543f35'];

// The same resident rig and geometry as a close-up avatar, submitted in shared
// batches. Logical residents remain in the simulation when outside the camera.
export class ResidentCrowd {
  constructor(parent,count){
    this.parent=parent;this.rig=avatar(coats[0]);this.sources=[];this.batches=new Map();
    this.frustum=new THREE.Frustum();this.clip=new THREE.Matrix4();this.sphere=new THREE.Sphere(new THREE.Vector3(),1.9);
    this.rig.traverse(m=>{if(!m.isMesh)return;
      const key=m.geometry.uuid+':'+m.material.uuid;
      let batch=this.batches.get(key);
      if(!batch){batch={geometry:m.geometry,material:m.material,capacity:0};this.batches.set(key,batch);}
      batch.capacity+=m.isInstancedMesh?m.count:1;this.sources.push({source:m,batch});
    });
    for(const b of this.batches.values()){
      b.mesh=new THREE.InstancedMesh(b.geometry,b.material,b.capacity*count);
      b.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);b.mesh.matrixAutoUpdate=false;b.mesh.frustumCulled=false;
      if(count)b.mesh.setColorAt(0,new THREE.Color('#ffffff'));
      b.mesh.count=0;parent.add(b.mesh);
    }
  }
  render(people,camera,now){
    const dt=Math.min(.18,Math.max(0,(now-(this.last??now))/1000));this.last=now;
    if(camera){camera.updateMatrixWorld();this.frustum.setFromProjectionMatrix(this.clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));}
    for(const b of this.batches.values())b.used=0;
    this.visible=0;
    for(let i=0;i<people.length;i++){
      const person=people[i],p=person.position,state=person.userData;
      const distance=Math.hypot(p.x-(state.x??p.x),p.z-(state.z??p.z));
      const dx=p.x-(state.x??p.x),dz=p.z-(state.z??p.z);state.x=p.x;state.z=p.z;
      this.sphere.center.copy(p);this.sphere.center.y+=.85;
      if(!person.visible||camera&&!this.frustum.intersectsSphere(this.sphere))continue;
      this.visible++;
      if(person.scale.y>=.9&&distance>.002&&distance<3)state.heading=Math.atan2(dx,dz);
      const rig=this.rig;rig.position.copy(p);rig.rotation.y=state.heading||0;
      rig.setStride(distance<3?distance:0,dt,person.scale.y<.9,false,false,undefined,state);
      rig.setSeated(person.scale.y<.9);rig.updateMatrixWorld(true);
      for(const {source,batch} of this.sources){
        let visible=true;for(let o=source;o&&o!==rig;o=o.parent)if(!o.visible){visible=false;break;}
        if(!visible)continue;
        for(let n=0;n<(source.isInstancedMesh?source.count:1);n++){
          if(source.isInstancedMesh){source.getMatrixAt(n,matrix);matrix.premultiply(source.matrixWorld);source.getColorAt(n,color);}
          else{matrix.copy(source.matrixWorld);color.set('#ffffff');}
          if(color.equals(coat))color.set(coats[i%coats.length]);
          else if(color.equals(skin))color.set(skins[Math.floor(i/8)%skins.length]);
          else if(color.equals(hair))color.set(hairs[Math.floor(i/3)%hairs.length]);
          batch.mesh.setMatrixAt(batch.used,matrix);batch.mesh.setColorAt(batch.used++,color);
        }
      }
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
    this.rig.traverse(m=>{if(m.isInstancedMesh)m.dispose();else if(m.isMesh){m.geometry.dispose();m.material.dispose();}});
  }
}
