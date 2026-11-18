import * as THREE from 'three';
import {paintingStage} from './home-fixtures.js';

// The same original painting is rendered on linen in the room and on the print.
export function drawPainting(canvas,id,stage){
  const ctx=canvas.getContext('2d'),harbor=id==='easel-1';
  ctx.save();ctx.scale(canvas.width/320,canvas.height/240);
  const rect=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  const oval=(x,y,rx,ry,color,angle=0)=>{
    ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,angle,0,2*Math.PI);ctx.fill();
  };
  const shape=(color,pts)=>{
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...pts[0]);for(const p of pts.slice(1))ctx.lineTo(...p);ctx.closePath();ctx.fill();
  };
  let state=harbor?681:921;
  const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  rect(0,0,320,240,'#eee1bf');
  if(stage>=1){
    const sky=ctx.createLinearGradient(0,0,0,140);
    sky.addColorStop(0,harbor?'#799ba5':'#91acac');sky.addColorStop(1,harbor?'#f0bb89':'#f1dab2');rect(0,0,320,145,sky);
    rect(0,143,320,97,harbor?'#749e9d':'#a4ad71');
    oval(harbor?226:76,58,15,15,harbor?'#ffdc98':'#f2db9e');
    for(let i=0;i<32;i++)oval(rand()*320,24+rand()*73,3+rand()*18,1+rand()*2,'rgba(255,235,205,.18)');
  }
  if(stage>=2){
    shape(harbor?'#8f9b96':'#899683',[[0,110],[38,96],[72,109],[113,91],[160,116],[216,94],[255,112],[302,86],[320,91],[320,146],[0,146]]);
    shape(harbor?'#526f76':'#648574',[[0,83],[33,90],[61,111],[85,120],[127,135],[153,140],[0,152]]);
    if(harbor){
      shape('#708677',[[320,108],[275,115],[254,130],[211,137],[189,146],[320,143]]);
      for(let i=0;i<110;i++){
        const x=rand()*320,y=148+rand()*88;
        oval(x,y,2+rand()*11,rand()*1.2+.5,Math.abs(x-226)<36?'#d7bb8c':'#9db4a7');
      }
    }else{
      shape('#698765',[[0,148],[60,134],[123,142],[178,130],[243,146],[320,122],[320,240],[0,240]]);
      shape('#d4b887',[[207,137],[221,137],[177,165],[202,184],[254,211],[272,240],[200,240],[182,210],[155,188],[152,168]]);
      for(let i=0;i<110;i++)oval(rand()*320,151+rand()*90,2+rand()*6,1,'#91a06c',-.22);
    }
  }
  if(stage>=3){
    if(harbor){
      for(const [x,y,size] of [[45,128,10],[66,131,9],[82,133,8],[265,131,10],[279,129,8]]){
        rect(x,y,size,size*.68,'#e7cda4');shape('#a55f4d',[[x-2,y],[x+size*.45,y-size*.53],[x+size+1,y]]);
        rect(x+size*.55,y+1,2,4,'#596765');
      }
      shape('#f4dcaf',[[181,126],[181,177],[157,174]]);
      shape('#c48361',[[184,139],[184,177],[201,177]]);
      rect(181,124,1.7,59,'#635747');shape('#714d44',[[153,180],[203,180],[196,186],[164,186]]);
    }else{
      shape('#725d44',[[37,164],[44,87],[48,78],[48,123],[61,105],[49,137],[48,163]]);
      for(let i=0;i<76;i++)oval(45+(rand()-.5)*69,72+rand()*47,3+rand()*9,3+rand()*12,['#486858','#607e60','#899764'][i%3],.12);
      rect(246,124,19,12,'#f3d8ac');shape('#9c6255',[[242,126],[255,114],[270,125]]);
    }
  }
  if(stage>=4){
    if(harbor){
      shape('#4f6156',[[0,188],[33,197],[69,200],[105,216],[144,220],[181,240],[0,240]]);
      for(let i=0;i<68;i++){
        const x=rand()*148,y=202+x*.22+rand()*21;
        oval(x,y,1.3+rand()*3,1+rand()*2,['#a3aa77','#c6b889','#e2b487'][i%3]);
      }
      for(const [x,y] of [[137,58],[151,51],[108,69]]){
        ctx.strokeStyle='#6f7771';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(x-4,y-2);ctx.quadraticCurveTo(x-1,y-2,x,y);ctx.quadraticCurveTo(x+2,y-3,x+5,y-2);ctx.stroke();
      }
    }else{
      for(let i=0;i<155;i++){
        const x=rand()*320,y=161+rand()*82;
        if(x>145&&x<224&&y>167)continue;
        const r=1+(y-161)*.033;rect(x,y,1,r*2,'#496950');
        oval(x,y-r,r*1.4,r,['#cf6551','#ae4b40','#ed9269'][i%3]);oval(x,y-r,r*.4,r*.4,'#694c40');
      }
    }
  }
  for(let y=0;y<240;y+=2)rect(0,y,320,.45,'rgba(92,71,47,.05)');
  for(let x=0;x<320;x+=3)rect(x,0,.5,240,'rgba(255,239,213,.07)');
  ctx.restore();
}

export class EaselCanvas{
  constructor(frame,item){
    this.id=item.id;
    this.canvas=document.createElement('canvas');this.canvas.width=384;this.canvas.height=288;
    this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(.80,.60),new THREE.MeshLambertMaterial({map:this.texture}));
    const group=new THREE.Group();group.position.set(item.x,0,item.z);group.rotation.y=(item.turn||0)*Math.PI/2;
    panel.position.set(0,1.37,.122);group.add(panel);frame.add(group);
  }
  update(layout,lot){
    const stage=paintingStage(layout,lot,this.id);
    if(stage===this.stage)return;
    drawPainting(this.canvas,this.id,stage);this.texture.needsUpdate=true;this.stage=stage;
  }
}
