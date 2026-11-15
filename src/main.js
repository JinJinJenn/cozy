import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createIsland,SEA_LEVEL} from './island.js';
import {PRESETS,PRESET_IDS} from './presets.js';
import {buildTerrainChunk,buildWaterChunk} from './chunks.js';
import {drawMinimap,drawMarker} from './minimap.js';

const params=new URLSearchParams(location.search);
if(params.has('shot')) document.body.classList.add('shot');
const $=id=>document.getElementById(id);
const canvas=$('gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:params.has('shot')});
renderer.setPixelRatio(Math.min(devicePixelRatio,params.has('shot')?1:2));
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(48,1,1,9000);
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=.08;controls.maxPolarAngle=Math.PI/2-.01;controls.minDistance=8;controls.maxDistance=4200;

const waterMat=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,
  uniforms:{uTime:{value:0},uShallow:{value:new THREE.Color()},uDeep:{value:new THREE.Color()},uFoam:{value:new THREE.Color()},uFog:{value:new THREE.Color()},uFogNear:{value:1100},uFogFar:{value:5200}},
  vertexShader:`attribute float depth;varying float vD;varying vec3 vW;varying float vDist;
    void main(){vD=depth;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vec4 mv=viewMatrix*w;vDist=length(mv.xyz);gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform float uTime,uFogNear,uFogFar;uniform vec3 uShallow,uDeep,uFoam,uFog;varying float vD;varying vec3 vW;varying float vDist;
    void main(){
      float d=vD; if(d<-0.02) discard;
      float t=1.-exp(-max(d,0.)*.11);
      vec3 col=mix(uShallow,uDeep,t);
      float w1=sin(uTime*.9+vW.x*.12+vW.z*.07),w2=sin(uTime*1.3-vW.z*.15+vW.x*.05);
      float band=.55+.22*w1+.14*w2;
      float foam=1.-smoothstep(band*.2,band*.55,d);
      float line=smoothstep(.0,.12,d)*(1.-smoothstep(.12,.34,d)); // thin bright shoreline
      col=mix(col,uFoam,clamp(foam*.7+line*.35,0.,1.));
      // soft stylised glints
      float g=sin(vW.x*.9+uTime*1.1)*sin(vW.z*.8-uTime*.9);
      col+=vec3(.06)*smoothstep(.82,1.,g)*(1.-t*.6);
      float a=mix(.5,.94,t)*smoothstep(-.02,.1,d);
      a=max(a,foam*.85*smoothstep(-.02,.06,d));
      float f=smoothstep(uFogNear,uFogFar,vDist);
      gl_FragColor=vec4(mix(col,uFog,f),a);
    }`,
});
const terrainMat=new THREE.MeshBasicMaterial({vertexColors:true,fog:true});

// open-ocean frame so the world edge fades into fog instead of showing a hard rim
const oceanMat=new THREE.MeshBasicMaterial({color:0x3f8fb1,fog:true});
const floorMat=new THREE.MeshBasicMaterial({color:0x2a6f86,fog:true});
const floorPlane=new THREE.Mesh(new THREE.PlaneGeometry(90000,90000).rotateX(-Math.PI/2),floorMat);floorPlane.position.y=-75;scene.add(floorPlane);
const ocean=new THREE.Mesh(new THREE.BufferGeometry(),oceanMat);ocean.position.y=-.6;scene.add(ocean);
function buildOcean(half){
  const B=40000,quads=[[-B,-B,B,-half],[-B,half,B,B],[-B,-half,-half,half],[half,-half,B,half]],pos=[],idx=[];
  for(const [x0,z0,x1,z1] of quads){const o=pos.length/3;pos.push(x0,0,z0,x1,0,z0,x0,0,z1,x1,0,z1);idx.push(o,o+2,o+1,o+1,o+2,o+3);}
  ocean.geometry.dispose();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);ocean.geometry=g;
}
let island=null,chunkMap=new Map(),group=new THREE.Group();scene.add(group);
let streamRadius=1500;

function lodFor(d){return d<260?33:d<620?17:d<1300?9:5;}
function chunkKey(cx,cz){return cx+','+cz;}
function disposeChunk(c){group.remove(c.terrain);c.terrain.geometry.dispose();if(c.water){group.remove(c.water);c.water.geometry.dispose();}}
function makeMesh(data,isWater){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(data.positions,3));
  if(isWater) g.setAttribute('depth',new THREE.BufferAttribute(data.depth,1));
  else g.setAttribute('color',new THREE.BufferAttribute(data.colors,3));
  g.setIndex(new THREE.BufferAttribute(data.indices,1));
  const m=new THREE.Mesh(g,isWater?waterMat:terrainMat);
  m.frustumCulled=false;if(isWater)m.renderOrder=2;
  return m;
}
function wanted(){
  if(!island) return [];
  const S=island.chunkSize,max=Math.floor(island.half/S),list=[];
  const tx=controls.target.x,tz=controls.target.z,cp=camera.position;
  for(let cz=-max;cz<max;cz++)for(let cx=-max;cx<max;cx++){
    const mx=(cx+.5)*S,mz=(cz+.5)*S;
    const d=Math.min(Math.hypot(mx-tx,mz-tz),Math.hypot(mx-cp.x,mz-cp.z)*.9);
    if(d>streamRadius) continue;
    list.push({cx,cz,d,res:lodFor(d)});
  }
  list.sort((a,b)=>a.d-b.d);
  return list;
}
function updateChunks(budget=6){
  const want=wanted(),keep=new Set();
  let built=0,pending=0;
  for(const w of want){
    const k=chunkKey(w.cx,w.cz);keep.add(k);
    const cur=chunkMap.get(k);
    if(cur&&cur.res===w.res) continue;
    if(built>=budget){pending++;continue;}
    if(cur) disposeChunk(cur);
    const t=buildTerrainChunk(island,w.cx,w.cz,w.res);
    const tm=makeMesh(t,false);group.add(tm);
    const wd=buildWaterChunk(island,w.cx,w.cz,w.res>=33?65:w.res>=17?49:w.res>=9?33:17);
    let wm=null;if(wd){wm=makeMesh(wd,true);group.add(wm);}
    chunkMap.set(k,{terrain:tm,water:wm,res:w.res});built++;
  }
  for(const [k,c] of chunkMap) if(!keep.has(k)){disposeChunk(c);chunkMap.delete(k);}
  return pending;
}
function flushChunks(){let p;do{p=updateChunks(400);}while(p>0);}

function applyPalette(p){
  const c=new THREE.Color(p.sky);scene.background=c;
  scene.fog=new THREE.Fog(new THREE.Color(p.fog),1100,5200);scene.background=new THREE.Color(p.fog);oceanMat.color.set(p.deep).lerp(new THREE.Color('#8fb9b4'),.22).multiplyScalar(.82);floorMat.color.copy(oceanMat.color).multiplyScalar(.6);
  waterMat.uniforms.uShallow.value.set(p.shallow);waterMat.uniforms.uDeep.value.set(p.deep);waterMat.uniforms.uFoam.value.set(p.foam);waterMat.uniforms.uFog.value.set(p.fog);
}
function clampCamera(){
  if(!island) return;
  const g=island.sample(camera.position.x,camera.position.z);
  const floor=Math.max(g,SEA_LEVEL)+3;
  if(camera.position.y<floor) camera.position.y=floor;
}
function setView(name,opts={}){
  if(!island) return;
  const pc=island.preset.camera,half=island.half;
  const dir=(az,el)=>new THREE.Vector3(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az));
  let tgt,pos;
  if(name==='top'){
    tgt=new THREE.Vector3(0,0,0);pos=tgt.clone().add(new THREE.Vector3(.001,island.size*1.05,.001));
  }else if(name==='shore'){
    let best=null;
    const n=Math.round(2*Math.PI/.3),want=opts.az;
    for(let a=0;a<n;a++){
      const ang=a*.3,s=island.shoreAt(ang);if(s.d<half*.1||s.d>half*.9) continue;
      let sum=0;for(let t=0;t<=1;t+=.1)sum+=island.sample(Math.cos(ang)*s.d*t,Math.sin(ang)*s.d*t);
      const sl=island.slope(s.x,s.z,8),score=want!=null?-Math.abs(Math.atan2(Math.sin(ang-want),Math.cos(ang-want))):sum/11+s.d*.01-(sl>.3?200:sl*60);
      if(!best||score>best.score) best={ang,s,score};
    }
    best=best||{ang:0,s:{x:0,z:0,d:0}};
    const ox=Math.cos(best.ang),oz=Math.sin(best.ang);
    pos=new THREE.Vector3(best.s.x+ox*95,4.5,best.s.z+oz*95);
    tgt=new THREE.Vector3(best.s.x-ox*220,26,best.s.z-oz*220);
  }else{
    tgt=new THREE.Vector3(0,12,0);
    const az=opts.az??pc.az,el=opts.elev??pc.elev,dist=(opts.dist??pc.dist);
    pos=tgt.clone().add(dir(az,el).multiplyScalar(dist));
  }
  camera.position.copy(pos);controls.target.copy(tgt);camera.lookAt(tgt);controls.update();
}
let autoOrbit=false;
function resize(){
  const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}
addEventListener('resize',resize);resize();

async function load(presetId,seed,view='oblique',viewOpts){
  $('busy').style.display='grid';
  await new Promise(r=>setTimeout(r,20));
  const t0=performance.now();
  for(const c of chunkMap.values())disposeChunk(c);chunkMap.clear();
  island=createIsland(seed,presetId);
  const tGen=performance.now()-t0;
  applyPalette(island.preset.palette);buildOcean(island.half);
  setView(view,viewOpts);
  const t1=performance.now();flushChunks();
  const tChunks=performance.now()-t1;
  drawMinimap($('mapc'),island);updateMarker();
  const s=island.stats;
  $('blurb').textContent=island.preset.blurb;
  $('info').textContent=`land ${(s.landRatio*100).toFixed(0)}% | peak ${s.maxH.toFixed(0)}m | ${s.rivers} rivers ${s.lakes} lakes | gen ${tGen.toFixed(0)}ms, mesh ${tChunks.toFixed(0)}ms`;
  $('busy').style.display='none';
  window.__cozy.ready=true;
  return {stats:s,tGen,tChunks,checksum:island.checksum()};
}
function updateMarker(){if(island)drawMarker($('mapo'),island,controls.target,camera.position);}
function randomSeed(){const w=['clover','plum','mint','dune','fern','tide','honey','moss','pearl','lilac','ember','drift','sorbet','wren','cove'];return w[Math.floor(Math.random()*w.length)]+'-'+Math.floor(Math.random()*900+100);}

for(const id of PRESET_IDS){const o=document.createElement('option');o.value=id;o.textContent=PRESETS[id].label;$('preset').appendChild(o);}
const startPreset=params.get('preset')&&PRESETS[params.get('preset')]?params.get('preset'):PRESET_IDS[0];
$('preset').value=startPreset;$('seed').value=params.get('seed')||'petalwood';
$('preset').onchange=()=>load($('preset').value,$('seed').value);
$('seed').onchange=()=>load($('preset').value,$('seed').value);
$('reroll').onclick=()=>{$('seed').value=randomSeed();load($('preset').value,$('seed').value);};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('mapo').onclick=e=>{
  if(!island) return;const r=e.currentTarget.getBoundingClientRect();
  const x=((e.clientX-r.left)/r.width-.5)*island.size,z=((e.clientY-r.top)/r.height-.5)*island.size;
  const off=camera.position.clone().sub(controls.target);
  controls.target.set(x,Math.max(0,island.sample(x,z)),z);camera.position.copy(controls.target).add(off);controls.update();
};

window.__cozy={ready:false,load,setView,flushChunks,
  setCamera(p,t){camera.position.set(...p);controls.target.set(...t);camera.lookAt(...t);controls.update();flushChunks();},
  setSize(w,h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();},
  render(time=0){waterMat.uniforms.uTime.value=time;controls.update();clampCamera();renderer.render(scene,camera);},
  info(){return {chunks:chunkMap.size,calls:renderer.info.render.calls,tris:renderer.info.render.triangles};},
  get island(){return island;},get camera(){return camera;},get controls(){return controls;},set orbit(v){autoOrbit=v;}};

let last=performance.now(),frames=0,acc=0;
function loop(now){
  requestAnimationFrame(loop);
  if(params.has('shot')) return; // headless capture drives render() itself
  const dt=(now-last)/1000;last=now;
  if(autoOrbit){const o=camera.position.clone().sub(controls.target);o.applyAxisAngle(new THREE.Vector3(0,1,0),dt*.12);camera.position.copy(controls.target).add(o);}
  waterMat.uniforms.uTime.value=now/1000;
  controls.update();clampCamera();
  if(++frames%12===0) updateChunks(3);
  if(frames%20===0) updateMarker();
  renderer.render(scene,camera);
}
load(startPreset,$('seed').value,params.get('view')||'oblique').then(()=>requestAnimationFrame(loop));
