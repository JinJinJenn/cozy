import * as THREE from 'three';

// One detailed lobe at every viewing distance. The original position is retained
// as the leaf-pattern coordinate when several lobes become a single crown.
export const foliage=new THREE.IcosahedronGeometry(.5,2);
const colors=[],positions=foliage.attributes.position;
for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
  const lobe=Math.sin(12*x+3*z)*Math.cos(10*z-5*y)+.55*Math.cos(15*y-5*x),r=1+.105*lobe;
  positions.setXYZ(i,x*r,y*r,z*r);
  const light=.85+.22*y+.075*lobe;colors.push(light*.99,light,light*.94);
}
foliage.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
foliage.setAttribute('leafPosition',positions.clone());
foliage.userData.foliage=true;

export const leafMaterial=new THREE.MeshLambertMaterial({vertexColors:true});
leafMaterial.onBeforeCompile=shader=>{
  shader.vertexShader='attribute vec3 leafPosition;\nvarying vec3 crown;\n'+shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\ncrown=leafPosition;');
  shader.fragmentShader='varying vec3 crown;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec2 leafUV=vec2(crown.x+.45*crown.z,crown.y-.36*crown.z)*24.;
    leafUV.x+=.50*mod(floor(leafUV.y),2.);
    vec2 leaf=fract(leafUV)-.5;
    float spray=fract(sin(dot(floor(leafUV),vec2(12.99,78.23)))*4375.21);
    float speck=(1.-smoothstep(.16,.42,length(vec2(leaf.x+leaf.y*.45,leaf.y*1.55))))*smoothstep(.60,.95,spray);
    diffuseColor.rgb*=1.+.19*speck*(1.-smoothstep(.16,.55,max(fwidth(leafUV.x),fwidth(leafUV.y))));`);
};

const point=new THREE.Vector3(),normal=new THREE.Vector3();
const planes=[];
for(let i=0;i<positions.count;i+=3){
  const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(positions,i+k));
  planes.push(new THREE.Plane().setFromCoplanarPoints(...v));
}

// The intersection of a closed lobe's inward face half-spaces is a conservative
// convex interior, including for this scalloped (non-convex) surface. Only remove
// a whole triangle if all three vertices lie strictly inside that interior of
// another lobe. Every exposed triangle, normal, colour and leaf coordinate stays.
// Call once per tree design, then instance the returned geometry across the town.
export function crownGeometry(lobes){
  const parts=lobes.map(({position,scale,yaw=0,color})=>{
    const matrix=new THREE.Matrix4().makeRotationY(yaw).scale(new THREE.Vector3(...scale)).setPosition(...position);
    return {matrix,inverse:matrix.clone().invert(),normals:new THREE.Matrix3().getNormalMatrix(matrix),
      color:new THREE.Color(color),points:Array.from({length:positions.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix))};
  });
  const out={position:[],normal:[],color:[],leafPosition:[]},normals=foliage.attributes.normal,shade=foliage.attributes.color;
  let removed=0;
  for(const [index,part] of parts.entries())for(let t=0;t<positions.count;t+=3){
    const covered=parts.some((other,j)=>j!==index&&[0,1,2].every(k=>{
      point.copy(part.points[t+k]).applyMatrix4(other.inverse);
      return planes.every(plane=>plane.distanceToPoint(point)<-1e-5);
    }));
    if(covered){removed++;continue;}
    for(let k=0;k<3;k++){
      const i=t+k;out.position.push(...part.points[i]);
      normal.fromBufferAttribute(normals,i).applyMatrix3(part.normals).normalize();out.normal.push(...normal);
      out.color.push(shade.getX(i)*part.color.r,shade.getY(i)*part.color.g,shade.getZ(i)*part.color.b);
      out.leafPosition.push(positions.getX(i),positions.getY(i),positions.getZ(i));
    }
  }
  const geometry=new THREE.BufferGeometry();
  for(const [name,values] of Object.entries(out))geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,3));
  geometry.userData={foliage:true,sourceTriangles:positions.count/3*parts.length,removedTriangles:removed};
  geometry.computeBoundingSphere();return geometry;
}
