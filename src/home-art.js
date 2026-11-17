import * as THREE from 'three';
import {Pieces,roof,setPieceVisibility} from './street-pieces.js';
import {homeAt,homeLocal} from './home-plan.js';

const cream='#f0e5cf',wood='#92704e',metal='#465d58';
const palette=[['#e4cbb0','#596f75','#668574'],['#c99680','#71534d','#4d7773'],['#a2b8a3','#4c6471','#a97955'],['#d6bd83','#665b6c','#48777b'],['#a7bac5','#506578','#758265'],['#d1b2af','#675a6e','#547165']];
function windowAt(a,x,y,z,w=1.05,h=1.2,trim){
  a.box(x,y,z,w+.19,h+.20,.13,cream);a.box(x,y,z+.08,w,h,.035,'#416574');
  a.box(x,y+.20,z+.11,w-.12,h*.39,.025,'#98c0bf');
  a.box(x,y,z+.13,.06,h,.035,cream);a.box(x,y+.03,z+.13,w,.06,.035,cream);
  a.box(x,y-h/2-.10,z+.11,w+.31,.12,.31,cream);
  for(const s of [-1,1])a.box(x+s*(w/2+.24),y,z,.27,h+.11,.10,trim);
}
function innerWindow(a,x,z,w=1.05){
  a.box(x,1.5,z,w+.14,1.32,.04,cream);a.box(x,1.5,z+.03,w,1.18,.025,'#aac6c4');
  a.box(x,1.5,z+.06,.045,1.18,.025,cream);a.box(x,1.53,z+.06,w,.045,.025,cream);
}
export function homeShell(a,b){
  const [wall,tile,trim]=palette[b.palette],hw=b.w/2,hd=b.d/2,h=b.height;
  const handles=Object.fromEntries(['front','back','left','right','roof'].map(key=>[key,{visible:true}]));
  b.renderHandles=handles;
  a.box(0,-.14,0,b.w+.16,.28,b.d+.16,'#a99c87');
  a.box(0,.015,0,b.w,.06,b.d,'#b99870');
  // Separate real wall panels around the front opening. Tagged instances share
  // district batches; entering one home only hides that home's roof and walls.
  for(const r of b.walls.filter(r=>r.side!=='inside')){
    const f=a.tagged(handles[r.side]);f.clad(r.x,h/2,r.z,r.w,h,r.d,wall);
    const ix=r.side==='left'?.095:r.side==='right'?-.095:0,iz=r.side==='back'?.095:r.side==='front'?-.095:0;
    f.box(r.x+ix,h/2,r.z+iz,ix?.025:r.w,h,iz?.025:r.d,'#e9ddc7');
    f.box(r.x,.15,r.z,r.w+.04,.24,r.d+.04,trim);
    f.box(r.x,h-.08,r.z,r.w+.08,.14,r.d+.08,cream);
  }
  const front=a.tagged(handles.front),door=b.door;
  front.clad(0,(h+2.24)/2,hd,door.width,h-2.24,.17,wall);
  front.box(0,(h+2.24)/2,hd-.095,door.width,h-2.24,.025,'#e9ddc7');
  for(const s of [-1,1])front.box(s*(door.width/2+.05),1.15,hd+.05,.12,2.3,.24,cream);
  front.box(0,2.27,hd+.05,door.width+.20,.15,.24,cream);
  // Door leaf rests inside the jamb; the full centre opening is usable.
  front.box(door.width/2+.02,1.07,hd-.45,.10,2.13,.85,trim);
  front.box(door.width/2-.045,1.5,hd-.45,.025,.63,.60,'#9fb9b6');
  for(const s of [-1,1]){
    if(hw>2.7){
      const width=Math.min(1.2,(hw-1.2)*.58);
      windowAt(front,s*(hw+1.1)/2,1.5,hd+.08,width,1.18,trim);
      innerWindow(front.frame(0,0,hd-.12,Math.PI),s*(hw+1.1)/2,0,width);
    }
    const f=a.tagged(handles[s<0?'left':'right']).frame(s*hw,0,0,s*Math.PI/2);
    for(const z of b.d>7?[-b.d*.24,b.d*.24]:[0]){
      windowAt(f,z,1.5,.09,1.05,1.2,trim);innerWindow(f.frame(0,0,-.12,Math.PI),z,0);
    }
    windowAt(a.tagged(handles.back).frame(0,0,-hd,Math.PI),s*b.w*.24,1.5,.08,Math.min(1.1,b.w*.18),1.15,trim);
    innerWindow(a.tagged(handles.back).frame(0,0,-hd+.12),s*b.w*.24,0,Math.min(1.1,b.w*.18));
  }
  const top=a.tagged(handles.roof),sideways=b.variant!==0;
  const rw=sideways?b.d:b.w,rd=sideways?b.w:b.d,rise=Math.min(2.5,rw*.30),r=top.frame(0,h+.05,0,sideways?Math.PI/2:0);
  r.box(0,0,0,rw+.45,.17,rd+.45,cream);r.put(roof,0,.07,0,rw+.65,rise,rd+.65,tile);
  r.box(0,rise+.09,0,.15,.12,rd+.70,tile);
  const porchW=Math.min(b.w*.78,b.variant===0?3.4:5.6),porchD=b.variant===3?1.9:1.25;
  a.box(0,-.025,hd+porchD/2,porchW,.16,porchD,'#b69e7c');
  // A broad clear step gives a legible connection between path and doorway.
  a.box(0,-.075,hd+porchD+.17,2.05,.10,.40,'#c5b399');
  const porch=top.frame(0,2.35,hd+porchD/2);
  if(b.variant===0)porch.put(roof,0,0,0,porchW+.28,.75,porchD+.35,tile);
  else porch.box(0,0,0,porchW+.27,.16,porchD+.36,tile);
  for(const s of [-1,1])front.box(s*(porchW/2-.13),1.15,hd+porchD-.12,.14,2.3,.14,cream);
  if(b.variant===2){
    const wingW=b.w*.44,wingD=b.d*.46,wingRise=Math.min(1.9,wingW*.40);
    const gable=top.frame(-b.w*.23,h+.08,hd-wingD*.42);
    gable.put(roof,0,0,0,wingW,wingRise,wingD,tile);
    windowAt(gable,0,wingRise*.36,wingD/2+.02,Math.min(.85,wingW*.22),wingRise*.40,trim);
  }
  const cx=-b.w*.28,cz=-b.d*.22;
  top.box(cx,h+rise*.57,cz,.62,1.8,.60,'#a27b62');top.box(cx,h+rise*.57+.93,cz,.78,.16,.75,'#ccb493');
  return {parts:[{x:0,z:0,w:b.w,d:b.d,height:h+rise}],door:{x:0,z:hd+porchD+.4}};
}

function furnish(a,b){
  const accent=palette[b.palette][2];
  // Floorboards and trims stay inside the footprint, even for the compact homes.
  for(let x=-b.w/2+.15;x<b.w/2;x+=.30)a.box(x,.052,0,.013,.009,b.d-.16,'#9b7c59');
  for(const r of b.walls.filter(r=>r.side==='inside')){
    a.box(r.x,1.24,r.z,r.w,2.48,r.d,'#e6d8bf');a.box(r.x,.15,r.z,r.w+.04,.23,r.d+.04,accent);
  }
  for(const f of b.furniture){const p=a.frame(f.x,0,f.z);
    if(f.type==='tile'){
      p.box(0,.07,0,f.w,.025,f.d,'#d6d7c3');
      for(let x=-f.w/2+.4;x<f.w/2;x+=.4)p.box(x,.085,0,.016,.008,f.d,'#a4b2aa');
      for(let z=-f.d/2+.4;z<f.d/2;z+=.4)p.box(0,.085,z,f.w,.008,.016,'#a4b2aa');
    }else if(f.type==='shower'){
      p.box(0,.15,0,f.w,.18,f.d,cream);p.box(0,.25,0,f.w-.13,.03,f.d-.13,'#9baea9');
      p.round(-.3,1.2,-.30,.04,1.9,.04,metal);p.box(-.15,2.14,-.3,.35,.04,.04,metal);
      p.round(0,2.08,-.3,.21,.05,.21,metal);
    }else if(f.type==='toilet'){
      p.ball(0,.31,0,.44,.53,.52,cream);p.ball(0,.53,.15,.57,.12,.68,'#f4eee1');
      p.box(0,.70,-.30,.52,.70,.22,cream);p.box(.14,.95,-.16,.11,.04,.035,metal);
    }else if(f.type==='basin'){
      p.box(0,.47,0,f.w,.88,f.d,accent);p.box(0,.95,0,f.w+.06,.10,f.d+.05,cream);
      p.ball(0,1.0,0,.34,.035,.40,'#88a19d');p.round(.12,1.14,0,.04,.28,.04,metal);
      p.box(.26,1.61,0,.04,.64,.48,'#abc6c2');
    }else if(f.type==='dining'){
      p.box(0,.81,0,f.w,.12,1.0,wood);
      for(const x of [-.57,.57])for(const z of [-.34,.34])p.box(x,.39,z,.07,.78,.07,wood);
      for(const s of [-1,1]){
        p.box(0,.47,s*.72,.55,.10,.48,accent);p.box(0,.83,s*.91,.55,.66,.07,accent);
        for(const x of [-.20,.20])p.box(x,.24,s*.72,.06,.48,.06,wood);
        p.round(0,.89,s*.28,.28,.025,.28,cream);
      }
      p.round(.36,1.02,0,.16,.27,.16,'#bb8a6c');p.ball(.36,1.23,0,.34,.30,.33,'#6a8853');
    }else if(f.type==='nightstand'){
      p.box(0,.30,0,f.w,.60,f.d,wood);p.box(0,.44,f.d/2+.01,.38,.22,.02,accent);
      p.round(0,.82,0,.07,.42,.07,metal);p.round(0,1.04,0,.35,.27,.35,cream);
    }else if(f.type==='rug'){
      p.box(0,.066,0,f.w,.014,f.d,'#c4a38a');p.box(0,.078,0,f.w-.15,.012,f.d-.15,accent);
      for(const s of [-1,1])p.box(0,.087,s*(f.d/2-.24),f.w-.30,.008,.055,'#d8c3a2');
    }else if(f.type==='bed'){
      p.box(0,.25,0,f.w,.40,f.d,wood);p.box(0,.51,0,f.w-.08,.21,f.d-.08,cream);
      p.box(0,.65,.25,f.w-.04,.15,Math.max(.5,f.d-.65),accent);
      p.box(0,.57,-f.d/2+.05,f.w+.02,.95,.10,wood);
      p.ball(0,.70,-f.d*.32,f.w*.73,.18,.49,'#f3e7d5');
      for(let i=0;i<4;i++)p.box(0,.735,.12+i*.22,f.w-.08,.018,.035,'#c6d1b7');
    }else if(f.type==='kitchen'){
      p.box(0,.45,0,f.w,.9,f.d,accent);p.box(0,.96,0,f.w+.06,.12,f.d+.05,cream);
      const units=Math.max(2,Math.round(f.d/.65));
      for(let i=0;i<units;i++){
        const z=-f.d/2+(i+.5)*f.d/units;
        p.box(-f.w/2-.025,.48,z,.035,.72,f.d/units-.07,'#9daf97');p.box(-f.w/2-.06,.70,z+.12,.035,.13,.035,'#ba9f70');
      }
      p.box(0,1.04,-f.d*.23,f.w*.7,.03,.54,'#526e70');
      p.round(.20,1.22,-f.d*.23,.045,.36,.045,metal);p.box(.05,1.40,-f.d*.23,.33,.04,.04,metal);
      p.box(0,1.035,f.d*.28,f.w*.83,.03,.65,'#454d49');
      for(const x of [-.20,.20])for(const z of [-.17,.17])p.round(x,1.06,f.d*.28+z,.19,.025,.19,'#2e3b3b');
    }else if(f.type==='sofa'){
      p.box(0,.34,0,f.w,.44,f.d,wood);p.ball(.08,.60,0,f.w*.86,.32,f.d*.84,accent);
      p.box(-f.w*.39,.78,0,.16,.63,f.d,accent);
      for(const s of [-1,1]){p.box(0,.67,s*(f.d/2-.10),f.w,.42,.15,accent);p.ball(-.08,.82,s*f.d*.29,.38,.32,.30,'#e4c5a2');}
    }else if(f.type==='shelf'){
      for(const y of [.15,.7,1.25,1.8])p.box(0,y,0,f.w,.07,f.d,wood);
      p.box(-f.w/2,1,0,.05,1.8,f.d,wood);
      for(let n=0;n<9;n++)p.box(.03,.95,(n-4)*.073,.20,.40+(n%3)*.06,.055,['#9c756e','#7a927e','#c0a36c'][n%3]);
      p.round(0,1.96,.15,.19,.27,.19,cream);p.ball(0,2.16,.15,.30,.27,.30,'#6c8c55');
    }else if(f.type==='desk'){
      p.box(0,.76,0,f.w,.11,f.d,wood);for(const s of [-1,1])p.box(s*f.w*.4,.36,0,.08,.72,.08,metal);
      p.box(.12,.84,0,.38,.04,.28,'#e7d8bb');p.round(-.36,1.03,0,.10,.42,.10,metal);p.ball(-.36,1.23,0,.34,.16,.33,cream);
    }
  }
}
export class HomeInteriors {
  constructor(island,parent){this.island=island;this.parent=parent;this.open=null;this.group=null;}
  update(pos,eye){
    const home=homeAt(this.island,pos,.16);
    if(home!==this.open){
      if(this.open)for(const handle of Object.values(this.open.renderHandles))setPieceVisibility(handle,true);
      if(this.group){this.parent.remove(this.group);this.group.traverse(m=>{if(m.isInstancedMesh)m.dispose();});this.group=null;}
      this.open=home;
      if(home){this.group=new THREE.Group();const a=new Pieces(this.group).frame(home.x,home.y,home.z,home.yaw);furnish(a,home);a.finish();this.parent.add(this.group);}
    }
    if(!home)return;
    const p=homeLocal(home,eye);setPieceVisibility(home.renderHandles.roof,false);
    for(const [side,hide] of [['left',p.x<0],['right',p.x>0],['back',p.z<0],['front',p.z>0]])setPieceVisibility(home.renderHandles[side],!hide);
    return home.id;
  }
}
