import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {crownGeometry,foliage} from '../src/foliage.js';

test('buried foliage faces are removed without changing the crown surface',()=>{
  const lobes=[
    {position:[-.35,.2,0],scale:[2,1.4,1.7],yaw:.4,color:'#628661'},
    {position:[.35,.35,.2],scale:[1.7,1.9,1.5],yaw:1.3,color:'#87a279'},
    {position:[0,1,0],scale:[1.6,1.4,1.8],yaw:2.1,color:'#52755f'},
  ];
  const material=new THREE.MeshBasicMaterial(),original=new THREE.Group();
  for(const lobe of lobes){const mesh=new THREE.Mesh(foliage,material);mesh.position.set(...lobe.position);
    mesh.scale.set(...lobe.scale);mesh.rotation.y=lobe.yaw;original.add(mesh);}
  const compact=crownGeometry(lobes),result=new THREE.Mesh(compact,material);
  original.updateMatrixWorld(true);result.updateMatrixWorld(true);
  assert.ok(compact.userData.removedTriangles>60);
  assert.equal(compact.attributes.position.count/3,compact.userData.sourceTriangles-compact.userData.removedTriangles);
  const ray=new THREE.Raycaster(),direction=new THREE.Vector3(),up=new THREE.Vector3(),right=new THREE.Vector3(),origin=new THREE.Vector3();
  let hitCount=0;
  // Compare nearest surfaces from above, below, and around the full crown. This
  // detects holes in the union even when silhouette vertices were retained.
  for(let view=0;view<32;view++){
    const y=1-2*(view+.5)/32,phi=view*2.39996323;
    direction.set(Math.sqrt(1-y*y)*Math.cos(phi),y,Math.sqrt(1-y*y)*Math.sin(phi));
    right.crossVectors(direction,new THREE.Vector3(0,1,0)).normalize();up.crossVectors(right,direction);
    for(let x=-12;x<=12;x++)for(let z=-12;z<=12;z++){
      origin.set(0,.5,0).addScaledVector(direction,5).addScaledVector(right,x*.12).addScaledVector(up,z*.12);
      ray.set(origin,direction.clone().negate());
      const before=ray.intersectObject(original)[0],after=ray.intersectObject(result)[0];
      assert.equal(!!after,!!before,`surface missing at ${view}/${x}/${z}`);
      if(before){hitCount++;assert.ok(Math.abs(before.distance-after.distance)<1e-5,'visible surface moved');}
    }
  }
  assert.ok(hitCount>5000);
  for(const attribute of Object.values(compact.attributes))assert.ok(attribute.array.every(Number.isFinite));
});
