import {catalog} from './furniture-pose.js';

// The host saves uneaten portions. A carried bowl reserves one of them for
// the life of its actor, so a dropped connection returns it to the pot.
export function potServings(session,lot){
  const total=session.layout.homeMeals?.[lot]||0;
  if(!total)return 0;
  let remaining=total;
  for(const actor of session.actors.values())if(actor.bowlFrom===lot)remaining--;
  return remaining;
}

export function mealStation(session,lot,spot,actor){
  if(spot.action==='cook')return !actor.bowlFrom&&!session.layout.homeMeals?.[lot]?spot:null;
  if(spot.action==='serveSoup')return !actor.bowlFrom&&potServings(session,lot)>0?spot:null;
  if(spot.action==='returnSoup')return actor.bowlFrom===lot?spot:null;
  if(spot.mealSeat&&actor.bowlFrom)return {...spot,action:'eat',label:'Eat soup '+(catalog[spot.object]?.type==='armchair'?'in the club chair':spot.object==='sofa'?'on the sofa':'at the table')};
  return spot;
}

export function finishHomeMeal(session,actor){
  if(actor.activity==='cook'){
    const lot=actor.using.lot,meals=session.layout.homeMeals??={};
    if(!meals[lot]){meals[lot]=2;session.persist();}
    return 'Your meal is ready. The pot holds two bowls of vegetable soup.';
  }
  if(actor.activity==='eat'&&actor.bowlFrom){
    const meals=session.layout.homeMeals,lot=actor.bowlFrom;
    if(meals?.[lot]){
      if(--meals[lot]===0)delete meals[lot];
      if(!Object.keys(meals).length)delete session.layout.homeMeals;
      session.persist();
    }
    delete actor.bowlFrom;
    return 'You finished your vegetable soup.';
  }
}
