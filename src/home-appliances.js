import * as THREE from 'three';
import {fixtureOutlet,lamps,lampIsLit} from './home-fixtures.js';
import {potServings} from './home-meals.js';
import {TelevisionScreen} from './television.js';

function addSoup(parent,f){
  const surface=new THREE.Mesh(new THREE.CylinderGeometry(.136,.133,.012,16),new THREE.MeshLambertMaterial({color:'#ce803c'}));
  const outlet=fixtureOutlet(f,'cook');surface.position.set(f.x+outlet.x,1.327,f.z+outlet.z);
  const garnish=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.024,0),new THREE.MeshLambertMaterial(),8);
  const herb=new THREE.Object3D();
  for(let i=0;i<garnish.count;i++){
    const radius=.035+i*.009,angle=i*2.4;
    herb.position.set(radius*Math.cos(angle),.009,radius*Math.sin(angle));herb.scale.set(.95,.45,.72);herb.updateMatrix();
    garnish.setMatrixAt(i,herb.matrix);garnish.setColorAt(i,new THREE.Color(['#76914d','#f0ba74','#b75332'][i%3]));
  }
  surface.add(garnish);surface.visible=false;parent.add(surface);return surface;
}

function addLamp(parent,f,spec){
  const bedside=f.type==='nightstand';
  const shade=new THREE.Mesh(
    new THREE.CylinderGeometry(bedside?.12:.15,bedside?.21:.23,bedside?.25:.14,16),
    new THREE.MeshLambertMaterial({color:bedside?'#ead4a5':'#58816c',emissive:'#ffbd62',emissiveIntensity:0})
  );
  shade.position.set(f.x+spec.x,spec.shade,f.z+spec.z);
  // A warm pool on the supporting surface, bounded by its physical edges.
  const pool=new THREE.Mesh(new THREE.PlaneGeometry(f.w-.02,f.d-.02),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,uniforms:{strength:{value:0},origin:{value:new THREE.Vector2(.5+spec.x/f.w,.5-spec.z/f.d)}},
    vertexShader:'varying vec2 uvPoint;void main(){uvPoint=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 uvPoint;uniform vec2 origin;uniform float strength;void main(){vec2 d=uvPoint-origin;float a=exp(-4.2*dot(d,d));gl_FragColor=vec4(1.0,.75,.34,a*strength*.54);\n#include <colorspace_fragment>\n}'
  }));
  pool.position.set(f.x,spec.top+.004,f.z);pool.rotation.x=-Math.PI/2;pool.renderOrder=2;
  parent.add(shade,pool);
  return {kind:f.type,shade,pool,level:null};
}

function addFlow(parent,f,action){
  const steam=action==='cook',shower=action==='shower',n=steam?7:shower?18:5;
  const flow=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.5,0),new THREE.MeshBasicMaterial({
    color:steam?'#f8eee0':'#afe4e9',transparent:true,opacity:steam?.49:.78,depthWrite:false
  }),n);
  const p=fixtureOutlet(f,action);
  flow.position.set(f.x+p.x,p.y,f.z+p.z);flow.visible=false;flow.frustumCulled=false;
  flow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);parent.add(flow);
  return flow;
}

export class HomeAppliances {
  constructor(parent,home){
    this.home=home;this.lamps=[];this.flows=new Map();this.drop=new THREE.Object3D();
    const frame=this.frame=new THREE.Group();frame.position.set(home.x,home.y,home.z);frame.rotation.y=home.yaw;parent.add(frame);
    this.tv=new TelevisionScreen(frame,home);
    for(const f of home.furniture){
      if(f.type==='kitchen')this.soup=addSoup(frame,f);
      if(lamps[f.type])this.lamps.push(addLamp(frame,f,lamps[f.type]));
      const actions=f.type==='kitchen'?['cook','wash']:f.type==='shower'?['shower']:f.type==='basin'?['wash']:[];
      for(const action of actions)this.flows.set(f.id+'/'+action,addFlow(frame,f,action));
    }
  }
  dispose(){
    this.frame.removeFromParent();
    this.tv.texture?.dispose();
    this.frame.traverse(mesh=>{
      if(!mesh.isMesh)return;
      if(mesh.isInstancedMesh)mesh.dispose();
      mesh.geometry.dispose();mesh.material.dispose();
    });
  }
  update(session){
    const time=session?.time||0,dt=Math.min(.1,Math.max(0,time-(this.lastTime??time)));
    this.lastTime=time;
    this.tv.update(session?.layout.homeTV?.[this.home.id]||0,time);
    if(this.soup){
      const bowls=session?potServings(session,this.home.id):0;
      this.soup.visible=bowls>0;this.soup.scale.x=this.soup.scale.z=bowls===1?.89:1;
    }
    for(const lamp of this.lamps){
      const target=lampIsLit(session?.layout,this.home.id,lamp.kind)?1:0;
      lamp.level=lamp.level===null?target:THREE.MathUtils.damp(lamp.level,target,18,dt);
      lamp.shade.material.emissiveIntensity=lamp.level*.9;
      lamp.pool.visible=lamp.level>.005;lamp.pool.material.uniforms.strength.value=lamp.level;
    }
    for(const flow of this.flows.values())flow.visible=false;
    if(!session)return;
    for(const actor of session.actors.values()){
      if(actor.using?.lot!==this.home.id)continue;
      const flow=this.flows.get(actor.using.object+'/'+actor.activity);
      if(!flow)continue;
      flow.visible=true;
      const steam=actor.activity==='cook',shower=actor.activity==='shower';
      for(let i=0;i<flow.count;i++){
        const t=(time*(steam?.77:shower?1.65:3)+i*.618034)%1,angle=i*2.39996+t*(steam?1.8:0);
        const r=steam?.04+t*.075:shower?.04+t*(.06+i%4*.025):.009;
        const y=steam?t*.40:-(shower?1.76:actor.using.object==='kitchen'?.32:.23)*t;
        this.drop.position.set(Math.cos(angle)*r,y,Math.sin(angle)*r);
        const w=steam?.028+.055*Math.sin(Math.PI*t):.021;
        this.drop.scale.set(w,steam?w*1.3:shower?.12:.09,w);this.drop.updateMatrix();
        flow.setMatrixAt(i,this.drop.matrix);
      }
      flow.instanceMatrix.needsUpdate=true;
    }
  }
}
