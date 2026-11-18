import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {IslandClient} from './island-client.js';
import {SettlementView} from './settlement-view.js';
import {Street} from './street.js';
const SEA_LEVEL=0;
import {PRESETS,PRESET_IDS} from '../packages/island-gen/src/presets.js';
import {drawMarker} from './minimap.js';
import {graphicsSettings} from './graphics.js';
import {sunlight} from './daylight.js';
const client=new IslandClient();

const params=new URLSearchParams(location.search);
if(params.has('shot')) document.body.classList.add('shot');
const $=id=>document.getElementById(id);
const canvas=$('gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:params.has('shot')});
renderer.setPixelRatio(Math.min(devicePixelRatio,params.has('shot')?1:2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
const graphics=graphicsSettings(renderer,canvas);
const scene=new THREE.Scene();
// Camera-centred dome keeps the horizon stable from the sidewalk to the island view.
const sky=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false,
  uniforms:{zenith:{value:new THREE.Color()},haze:{value:new THREE.Color()}},
  vertexShader:`varying vec3 ray;void main(){ray=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
  fragmentShader:`uniform vec3 zenith,haze;varying vec3 ray;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
    void main(){vec3 d=normalize(ray);float e=max(d.y,0.);
      vec3 c=mix(haze,zenith,smoothstep(0.,.52,e));
      vec2 p=d.xz/max(e+.12,.14)*vec2(2.1,3.0);
      float clouds=.57*noise2(p)+.28*noise2(2.12*p)+.15*noise2(4.25*p);
      c=mix(c,vec3(1.,.95,.86),smoothstep(.55,.75,clouds)*smoothstep(.01,.16,e)*.7);
      gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
    }`
}));
sky.frustumCulled=false;sky.renderOrder=-100;scene.add(sky);
const camera=new THREE.PerspectiveCamera(48,1,1,9000);
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=.08;controls.maxPolarAngle=Math.PI/2-.01;controls.minDistance=8;controls.maxDistance=4200;

const waterMat=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,
  uniforms:{uTime:{value:0},uShallow:{value:new THREE.Color()},uDeep:{value:new THREE.Color()},uFoam:{value:new THREE.Color()},uFog:{value:new THREE.Color()},uFogNear:{value:900},uFogFar:{value:3600}},
  vertexShader:`attribute float depth;varying float vD;varying vec3 vW;
    void main(){vD=depth;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform float uTime,uFogNear,uFogFar;uniform vec3 uShallow,uDeep,uFoam,uFog;varying float vD;varying vec3 vW;
    void main(){
      float d=vD; if(d<-0.02) discard;
      float k=mix(.11,3.,step(.8,vW.y));float t=1.-exp(-max(d,0.)*k);
      vec3 col=mix(uShallow,uDeep,t*mix(1.,.62,step(.8,vW.y)));
      float w1=sin(uTime*.9+vW.x*.12+vW.z*.07),w2=sin(uTime*1.3-vW.z*.15+vW.x*.05);
      float band=.55+.22*w1+.14*w2;
      float foam=1.-smoothstep(band*.2,band*.55,d);
      float line=smoothstep(.0,.12,d)*(1.-smoothstep(.12,.34,d)); // thin bright shoreline
      col=mix(col,uFoam,clamp(foam*.7+line*.35,0.,1.));
      // Long wind streaks break and bend along their length. Fade subpixel
      // crests as the camera pulls back so the bay reads as one surface.
      float along=dot(vW.xz,vec2(.94,.34)),across=dot(vW.xz,vec2(-.34,.94));
      float wave=across*.92+.8*w1+.54*sin(along*.27+across*.15+uTime*.8)-uTime*1.08;
      float breaks=sin(along*.76+1.7*w2+uTime*.4);
      float crest=smoothstep(.83,.98,sin(wave))*smoothstep(.12,.92,breaks*.52+w2*.46+w1*.33);
      float resolved=1.-smoothstep(.3,2.2,fwidth(wave));
      col+=vec3(.029,.043,.041)*crest*resolved;
      float distanceToEye=length(cameraPosition-vW);
      col*=.99+(.012*w1+.009*w2)*(1.-smoothstep(400.,1200.,distanceToEye));
      float a=mix(.5,1.,t)*smoothstep(-.02,.1,d);
      a=mix(a,1.,smoothstep(1.5,5.,d));
      a=max(a,foam*.85*smoothstep(-.02,.06,d));
      float f=smoothstep(uFogNear,uFogFar,distanceToEye);
      gl_FragColor=vec4(col,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      gl_FragColor.rgb=mix(gl_FragColor.rgb,linearToOutputTexel(vec4(uFog,1.)).rgb,f);
    }`,
});

// open-ocean frame so the world edge fades into fog instead of showing a hard rim
const oceanMat=new THREE.MeshBasicMaterial({color:0x3f8fb1,fog:true});
const floorMat=new THREE.MeshBasicMaterial({color:0x2a6f86,fog:true});
const floorPlane=new THREE.Mesh(new THREE.PlaneGeometry(90000,90000).rotateX(-Math.PI/2),floorMat);floorPlane.position.y=-75;scene.add(floorPlane);
const ocean=new THREE.Mesh(new THREE.BufferGeometry(),waterMat);ocean.renderOrder=2;scene.add(ocean);
function buildOcean(island){
  const half=island.half,outer=half*1.45,positions=[],depth=[],indices=[];
  // Continue the bathymetry across the terrain boundary. All three rings
  // share one mesh and material, and are built only when the locale changes.
  const steps=Math.ceil(island.size/island.cell);
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
  for(let side=0;side<4;side++){
    const [ax,az]=corners[side],[bx,bz]=corners[(side+1)%4];
    for(let i=0;i<steps;i++){
      const x=ax+(bx-ax)*i/steps,z=az+(bz-az)*i/steps;
      const edgeDepth=-island.sample(x*half,z*half);
      positions.push(x*half,0,z*half,x*outer,0,z*outer,x*40000,0,z*40000);
      depth.push(edgeDepth,Math.max(30,edgeDepth),80);
      const a=depth.length-3,b=(a+3)%(12*steps);
      indices.push(a,b,a+1,b,b+1,a+1,a+1,b+1,a+2,b+1,b+2,a+2);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('depth',new THREE.Float32BufferAttribute(depth,1));
  geometry.setIndex(indices);ocean.geometry.dispose();ocean.geometry=geometry;
}
const group=new THREE.Group();scene.add(group);
let island=null,loadGen=0,chunkCount=0,terrainReady=Promise.resolve();
let town=null, street=null, captureTime=0;
function makeMesh(data,isWater){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(data.positions,3));
  if(isWater) g.setAttribute('depth',new THREE.BufferAttribute(data.depth,1));
  else g.setAttribute('color',new THREE.BufferAttribute(data.colors,3));
  g.setIndex(new THREE.BufferAttribute(data.indices,1));
  const m=new THREE.Mesh(g,isWater?waterMat:town.terrainMaterial);
  m.matrixAutoUpdate=false;
  if(isWater)m.renderOrder=2;
  else{
    g.setAttribute('normal',new THREE.BufferAttribute(data.normals,3,true));
    m.receiveShadow=true;
  }
  return m;
}
// Keep the full island resident. Moving the camera or teleporting only changes
// which mesh bounds pass the frustum test. Limit queued work on a superseded load.
async function buildIslandSurface(generation){
  const halfTiles=Math.floor(island.half/island.chunkSize),width=halfTiles*2;
  const cells=island.chunkCells??Math.ceil(island.chunkSize/island.cell);
  const res=cells+1,waterRes=2*cells+1;
  let next=0,failed=false;
  async function buildTiles(){
    while(!failed&&generation===loadGen&&next<width*width){
      const index=next++,cx=index%width-halfTiles,cz=Math.floor(index/width)-halfTiles;
      const data=await client.chunk(cx,cz,res,waterRes);
      if(failed||!data||generation!==loadGen)return;
      group.add(makeMesh(data.terrain,false));
      if(data.water)group.add(makeMesh(data.water,true));
      chunkCount++;
    }
  }
  try{await Promise.all(Array.from({length:4},buildTiles));}
  catch(error){failed=true;throw error;}
}
function flushChunks(){return terrainReady;}
function applyPalette(p){
  sky.material.uniforms.zenith.value.set(p.sky);sky.material.uniforms.haze.value.set(p.fog);
  scene.fog=new THREE.Fog(new THREE.Color(p.fog),900,3600);scene.background=new THREE.Color(p.fog);oceanMat.color.set(p.deep).lerp(new THREE.Color('#8fb9b4'),.22).multiplyScalar(.82);floorMat.color.copy(oceanMat.color);
  waterMat.uniforms.uShallow.value.set(p.shallow);waterMat.uniforms.uDeep.value.set(p.deep);waterMat.uniforms.uFoam.value.set(p.foam);waterMat.uniforms.uFog.value.set(p.fog);
}
function streetLighting(){
  const walking=!!street?.active;
  const distance=camera.position.distanceTo(controls.target);
  const near=walking?Math.max(210,distance*1.4):900,far=walking?Math.max(1150,distance*4):3600;
  scene.fog.near=waterMat.uniforms.uFogNear.value=near;
  scene.fog.far=waterMat.uniforms.uFogFar.value=far;
  // Fully fogged geometry contributes nothing. Keep the clip beyond that fade,
  // and expand it with the walking zoom instead of drawing the entire island.
  const clip=walking?Math.ceil(far*1.12):9000;
  if(camera.far!==clip){camera.far=clip;camera.updateProjectionMatrix();}
  const sun=town.sun;
  if(!renderer.shadowMap.enabled||distance>240){sun.castShadow=false;return;}
  sun.castShadow=true;
  const at=controls.target;
  const revision=street?.session?.layout.revision??0;
  const opened=street?.openRoof??'';
  if(town.shadowRevision===revision&&town.shadowRoom===opened&&town.shadowWalking===walking&&
      sun.target.position.distanceToSquared(at)<9&&Math.abs((town.shadowDistance??distance)-distance)<5)return;
  town.shadowRevision=revision;town.shadowRoom=opened;town.shadowWalking=walking;town.shadowDistance=distance;
  const span=Math.max(29,Math.min(90,distance*.74));
  const cam=sun.shadow.camera;
  if(cam.right!==span){Object.assign(cam,{left:-span,right:span,top:span,bottom:-span});cam.updateProjectionMatrix();}
  sun.target.position.copy(at);
  sun.position.set(at.x+sunlight.x,at.y+sunlight.y,at.z+sunlight.z);
  sun.shadow.needsUpdate=true;
}
const orbitEye=new THREE.Vector3();
function renderScene(){
  const fraction=street?.cameraFraction()??1;
  orbitEye.copy(camera.position);
  camera.position.lerp(controls.target,1-fraction);
  if(street?.active){
    const distance=camera.position.distanceTo(controls.target);
    const near=distance>1500?6:distance>450?2:distance>120?.5:.13;
    if(camera.near!==near){camera.near=near;camera.updateProjectionMatrix();}
  }
  town?.posePeople(performance.now(),camera);
  renderer.render(scene,camera);
  camera.position.copy(orbitEye);
  camera.updateMatrixWorld();
}
function clampCamera(){
  if(!island) return;
  sky.position.copy(camera.position);streetLighting();
  const g=island.sample(camera.position.x,camera.position.z);
  const floor=Math.max(g,SEA_LEVEL)+3;
  if(camera.position.y<floor){
    camera.position.y=floor;
    camera.lookAt(controls.target);
  }
}
function setView(name,opts={}){
  if(!island) return;
  if(name==='street' && street?.activate())return;
  street?.deactivate();
  const pc=island.preset.camera,half=island.half;
  const dir=(az,el)=>new THREE.Vector3(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az));
  let tgt,pos;
  if(name==='top'){
    tgt=new THREE.Vector3(0,0,0);pos=tgt.clone().add(new THREE.Vector3(.001,island.size*1.05,.001));
  }else if(name==='centre'&&island.townSquare){
    const b=island.townSquare;
    tgt=new THREE.Vector3(b.x,b.y+1,b.z);
    pos=tgt.clone().add(dir(opts.az??b.yaw+.66,opts.elev??.90).multiplyScalar(opts.dist??112));
  }else if(name==='town'){
    tgt=town.focus();
    pos=tgt.clone().add(dir(opts.az??.74,opts.elev??.52).multiplyScalar(opts.dist??48));
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
  const w=innerWidth,h=innerHeight;graphics.resize();camera.aspect=w/h;camera.updateProjectionMatrix();
}
addEventListener('resize',resize);resize();

async function load(presetId,seed,view='oblique',viewOpts){
  $('busy').style.display='grid';
  $('busy').textContent='Generating island...';
  window.__cozy.ready=false;
  const generation=++loadGen;
  for(const child of group.children)child.geometry.dispose();
  group.clear();chunkCount=0;terrainReady=Promise.resolve();
  street?.dispose();street=null;
  if(town){scene.remove(town.group);town.dispose();town=null;}
  island=null;
  const t0=performance.now();
  try {
    const loaded=await client.load(seed,presetId);
    if(generation!==loadGen) return;
    island=loaded;
    town=new SettlementView(island);
    island.deckHeight=town.decks.heightAt;
    scene.add(town.group);
    street=new Street(island,scene,camera,controls,town);
    await town.bindStreet(street,!params.has('shot'));
    if(generation!==loadGen)return;
    $('centre-view').hidden=!island.townSquare;
    captureTime=0;
    const tGen=performance.now()-t0;
    applyPalette(island.preset.palette);buildOcean(island);
    setView(view,viewOpts);
    const t1=performance.now();terrainReady=buildIslandSurface(generation);await terrainReady;
    if(generation!==loadGen) return;
    $('busy').textContent='Preparing town materials...';
    await town.crowd.warm(renderer,scene,camera);
    if(generation!==loadGen) return;
    const tChunks=performance.now()-t1;
    const px=await client.minimap(208,208);
    if(generation!==loadGen) return;
    const c=$('mapc').getContext('2d'),img=c.createImageData(208,208);
    img.data.set(px);c.putImageData(img,0,0);town.drawMap(c,island.size);updateMarker();
    const s=island.stats;
    $('blurb').textContent=island.preset.blurb;
    $('info').textContent=`${island.plan.stats.roads} road pieces · ${island.plan.lots.length} plots · ${town.people.length} residents | land ${(s.landRatio*100).toFixed(0)}% · peak ${s.maxH.toFixed(0)}m`;
    $('busy').style.display='none';
    window.__cozy.ready=true;
    return {stats:s,tGen,tChunks,checksum:island.checksum};
  } catch(err) {
    if(generation!==loadGen) return;
    $('busy').style.display='none';
    $('info').textContent='Island load failed. Choose another seed or locale to retry.';
    console.error(err);
    throw err;
  }
}
function updateMarker(){if(town)drawMarker($('mapo'),island,controls.target,camera.position,town.people);}
function randomSeed(){const w=['clover','plum','mint','dune','fern','tide','honey','moss','pearl','lilac','ember','drift','sorbet','wren','cove'];return w[Math.floor(Math.random()*w.length)]+'-'+Math.floor(Math.random()*900+100);}

for(const id of PRESET_IDS){const o=document.createElement('option');o.value=id;o.textContent=PRESETS[id].label;$('preset').appendChild(o);}
const startPreset=PRESETS[params.get('preset')]?params.get('preset'):'harborTown';
$('preset').value=startPreset;$('seed').value=params.get('seed')||'petalwood';
$('preset').onchange=()=>load($('preset').value,$('seed').value);
$('seed').onchange=()=>load($('preset').value,$('seed').value);
$('reroll').onclick=()=>{$('seed').value=randomSeed();load($('preset').value,$('seed').value);};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('island-map').onclick=()=>setView('top');
window.addEventListener('keydown',e=>{
  if(e.code!=='KeyM'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea,[contenteditable="true"]'))return;
  e.preventDefault();if(street?.active)setView('top');else $('walk-street').click();
});
$('walk-street').onclick=()=>{
  if(street?.plots.length)return setView('street');
  $('preset').value='harborTown';$('seed').value='petalwood';return load('harborTown','petalwood','street');
};
$('mapo').onclick=e=>{
  if(!island) return;const r=e.currentTarget.getBoundingClientRect();
  const x=((e.clientX-r.left)/r.width-.5)*island.size,z=((e.clientY-r.top)/r.height-.5)*island.size;
  const off=camera.position.clone().sub(controls.target);
  controls.target.set(x,Math.max(0,island.sample(x,z)),z);camera.position.copy(controls.target).add(off);controls.update();
};

window.__cozy={ready:false,load,setView,flushChunks,
  async setCamera(p,t){camera.position.set(...p);controls.target.set(...t);camera.lookAt(...t);controls.update();await flushChunks();},
  setSize(w,h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();},
  render(time=0){
    if(params.has('shot') && time>captureTime){town?.advance(time-captureTime);captureTime=time;}
    street?.render();
    waterMat.uniforms.uTime.value=time;controls.update();clampCamera();renderScene();
  },
  info(){return {chunks:chunkCount,calls:renderer.info.render.calls,tris:renderer.info.render.triangles,
    roads:island?.plan.roads.length,plots:island?.plan.lots.length,homes:island?.homes?.length,graphics:graphics.info(),residents:town?.current,tick:town?.sim?.tick,
    simulation:{worker:!!town?.worker,lastWorkMs:town?.workerMs,backlogSeconds:town?.elapsed,visible:town?.crowd.visible,error:town?.workerError}};},
  get island(){return island;},get street(){return street;},get camera(){return camera;},get controls(){return controls;},set orbit(v){autoOrbit=v;}};

let last=performance.now(),frames=0;
function loop(now){
  requestAnimationFrame(loop);
  if(params.has('shot')) return; // headless capture drives render() itself
  const dt=(now-last)/1000;last=now;
  if(!window.__cozy.ready) return;
  graphics.frame(now);
  if(!street?.session?.ready)town.advance(Math.min(dt,.25));
  street?.advance(now);street?.render(now);
  if(autoOrbit){const o=camera.position.clone().sub(controls.target);o.applyAxisAngle(new THREE.Vector3(0,1,0),dt*.12);camera.position.copy(controls.target).add(o);}
  waterMat.uniforms.uTime.value=now/1000;
  controls.update();clampCamera();
  if(++frames%20===0&&!street?.active)updateMarker();
  renderScene();
}
export const startup=load(startPreset,$('seed').value,params.get('view')||(!params.has('preset')&&!params.has('seed')?'street':'oblique'));
requestAnimationFrame(loop);
