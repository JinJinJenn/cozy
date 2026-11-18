// Resolution and shadow cost scale independently of town geometry. Lower settings
// retain the same buildings, doors, furniture and road silhouettes.
export function graphicsSettings(renderer,canvas){
  const presets={low:{pixels:1000000,ratio:1,shadows:false},balanced:{pixels:2200000,ratio:1.5,shadows:true},high:{pixels:4200000,ratio:2,shadows:true}};
  let mode='auto';try{mode=localStorage.getItem('cozy.graphics')||'auto';}catch{}
  if(mode!=='auto'&&!presets[mode])mode='auto';
  const panel=document.createElement('details');panel.id='graphics-settings';
  panel.innerHTML='<summary>Graphics <span>v0.13.0</span></summary><label>Quality <select aria-label="Graphics quality"><option value="auto">Auto</option><option value="low">Low</option><option value="balanced">Balanced</option><option value="high">High</option></select></label><output></output>';
  document.body.appendChild(panel);
  const select=panel.querySelector('select'),readout=panel.querySelector('output');select.value=mode;
  let scale=1,average=16.7,last=0,samples=0,sampleTime=0,next=0,ratio=1,autoShadows=true;
  const current=()=>presets[mode==='auto'?'balanced':mode];
  function resize(){
    const p=current();ratio=Math.min(devicePixelRatio||1,p.ratio,Math.sqrt(p.pixels/Math.max(1,innerWidth*innerHeight)))*scale;
    renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight,false);renderer.shadowMap.enabled=p.shadows&&(mode!=='auto'||autoShadows);
  }
  select.onchange=()=>{mode=select.value;scale=1;samples=0;sampleTime=0;autoShadows=true;resize();try{localStorage.setItem('cozy.graphics',mode);}catch{}};
  function frame(now){
    if(last){const dt=now-last;if(document.visibilityState==='visible'&&dt>3&&dt<1000){average=average*.95+dt*.05;samples++;sampleTime+=dt;}}
    last=now;
    if(now<next)return;next=now+1500;
    if(mode==='auto'&&samples>=20&&sampleTime>3000&&average>28){
      if(scale>.56)scale=Math.max(.55,scale-.1);else autoShadows=false;
      samples=0;sampleTime=0;resize();
    }
    if(panel.open)readout.textContent=Math.round(1000/average)+' FPS · '+canvas.width+' × '+canvas.height;
  }
  resize();
  return {resize,frame,info:()=>({mode,ratio,width:canvas.width,height:canvas.height,frameMs:average,shadows:renderer.shadowMap.enabled})};
}
