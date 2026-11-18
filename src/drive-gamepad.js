const deadzone=.12;
const trigger=button=>button?.value>.025?Math.min(1,button.value):0;

export function driveGamepad(pads){
  let idle=null;
  for(const pad of pads){
    if(!pad?.connected||pad.mapping!=='standard')continue;
    const x=pad.axes[0]||0;
    const steer=Math.sign(x)*Math.max(0,(Math.abs(x)-deadzone)/(1-deadzone));
    const gas=trigger(pad.buttons[7]),brake=trigger(pad.buttons[6]);
    const reverse=!!pad.buttons[1]?.pressed,exit=!!pad.buttons[3]?.pressed;
    const state={steer:Math.round(steer*64)/64,pedal:reverse?-1:Math.round(gas*64)/64,
      brake:Math.round(brake*64)/64,exit,index:pad.index};
    if(state.steer||state.pedal||state.brake||state.exit)return state;
    idle??=state;
  }
  return idle;
}
