import * as THREE from 'three';
import {distSeg} from '../packages/settlement/src/geom.js';
import {plotsForStreet,toWorld} from './street-world.js';

// Each land fragment needs only the road segments that can reach its 16 m cell.
// The header points to pairs of texels containing endpoints and road attributes.
const cellSize=16,textureWidth=512;
function roadCells(island){
  const size=Math.ceil(island.size/cellSize),cells=new Map(),segments=[];
  for(const [id,road] of island.plan.roads.entries()){
    if(road.bridge)continue;
    let station=0;
    for(let i=1;i<road.pts.length;i++){
      const [x,z]=road.pts[i-1],[ex,ez]=road.pts[i],dx=ex-x,dz=ez-z,length=Math.hypot(dx,dz);
      if(!length)continue;
      const half=road.width/2,reach=half+2.6;
      const data=[x,z,dx,dz,half,station,road.class==='main'?2:road.class==='path'?0:1,id];
      const cell=v=>Math.min(size-1,Math.max(0,Math.floor((v+island.half)/cellSize)));
      for(let iz=cell(Math.min(z,ez)-reach);iz<=cell(Math.max(z,ez)+reach);iz++)
        for(let ix=cell(Math.min(x,ex)-reach);ix<=cell(Math.max(x,ex)+reach);ix++){
          const cx=(ix+.5)*cellSize-island.half,cz=(iz+.5)*cellSize-island.half;
          if(distSeg(cx,cz,x,z,ex,ez).d>reach+cellSize*Math.SQRT1_2)continue;
          const key=iz*size+ix;
          if(!cells.has(key))cells.set(key,[]);
          cells.get(key).push(data);
        }
      segments.push({x,z,ex,ez,station,id,road});station+=length;
    }
  }
  const headers=new Float32Array(size*size*4),records=[];
  for(const [key,entries] of cells){
    headers[key*4]=records.length/4;headers[key*4+1]=entries.length;
    for(const entry of entries)records.push(...entry);
  }
  const rows=Math.max(1,Math.ceil(records.length/(textureWidth*4)));
  const pixels=new Float32Array(rows*textureWidth*4);pixels.set(records);
  const grid=new THREE.DataTexture(headers,size,size),lines=new THREE.DataTexture(pixels,textureWidth,rows);
  for(const tex of [grid,lines]){tex.type=THREE.FloatType;tex.needsUpdate=true;}
  // Keep the existing crossing on the short route from the café to Harbor Green.
  const cafe=plotsForStreet(island).find(p=>p.cafe);
  const crossing=new THREE.Vector2(-1,-1);
  if(cafe){
    const gate=toWorld(cafe,-1,cafe.d/2+2);
    let best=Infinity;
    for(const seg of segments.filter(s=>s.road.id===cafe.road)){
      const hit=distSeg(gate.x,gate.z,seg.x,seg.z,seg.ex,seg.ez);
      if(hit.d<best){best=hit.d;crossing.set(seg.id,seg.station+Math.hypot(hit.x-seg.x,hit.z-seg.z));}
    }
  }
  return {grid,lines,crossing};
}

const surfaceShader=`
uniform sampler2D roadGrid, roadLines;
uniform float islandHalf;
uniform vec2 cafeCrossing;
varying vec2 groundXZ;
vec4 roadTexel(int i){return texelFetch(roadLines,ivec2(i%512,i/512),0);}
float grain(vec2 p){
  vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);
}
float smoothGrain(vec2 p){
  vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(grain(cell),grain(cell+vec2(1,0)),f.x),
             mix(grain(cell+vec2(0,1)),grain(cell+1.),f.x),f.y);
}
float cover(float distance,float aa){return 1.-smoothstep(-aa,aa,distance);}
float seam(float t,float repeatLength){return abs(fract(t/repeatLength+.5)-.5)*repeatLength;}
vec3 finishGround(vec3 ground,vec2 p){
  float aa=clamp(max(fwidth(p.x),fwidth(p.y))*.53,.009,.85);
  float fine=1.-smoothstep(.045,.24,aa);
  float lawn=smoothstep(-.04,.06,ground.g-ground.r)*smoothstep(.01,.09,ground.g-ground.b);
  float meadow=smoothGrain(p*.035);
  ground*=mix(vec3(1.),mix(vec3(.67,.80,.66),vec3(.89,1.02,.78),meadow),lawn);
  ground*=1.+lawn*(.14*(smoothGrain(p*.55)-.5)+.16*(smoothGrain(p*.115)-.5)
               +.10*(smoothGrain(p*7.)-.5)*fine);
  ivec2 cell=ivec2(floor((p+islandHalf)/16.));
  if(any(lessThan(cell,ivec2(0)))||any(greaterThanEqual(cell,textureSize(roadGrid,0))))return ground;
  vec2 header=texelFetch(roadGrid,cell,0).rg;
  float edge=1000.,other=1000.,pathEdge=1000.,station=0.,lateral=0.,halfWidth=0.,kind=0.,id=-1.;
  for(int i=0;i<int(header.y);i++){
    int k=int(header.x)+i*2;
    vec4 line=roadTexel(k),info=roadTexel(k+1);
    vec2 dir=line.zw;float len=length(dir);dir/=len;
    vec2 delta=p-line.xy;float t=clamp(dot(delta,dir),0.,len);
    float e=length(delta-dir*t)-info.x;
    if(info.z==0.){pathEdge=min(pathEdge,e);continue;}
    if(e<edge){
      if(id!=info.w)other=edge;
      edge=e;station=info.y+t;lateral=dot(delta,vec2(-dir.y,dir.x));halfWidth=info.x;kind=info.z;id=info.w;
    }else if(id!=info.w)other=min(other,e);
  }
  vec3 gravel=vec3(.52,.405,.25)*(.96+.11*smoothGrain(p*4.)*fine);
  ground=mix(ground,gravel,cover(pathEdge,aa));
  if(edge>2.18+aa)return ground;
  float slabJoint=cover(seam(station,1.60)-.024,aa);
  float slabRow=cover(abs(edge-1.12)-.023,aa);
  float aggregate=(smoothGrain(p*12.)-.5)*fine;
  vec3 slab=vec3(.64,.54,.418)*(.96+.08*grain(vec2(floor(station/1.6+.5),sign(lateral)))*fine+.07*aggregate);
  slab*=1.-.28*max(slabJoint,slabRow)*fine;
  float kerbJoint=cover(seam(station,.80)-.020,aa);
  vec3 kerb=vec3(.78,.702,.575)*(1.-.21*kerbJoint*fine);
  vec3 gutter=vec3(.23,.221,.208);
  float joint=cover(seam(station,20.)-.32,aa)*cover(abs(edge+.16)-.10,aa);
  gutter=mix(gutter,vec3(.09,.085,.075),joint*(.5+.5*cover(seam(station,.095)-.027,aa))*fine);
  vec3 asphalt=vec3(.218,.224,.218)*(.94+.12*smoothGrain(p*.18)+.14*aggregate);
  float junction=smoothstep(.15,1.65,other);
  float dash=cover(abs(lateral)-.075,aa)*cover(seam(station,6.)-1.19,aa);
  float crossing=id==cafeCrossing.x?cover(abs(station-cafeCrossing.y)-1.25,aa):0.;
  float zebra=cover(seam(lateral,.91)-.22,aa)*cover(abs(lateral)-halfWidth+.45,aa);
  asphalt=mix(asphalt,vec3(.88,.721,.42),dash*junction*(1.-crossing)*step(1.5,kind));
  asphalt=mix(asphalt,vec3(.84,.81,.69),crossing*zebra);
  vec3 surface=mix(slab,kerb,cover(edge-.19,aa));
  surface=mix(surface,gutter,cover(edge,aa));
  surface=mix(surface,asphalt,cover(edge+.28,aa));
  // A narrow earth lip ties the paving into the grass, including the ends of cul-de-sacs.
  ground=mix(ground,vec3(.37,.32,.215),cover(edge-2.08,aa));
  return mix(ground,surface,cover(edge-1.99,aa));
}`;

export function createRoadSurface(island){
  const {grid,lines,crossing}=roadCells(island);
  const material=new THREE.MeshLambertMaterial({vertexColors:true});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{roadGrid:{value:grid},roadLines:{value:lines},
      islandHalf:{value:island.half},cafeCrossing:{value:crossing}});
    shader.vertexShader='varying vec2 groundXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ngroundXZ=position.xz;');
    shader.fragmentShader=surfaceShader+'\n'+shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb=finishGround(diffuseColor.rgb,groundXZ);');
  };
  material.addEventListener('dispose',()=>{grid.dispose();lines.dispose();});
  return material;
}
