import * as THREE from 'three';
import {Pieces} from './street-pieces.js';
import {carSteerAngle} from './street-travel.js';

const hoop=new THREE.TorusGeometry(1,.075,6,22),tire=new THREE.TorusGeometry(1,.18,7,20);
const rubber='#313738',cream='#f4e7c2',chrome='#b4c7c0',paint='#4e9589',leather='#8a5842';
function strut(parts,from,to,width,color){
  const [x,y,z]=from,[ex,ey,ez]=to,dx=ex-x,dy=ey-y,dz=ez-z;
  const length=Math.hypot(dx,dy,dz);
  // The rod lies in the YZ plane of its frame.
  parts.box((x+ex)/2,(y+ey)/2,(z+ez)/2,width,length,width,color,0,-Math.asin(dx/length),Math.atan2(dz,dy));
}
function wheel(parent,x,y,z,r,bike){
  const hub=new THREE.Group(),spin=new THREE.Group(),p=new Pieces(spin);
  hub.position.set(x,y,z);parent.add(hub);hub.add(spin);
  p.put(bike?hoop:tire,0,0,0,r,r,bike?r*.75:r*2.25,rubber,Math.PI/2);
  if(bike){
    p.put(hoop,0,0,0,r*.92,r*.92,r*.30,chrome,Math.PI/2);
    for(let i=0;i<8;i++)p.box(0,0,0,.016,.016,r*1.84,chrome,0,0,i*Math.PI/8);
  }else{
    p.round(0,0,0,r*1.68,r*.62,r*1.68,cream,0,Math.PI/2);
    p.round(Math.sign(x)*.06,0,0,r*.93,r*.60,r*.93,chrome,0,Math.PI/2);
    for(let i=0;i<3;i++)p.box(Math.sign(x)*.15,0,0,.018,.038,r*1.15,paint,0,0,i*Math.PI/3);
  }
  p.finish();return {hub,spin};
}
export function vehicleArt(kind){
  const root=new THREE.Group(),p=new Pieces(root),wheels=[],bike=kind==='bike';
  let crank,brakeLights;
  if(bike){
    for(const z of [-.67,.65])wheels.push(wheel(root,0,.355,z,.323,true));
    for(const [a,b] of [
      [[0,.35,-.67],[0,.83,-.16]],[[0,.35,-.67],[0,.34,.01]],[[0,.34,.01],[0,.83,-.16]],
      [[0,.34,.01],[0,.98,.46]],[[0,.64,-.12],[0,.79,.39]],[[0,.98,.46],[0,.355,.65]]
    ])strut(p,a,b,.062,paint);
    strut(p,[0,.78,-.16],[0,.94,-.20],.045,chrome);
    p.ball(0,.94,-.20,.31,.105,.35,leather);
    strut(p,[0,.96,.46],[0,1.17,.43],.04,chrome);
    p.box(0,1.17,.43,.53,.04,.04,chrome);
    for(const side of [-1,1])p.box(side*.245,1.17,.37,.052,.057,.17,leather);
    p.box(0,.90,.72,.43,.045,.32,'#b18a58');
    for(const y of [.94,1.02,1.1]){
      for(const side of [-1,1]){
        p.box(side*.21,y,.72,.026,.035,.34,'#c49d67');p.box(0,y,.72+side*.15,.43,.035,.025,'#c49d67');
      }
    }
    for(const sx of [-.2,.2])for(const sz of [.57,.87])p.box(sx,1.01,sz,.028,.21,.03,leather);
    p.box(0,.76,-.64,.29,.035,.55,chrome);
    p.ball(0,.83,.86,.11,.10,.10,cream);p.ball(0,.76,-.92,.095,.068,.08,'#be554c');
    crank=new THREE.Group();crank.position.set(0,.36,0);root.add(crank);
    const pedals=new Pieces(crank);for(const side of [-1,1]){
      pedals.box(side*.11,side*.063,0,.035,.16,.038,chrome);pedals.box(side*.16,side*.14,0,.12,.038,.10,rubber);
    }pedals.finish();
  }else{
    for(const x of [-.78,.78])for(const z of [-1.01,1.01])wheels.push(wheel(root,x,.33,z,.28,false));
    p.box(0,.335,0,1.56,.16,2.98,'#465554');
    p.box(0,.51,0,1.66,.30,3.04,paint);
    for(const side of [-1,1]){
      p.ball(side*.70,.55,1.03,.43,.42,1.12,paint);p.ball(side*.70,.55,-1.01,.44,.43,1.14,paint);
      p.box(side*.79,.72,-.16,.12,.40,1.65,paint);p.box(side*.852,.73,-.12,.021,.065,2.58,cream);
      p.box(side*.862,.82,-.40,.026,.039,.22,chrome);
      p.ball(side*.64,.68,1.48,.27,.23,.11,cream);p.ball(side*.65,.63,-1.51,.18,.15,.072,'#b34e40');
      p.box(side*.69,1.02,.50,.046,.49,.05,chrome,0,0,-.16);
      p.ball(side*.87,.97,.42,.19,.105,.095,chrome);
      p.box(side*.34,.56,-.22,.56,.16,.64,leather);
      p.box(side*.34,.81,-.51,.56,.45,.14,leather,0,0,-.12);
    }
    p.ball(0,.68,1.06,1.60,.33,1.10,paint);p.ball(0,.71,-1.05,1.58,.29,.94,paint);
    p.box(0,.80,1.03,.045,.022,.64,chrome);
    p.box(0,.83,.50,1.42,.11,.18,'#4e6764');p.box(0,1.24,.46,1.43,.035,.045,chrome);
    const glass=new THREE.Mesh(new THREE.PlaneGeometry(1.34,.38),
      new THREE.MeshLambertMaterial({color:'#b1e5df',transparent:true,opacity:.37,depthWrite:false,side:THREE.DoubleSide}));
    glass.position.set(0,1.04,.496);glass.rotation.x=-.16;root.add(glass);
    p.box(0,1.17,.46,.22,.08,.058,'#56615e');
    for(const side of [-1,1]){
      p.ball(side*.30,.85,.475,.119,.081,.034,'#d9caaa');
      p.box(side*.58,.88,.50,.20,.021,.027,chrome,0,side*.18);
      p.box(side*.26,.858,-.99,.036,.026,.48,chrome);
    }
    p.box(0,.54,-1.526,.33,.105,.019,'#e9cf94');
    p.box(0,.54,1.535,.77,.18,.035,rubber);
    for(const y of [.49,.55,.61])p.box(0,y,1.558,.72,.017,.022,chrome);
    for(const z of [-1.55,1.55])p.box(0,.38,z,1.71,.085,.13,cream);
    p.put(hoop,.34,.92,.23,.175,.175,.18,rubber,0,0,-.4);
    brakeLights=new THREE.Group();root.add(brakeLights);
    const lamps=new Pieces(brakeLights);
    for(const side of [-1,1])lamps.ball(side*.65,.63,-1.53,.17,.14,.065,'#ff5c42');
    lamps.finish();brakeLights.visible=false;
  }
  p.finish();let phase=0,previousSpeed=0;
  root.updateRide=(speed,dt,steer,wheelPhase,braking)=>{
    phase=wheelPhase??phase+speed*dt/(bike?.323:.28);
    if(brakeLights)brakeLights.visible=braking??(dt>0&&Math.abs(previousSpeed)-Math.abs(speed)>dt*3);
    previousSpeed=speed;
    for(const {hub,spin} of wheels){spin.rotation.x=phase;if(hub.position.z>0)hub.rotation.y=bike?-steer*.30:-carSteerAngle(steer,speed);}
    if(crank)crank.rotation.x=phase*.45;
    return phase*.45;
  };
  return root;
}
