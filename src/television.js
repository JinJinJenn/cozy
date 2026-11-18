import * as THREE from 'three';
import {televisionIn,tvChannels} from './home-fixtures.js';

// Original title cards drawn on the one set visible inside the occupied home.
const width=224,height=128;

function polygon(ctx,color,points){
  ctx.fillStyle=color;ctx.beginPath();
  for(let i=0;i<points.length;i+=2){
    if(i===0)ctx.moveTo(points[i],points[i+1]);else ctx.lineTo(points[i],points[i+1]);
  }
  ctx.closePath();ctx.fill();
}

function disc(ctx,color,x,y,r){
  ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
}

function harbor(ctx,t){
  ctx.fillStyle='#f2c891';ctx.fillRect(0,0,width,height);
  disc(ctx,'#ffebba',166,42,16);
  polygon(ctx,'#ac8990',[0,57,31,42,60,49,96,28,124,44,151,37,184,50,224,37,224,74,0,74]);
  polygon(ctx,'#586e75',[0,67,26,57,68,63,100,54,134,69,182,55,224,61,224,78,0,78]);
  ctx.fillStyle='#40818a';ctx.fillRect(0,70,width,58);
  for(let i=0;i<22;i++){
    const x=(i*57+t*5)%245-16,y=76+(i*13)%49;
    ctx.fillStyle=i%3?'#80b0aa':'#dec69f';ctx.fillRect(x,y,8+i%10,1.2);
  }
  ctx.save();ctx.translate((t*8)%302-49,83+Math.sin(t*1.6)*1.1);
  polygon(ctx,'#234351',[-19,-3,41,-3,34,5,-12,5]);
  ctx.fillStyle='#f6dfaf';ctx.fillRect(-12,-14,41,11);ctx.fillRect(-6,-19,23,7);
  ctx.fillStyle='#b35444';ctx.fillRect(-15,-15,46,2);ctx.fillRect(-1,-24,5,6);
  ctx.fillStyle='#496975';for(let i=0;i<6;i++)ctx.fillRect(-8+i*6,-11,4,4);
  ctx.restore();
}

function kitchen(ctx,t){
  ctx.fillStyle='#eab8a0';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#f6d8b4';for(let row=0;row<5;row++)for(let col=-1;col<6;col++)ctx.fillRect(col*42+(row%2)*21,row*18,40,16);
  ctx.fillStyle='#9b5949';ctx.fillRect(0,88,width,40);
  ctx.fillStyle='#e6b681';ctx.fillRect(0,91,width,5);
  ctx.fillStyle='#326861';ctx.fillRect(53,65,74,38);
  polygon(ctx,'#51948b',[53,65,125,65,119,95,108,103,70,103,59,95]);
  ctx.fillStyle='#274e4a';ctx.fillRect(46,64,17,5);ctx.fillRect(119,64,17,5);
  ctx.fillStyle='#d7aa61';ctx.fillRect(55,63,70,4);
  ctx.strokeStyle='#fff2cf';ctx.lineWidth=2;
  for(let i=0;i<3;i++){
    const x=70+15*i,drift=Math.sin(t*2+i)*5;
    ctx.beginPath();ctx.moveTo(x,59);ctx.bezierCurveTo(x-8,48,x+drift+8,42,x+drift,32);ctx.stroke();
  }
  ctx.save();ctx.translate(96,65);ctx.rotate(.43+.19*Math.sin(t*2));
  ctx.fillStyle='#875937';ctx.fillRect(-2,-40,4,40);ctx.restore();
  for(let i=0;i<3;i++){
    const x=155+i*12,y=94-i%2*5;disc(ctx,'#bd5143',x,y,8);
    polygon(ctx,'#51734d',[x-4,y-6,x,y-11,x+1,y-8,x+5,y-9,x+2,y-5]);
  }
}

function sky(ctx,t){
  ctx.fillStyle='#202e53';ctx.fillRect(0,0,width,height);
  for(let i=0;i<52;i++){
    const x=(i*79+13)%224,y=(i*47+7)%96;
    disc(ctx,'#e8ddba',x,y,.55+.5*(1+Math.sin(t*1.2+i*2)));
  }
  disc(ctx,'#ffe5a5',162,36,19);disc(ctx,'#202e53',169,30,18);
  const pass=(t%8)/2;
  if(pass<1){
    const x=38+pass*118,y=18+pass*31;
    polygon(ctx,'#c9d8e5',[x-17,y-5,x,y-1,x+2,y+1,x,y+2]);
  }
  polygon(ctx,'#374565',[0,98,36,76,72,94,115,68,161,87,195,72,224,89,224,128,0,128]);
  polygon(ctx,'#172e3e',[0,107,46,94,82,110,143,88,179,105,224,91,224,128,0,128]);
}

const programs=[null,harbor,kitchen,sky],titles=tvChannels.map(name=>name.toUpperCase());

export class TelevisionScreen{
  constructor(parent,home){
    this.parent=parent;this.mount=televisionIn(home);this.channel=0;this.frame=-1;
  }
  update(channel,time){
    if(!channel){if(this.mesh)this.mesh.visible=false;this.channel=0;return;}
    const frame=Math.floor(time*8);
    if(channel===this.channel&&frame===this.frame)return;
    if(!this.mesh){
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      this.context=canvas.getContext('2d');
      this.texture=new THREE.CanvasTexture(canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
      this.texture.generateMipmaps=false;this.texture.minFilter=THREE.LinearFilter;
      const mesh=this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.71),
        new THREE.MeshBasicMaterial({map:this.texture,toneMapped:false}));
      const m=this.mount;
      mesh.rotation.y=m.yaw;
      mesh.position.set(m.x,m.y,m.z);mesh.translateX(-.10);mesh.translateZ(.057);this.parent.add(mesh);
    }
    this.channel=channel;this.frame=frame;this.mesh.visible=true;
    const ctx=this.context;programs[channel](ctx,frame/8);
    ctx.font='bold 10px sans-serif';ctx.fillStyle='#202f37';
    ctx.fillRect(7,7,ctx.measureText(titles[channel]).width+10,15);
    ctx.fillStyle='#fff1cc';ctx.fillText(titles[channel],12,18);
    this.texture.needsUpdate=true;
  }
}
