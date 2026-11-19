import * as THREE from 'three';
import {halfTrack,halfWheelbase} from '../packages/sim/src/road-contact.js';

// A single strip buffer covers all player cars. Each pair of rear tire marks
// expires in the shader, even if its driver has left the street.
export function tireTracks(scene,heightAt){
  const capacity=192,points=new Float32Array(capacity*8*3);
  const births=new Float32Array(capacity*8),indices=[];
  for(let i=0;i<capacity*8;i+=4)indices.push(i,i+1,i+2,i+2,i+1,i+3);
  const geometry=new THREE.BufferGeometry();
  const position=new THREE.BufferAttribute(points,3).setUsage(THREE.DynamicDrawUsage);
  const born=new THREE.BufferAttribute(births,1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',position);geometry.setAttribute('birth',born);geometry.setIndex(indices);
  const clock={value:0};
  const material=new THREE.MeshBasicMaterial({color:0x524b3c,transparent:true,depthWrite:false,
    side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  material.onBeforeCompile=shader=>{
    shader.uniforms.trackClock=clock;
    shader.vertexShader='attribute float birth; varying float trackBirth;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntrackBirth=birth;');
    shader.fragmentShader='uniform float trackClock; varying float trackBirth;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= .43*(1.-smoothstep(1.,5.,trackClock-trackBirth));');
  };
  const mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;mesh.visible=false;mesh.name='tire-tracks';scene.add(mesh);
  let cursor=0,count=0,last=-Infinity;
  function rearPatch(pose){
    const sin=Math.sin(pose.yaw),cos=Math.cos(pose.yaw);
    const x=pose.x-halfWheelbase*sin,z=pose.z-halfWheelbase*cos;
    const corners=[];
    for(const hub of [-halfTrack,halfTrack])for(const edge of [-.065,.065]){
      const px=x+(hub+edge)*cos,pz=z-(hub+edge)*sin;
      corners.push(px,heightAt(px,pz)+.032,pz);
    }
    return corners;
  }
  return {
    hide(){mesh.visible=false;},
    tick(now){clock.value=now*.001;mesh.visible=clock.value-last<5;},
    follow(pose,sliding){
      if(!sliding||!pose.distance||pose.distance>3){pose.lastPatch=null;return;}
      const old=pose.lastPatch;
      if(old&&Math.hypot(pose.x-old.x,pose.z-old.z)<.23)return;
      const corners=rearPatch(pose);
      if(old&&clock.value-old.time<.5&&Math.hypot(pose.x-old.x,pose.z-old.z)<3){
        const start=cursor*8;
        for(let tire=0;tire<2;tire++){
          const offset=tire*6,index=start*3+tire*12;
          for(let k=0;k<6;k++){points[index+k]=old.corners[offset+k];points[index+6+k]=corners[offset+k];}
        }
        births.fill(clock.value,start,start+8);
        position.addUpdateRange(start*3,24);born.addUpdateRange(start,8);
        position.needsUpdate=true;born.needsUpdate=true;
        cursor=(cursor+1)%capacity;count=Math.min(count+1,capacity);last=clock.value;
        geometry.setDrawRange(0,count*12);mesh.visible=true;
      }
      pose.lastPatch={x:pose.x,z:pose.z,corners,time:clock.value};
    },
    dispose(){scene.remove(mesh);geometry.dispose();material.dispose();}
  };
}
