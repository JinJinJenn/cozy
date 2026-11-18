import {bridgeHeightAt} from './bridge-profile.js';
import {contextFromPlan} from '../packages/sim/src/context.js';
import {Simulation} from '../packages/sim/src/simulation.js';
import {prepareHomes} from './home-plan.js';
import {syncInteriors} from './home-furnishing.js';
import {plotsForStreet,defaultLayout} from './street-world.js';
import {bindResidentWorld,rerouteResidents} from './resident-world.js';
let sim,street,firstLayout;
self.onmessage=e=>{
  const m=e.data;
  try{
    if(m.type==='init'){
      firstLayout=true;
      const island=m.island,{grid:N,half,cell,h,water}=island;
      const bil=(a,x,z)=>{
        const fi=Math.min(N-1.0001,Math.max(0,(x+half)/cell)),fj=Math.min(N-1.0001,Math.max(0,(z+half)/cell));
        const i=Math.floor(fi),j=Math.floor(fj),tx=fi-i,tz=fj-j,k=j*N+i;
        return (a[k]*(1-tx)+a[k+1]*tx)*(1-tz)+(a[k+N]*(1-tx)+a[k+N+1]*tx)*tz;
      };
      island.sample=(x,z)=>bil(h,x,z);island.waterAt=(x,z)=>Math.max(0,bil(water,x,z));
      island.slope=(x,z,e=cell)=>Math.hypot((island.sample(x+e,z)-island.sample(x-e,z))/(2*e),(island.sample(x,z+e)-island.sample(x,z-e))/(2*e));
      island.deckHeight=bridgeHeightAt(island.sample,island.bridgeSpans);
      const plots=plotsForStreet(island);prepareHomes(island,plots);
      street={island,plots,session:{layout:defaultLayout(),actors:new Map(),activities:{routes:new Map()}}};
      const ctx=contextFromPlan({seed:island.seed,presetId:island.presetId,island},island.plan);
      bindResidentWorld(ctx,street);sim=Simulation.create(m.config,{ctx});
      self.postMessage({type:'ready'});
    }else if(m.type==='step'){
      const start=performance.now(),session=street.session;
      const previous=session.layout;
      session.layout=m.layout;session.actors=new Map(m.actors.map(a=>[a.id,a]));session.activities.routes=new Map(m.routes);
      const revised=previous.revision!==m.layout.revision;
      if(firstLayout||revised){
        firstLayout=false;
        const homes=[];
        if(!syncInteriors(street.island,previous,m.layout,false,homes))throw Error('The resident worker could not apply the room layout.');
        rerouteResidents(sim,homes);
        if(revised&&(!homes.length||m.layout.revision!==previous.revision+1))sim._recheckAll();
      }
      const times=[];
      for(let i=0;i<m.steps;i++){const t=performance.now();sim.step();times.push(performance.now()-t);}
      self.postMessage({type:'frame',positions:sim.positions(),tick:sim.tick,ms:performance.now()-start,times});
    }
  }catch(e){self.postMessage({type:'error',message:e.stack||String(e)});}
};
