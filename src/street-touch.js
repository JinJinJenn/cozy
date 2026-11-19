// The steering thumb keeps its capture while the other thumb slides between pedals.
export class StreetTouch {
  constructor(panel,listen,onInput){
    this.panel=panel;
    this.pad=panel.querySelector('#walk-pad');
    this.stick=panel.querySelector('#pad-stick');
    this.pedals=panel.querySelector('#car-pedals');
    this.buttons=[...this.pedals.querySelectorAll('button')];
    this.contacts=new Map();
    this.x=0;this.z=0;this.driving=false;this.steeringId=null;

    const steer=e=>{
      const r=this.pad.getBoundingClientRect();
      let x=(e.clientX-r.left-r.width/2)/(r.width*.35);
      let z=this.driving?0:(r.top+r.height/2-e.clientY)/(r.height*.35);
      const n=Math.max(1,Math.hypot(x,z));
      this.x=x/n;this.z=z/n;
      this.stick.style.transform='translate('+this.x*22+'px,'+-this.z*22+'px)';
      onInput();
    };
    listen(this.pad,'pointerdown',e=>{
      if(e.button!==0||this.steeringId!==null)return;
      e.preventDefault();this.steeringId=e.pointerId;this.pad.setPointerCapture(e.pointerId);steer(e);
    });
    listen(this.pad,'pointermove',e=>{if(this.steeringId===e.pointerId)steer(e);});
    const stopSteering=e=>{
      if(this.steeringId!==e.pointerId)return;
      this.resetSteering();onInput();
    };
    for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(this.pad,type,stopSteering);

    const pedalAt=e=>{
      const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-pedal]');
      return this.pedals.contains(hit)?hit.dataset.pedal:null;
    };
    const press=(id,pedal)=>{
      if(this.contacts.has(id)&&this.contacts.get(id)===pedal)return;
      this.contacts.set(id,pedal);this.showPedals();onInput();
    };
    const release=id=>{
      if(this.contacts.delete(id)){this.showPedals();onInput();}
    };
    listen(this.pedals,'pointerdown',e=>{
      const pedal=pedalAt(e);
      if(!this.driving||e.button!==0||!pedal)return;
      e.preventDefault();this.pedals.setPointerCapture(e.pointerId);press(e.pointerId,pedal);
    });
    listen(this.pedals,'pointermove',e=>{
      if(this.contacts.has(e.pointerId))press(e.pointerId,pedalAt(e));
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(this.pedals,type,e=>release(e.pointerId));
    for(const button of this.buttons){
      listen(button,'keydown',e=>{
        if(!this.driving||!['Space','Enter'].includes(e.code))return;
        e.preventDefault();e.stopPropagation();press(button,button.dataset.pedal);
      });
      listen(button,'keyup',e=>{if(['Space','Enter'].includes(e.code))release(button);});
      listen(button,'blur',()=>release(button));
    }
  }
  resetSteering(){
    const id=this.steeringId;this.steeringId=null;
    if(id!==null&&this.pad.hasPointerCapture(id))this.pad.releasePointerCapture(id);
    this.x=0;this.z=0;this.stick.style.transform='';
  }
  showPedals(){
    const held=new Set(this.contacts.values());
    this.throttle=Number(held.has('gas'))-Number(held.has('reverse'));
    this.brake=held.has('brake');this.handbrake=held.has('handbrake');
    for(const button of this.buttons)button.toggleAttribute('data-held',held.has(button.dataset.pedal));
  }
  clear(){
    this.resetSteering();
    for(const id of this.contacts.keys()){
      if(typeof id==='number'&&this.pedals.hasPointerCapture(id))this.pedals.releasePointerCapture(id);
    }
    this.contacts.clear();this.showPedals();
  }
  setDriving(driving){
    if(driving===this.driving)return;
    this.clear();this.driving=driving;
    this.panel.classList.toggle('driving',driving);
    this.pad.setAttribute('aria-label',driving?'Steer left or right':'Walk');
  }
}
