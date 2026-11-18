import * as THREE from 'three';
export const box=new THREE.BoxGeometry(1,1,1),ball=new THREE.IcosahedronGeometry(.5,1);
const round=new THREE.CylinderGeometry(.5,.48,1,12);
export const roof=new THREE.BufferGeometry();
roof.setAttribute('position',new THREE.Float32BufferAttribute([
  -.5,0,.5,.5,0,.5,0,1,.5, -.5,0,-.5,0,1,-.5,.5,0,-.5,
  -.5,0,-.5,-.5,0,.5,0,1,.5,-.5,0,-.5,0,1,.5,0,1,-.5,
  .5,0,.5,.5,0,-.5,0,1,-.5,.5,0,.5,0,1,-.5,0,1,.5
],3));roof.computeVertexNormals();
const material=new THREE.MeshLambertMaterial();
// A scalloped crown with a shaded underside. The silhouette and leaf colour are
// shared by street and woodland trees and never change with camera distance.
const foliage=new THREE.IcosahedronGeometry(.5,2);
const foliageColors=[],leafPos=foliage.attributes.position;
for(let i=0;i<leafPos.count;i++){
  const x=leafPos.getX(i),y=leafPos.getY(i),z=leafPos.getZ(i);
  const lobe=Math.sin(12*x+3*z)*Math.cos(10*z-5*y)+.55*Math.cos(15*y-5*x);
  const r=1+.105*lobe;
  leafPos.setXYZ(i,x*r,y*r,z*r);
  const light=.85+.22*y+.075*lobe;foliageColors.push(light*.99,light,light*.94);
}
foliage.setAttribute('color',new THREE.Float32BufferAttribute(foliageColors,3));
const leafMaterial=new THREE.MeshLambertMaterial({vertexColors:true});
leafMaterial.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 crown;\n'+shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\ncrown=position;');
  shader.fragmentShader='varying vec3 crown;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec2 leafUV=vec2(crown.x+.45*crown.z,crown.y-.36*crown.z)*24.;
    leafUV.x+=.50*mod(floor(leafUV.y),2.);
    vec2 leaf=fract(leafUV)-.5;
    float spray=fract(sin(dot(floor(leafUV),vec2(12.99,78.23)))*4375.21);
    float speck=(1.-smoothstep(.16,.42,length(vec2(leaf.x+leaf.y*.45,leaf.y*1.55))))*smoothstep(.60,.95,spray);
    diffuseColor.rgb*=1.+.19*speck*(1.-smoothstep(.16,.55,max(fwidth(leafUV.x),fwidth(leafUV.y))));`);
};
const clapboard=box.clone();
function surfaceMaterial(kind){
  const finish=material.clone();
  finish.customProgramCacheKey=()=>kind;
  finish.onBeforeCompile=shader=>{
    const varying='varying vec2 surfaceUV;\n';
    shader.vertexShader=varying+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 metre=position*vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      surfaceUV=vec2(abs(normal.x)>abs(normal.z)?metre.z:metre.x,metre.y);`);
    const paint=kind==='slate'?`
      vec2 tile=surfaceUV/vec2(.41,.19);
      tile.x+=.5*mod(floor(tile.y),2.);
      vec2 edge=abs(fract(tile+.5)-.5);
      float mortar=1.-min(smoothstep(.012,.075,edge.x),smoothstep(.025,.105,edge.y));
      float chip=fract(sin(dot(floor(tile),vec2(12.9898,78.233)))*43758.5453);
      float value=.93+.12*chip-.20*mortar+.07*(fract(tile.y)-.5);
    `:`
      float row=surfaceUV.y/.175;
      float seam=1.-smoothstep(.025,.13,abs(fract(row+.5)-.5));
      float value=.98+.07*fract(row)-.22*seam;
    `;
    shader.fragmentShader=varying+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      ${paint}
      float fade=1.-smoothstep(.018,.12,max(fwidth(surfaceUV.x),fwidth(surfaceUV.y)));
      diffuseColor.rgb*=mix(1.,value,fade);`);
  };
  return finish;
}
const sidingFinish=surfaceMaterial('siding'),roofFinish=surfaceMaterial('slate');
roof.userData.slate=true;
export const helper=new THREE.Object3D();
export class Pieces {
  constructor(parent){this.parent=parent;this.batches=new Map();}
  frame(x,y,z,yaw=0){
    const local=new Pieces(this.parent);
    local.batches=this.batches;
    local.matrix=new THREE.Matrix4().makeRotationY(yaw).setPosition(x,y,z);
    if(this.matrix)local.matrix.premultiply(this.matrix);
    local.visibility=this.visibility;
    return local;
  }
  tagged(visibility){const local=new Pieces(this.parent);local.batches=this.batches;local.matrix=this.matrix;local.visibility=visibility;return local;}
  put(shape,x,y,z,w,h,d,color,ry=0,rz=0,rx=0){
    let b=this.batches.get(shape);if(!b)this.batches.set(shape,b=[]);
    helper.position.set(x,y,z);helper.scale.set(w,h,d);helper.rotation.set(rx,ry,rz);helper.updateMatrix();
    const matrix=helper.matrix.clone();
    if(this.matrix)matrix.premultiply(this.matrix);
    b.push([matrix,new THREE.Color(color),this.visibility]);
  }
  box(...args){this.put(box,...args);}
  clad(...args){this.put(clapboard,...args);}
  round(...args){this.put(round,...args);}
  ball(...args){this.put(ball,...args);}
  leaves(...args){this.put(foliage,...args);}
  finish(){for(const [shape,items] of this.batches){const mesh=new THREE.InstancedMesh(shape,shape===clapboard?sidingFinish:shape===foliage?leafMaterial:shape.userData.slate?roofFinish:material,items.length);
    items.forEach(([m,c,visibility],i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,c);if(visibility)(visibility.instances??=[]).push({mesh,index:i,matrix:m});});mesh.computeBoundingSphere();mesh.castShadow=true;mesh.receiveShadow=true;
    // Instance transforms carry the geometry. The batch's local transform never
    // changes, even when its animated parent does.
    mesh.matrixAutoUpdate=false;this.parent.add(mesh);}}
}
const hiddenMatrix=new THREE.Matrix4().makeScale(0,0,0);
export function setPieceVisibility(handle,visible){
  if(handle.visible===visible)return;handle.visible=visible;
  for(const {mesh,index,matrix} of handle.instances||[]){mesh.setMatrixAt(index,visible?matrix:hiddenMatrix);mesh.instanceMatrix.needsUpdate=true;}
}
