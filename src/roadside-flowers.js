export const flowers=Object.freeze({
  daisy:{name:'daisy',petals:'#faf0ce',center:'#dca249',count:8},
  poppy:{name:'poppy',petals:'#e5786a',center:'#574640',count:5},
  cornflower:{name:'cornflower',petals:'#8fa8da',center:'#725d94',count:7}
});
export const validFlower=value=>typeof value==='string'&&Object.hasOwn(flowers,value);
export function flowerFor(id){
  let hash=0;for(const ch of id)hash=(Math.imul(hash,31)+ch.charCodeAt(0))>>>0;
  return ['daisy','poppy','cornflower'][hash%3];
}
export const flowerBox={x:1.87,z:-.02};
export function flowerAction(layout,bed,spot,actor){
  if(actor.bowlFrom||actor.cup||actor.tray)return null;
  const bare=layout.cutFlowerBeds?.includes(bed);
  return {...spot,action:bare?'water':'clip',label:bare?'Water the flower box':'Pick a '+spot.species};
}
export function finishFlowers(session,actor){
  const {lot}=actor.using,bed=session.island.streetBenches?.get(lot);
  if(!bed?.species)return '';
  const cut=session.layout.cutFlowerBeds||[];
  if(actor.activity==='clip'&&!cut.includes(lot)){
    session.layout.cutFlowerBeds=[...cut,lot];
    actor.pickedFlower={id:crypto.randomUUID(),species:bed.species};
    actor.profile={...actor.profile,flower:bed.species};
    if(actor.id===session.id)session.keepPickedFlower(actor);
    session.persist();return 'You pinned a '+bed.species+' to your shirt.';
  }
  if(actor.activity==='water'&&cut.includes(lot)){
    const remaining=cut.filter(id=>id!==lot);
    if(remaining.length)session.layout.cutFlowerBeds=remaining;else delete session.layout.cutFlowerBeds;
    session.persist();return 'Fresh flowers are ready to pick.';
  }
  return '';
}
