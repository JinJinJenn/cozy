// Metres from the centre of the furniture, before the home transform.
export function fixtureOutlet(f,action){
  if(action==='cook')return {x:-.05,y:1.31,z:f.d*.28};
  if(f.type==='kitchen')return {x:-.10,y:1.37,z:-f.d*.23};
  if(f.type==='basin')return {x:-.015,y:1.25,z:0};
  if(f.type==='shower')return {x:0,y:2.05,z:-.30};
}

export const lamps={
  desk:{bit:1,name:'desk lamp',x:-.36,z:0,top:.82,shade:1.24},
  nightstand:{bit:2,name:'bedside lamp',x:0,z:0,top:.60,shade:1.08}
};

export function lampIsLit(layout,lot,kind){
  return Boolean((layout?.homeLights?.[lot]||0)&lamps[kind].bit);
}
