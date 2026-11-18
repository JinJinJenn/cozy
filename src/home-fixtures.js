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

export function entrySwitchPosition(home){
  return {x:-home.door.width/2-.08,y:1.18,z:home.d/2-.23};
}
export function installedLampMask(home){
  let mask=0;
  for(const f of home.furniture)mask|=lamps[f.type]?.bit||0;
  return mask;
}
export function setFixtureValue(layout,field,lot,value){
  if(value){(layout[field]??={})[lot]=value;return;}
  if(!layout[field])return;
  delete layout[field][lot];
  if(!Object.keys(layout[field]).length)delete layout[field];
}
export function switchEntryLights(session,home){
  const {layout}=session,id=home.id,on=!layout.entryLights?.[id];
  const linked=installedLampMask(home)&~(layout.unlinkedLamps?.[id]||0);
  const current=layout.homeLights?.[id]||0;
  setFixtureValue(layout,'entryLights',id,on?1:0);
  setFixtureValue(layout,'homeLights',id,on?current|linked:current&~linked);
  session.persist();
  return on;
}

export const tvChannels=['Off','Harbor Ferry','The Kitchen Window','Night Sky'];

export function televisionIn(home){
  const sofa=(home.generatedFurniture||home.furniture).find(f=>f.type==='sofa'),side=sofa.flip?-1:1;
  return {x:side*(home.w/2-.40),z:sofa.z,y:1.70,yaw:-side*Math.PI/2,side};
}

export function sideWindows(home,side,tv){
  const centers=home.d>7?[-home.d*.24,home.d*.24]:[0];
  if(side!==tv.side)return centers;
  // Fit the frame, shutters and cabinet on solid wall, including narrow studios.
  const limit=home.d/2-.99,placed=centers.filter(z=>Math.abs(z-tv.z)>=1.86);
  for(const original of centers){
    if(placed.includes(original))continue;
    let best;
    for(let z=-limit;z<=limit;z+=.10){
      if(Math.abs(z-tv.z)<1.86||placed.some(window=>Math.abs(z-window)<1.92))continue;
      if(best===undefined||Math.abs(z-original)<Math.abs(best-original))best=z;
    }
    if(best!==undefined)placed.push(best);
  }
  return placed;
}

export function tuneTelevision(session,lot,channel){
  if(!Number.isInteger(channel)||channel<0||channel>=tvChannels.length)return;
  if((session.layout.homeTV?.[lot]||0)===channel)return;
  const sets=session.layout.homeTV??={};
  if(channel)sets[lot]=channel;
  else{
    delete sets[lot];
    if(!Object.keys(sets).length)delete session.layout.homeTV;
  }
  session.persist();
}
