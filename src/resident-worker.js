import {contextFromPlan} from '../packages/sim/src/context.js';
import {Simulation} from '../packages/sim/src/simulation.js';
import {prepareHomes} from './home-plan.js';
import {applyRoomPlans} from './room-divider.js';
import {plotsForStreet,defaultLayout} from './street-world.js';
import {bindResidentWorld} from './resident-world.js';
let sim,street;
self.onmessage=e=>{
  const m=e.data;
  try{
    if(m.type==='init'){
      const island=m.island,{grid:N,half,cell,h,water}=island;
      const bil=(a,x,z)=>{
        const fi=Math.min(N-1.0001,Math.max(0,(x+half)/cell)),fj=Math.min(N-1.0001,Math.max(0,(z+half)/cell));
        const i=Math.floor(fi),j=Math.floor(fj),tx=fi-i,tz=fj-j,k=j*N+i;
        return (a[k]*(1-tx)+a[k+1]*tx)*(1-tz)+(a[k+N]*(1-tx)+a[k+N+1]*tx)*tz;
      };
      island.sample=(x,z)=>bil(h,x,z);island.waterAt=(x,z)=>Math.max(0,bil(water,x,z));
      island.slope=(x,z,e=cell)=>Math.hypot((island.sample(x+e,z)-island.sample(x-e,z))/(2*e),(island.sample(x,z+e)-island.sample(x,z-e))/(2*e));
      island.deckHeight=(x,z)=>{
        let y=island.sample(x,z);
        for(const {a,b,radius} of island.bridgeSpans){
          const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;if(!length)continue;
          const t=((x-a[0])*dx+(z-a[1])*dz)/length;
          if(t>=0&&t<=1&&Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<=radius)y=Math.max(y,a[2]+(b[2]-a[2])*t);
        }
        return y;
      };
      const plots=plotsForStreet(island);prepareHomes(island,plots);
      street={island,plots,session:{layout:defaultLayout(),actors:new Map(),activities:{routes:new Map()}}};
      const ctx=contextFromPlan({seed:island.seed,presetId:island.presetId,island},island.plan);
      bindResidentWorld(ctx,street);sim=Simulation.create(m.config,{ctx});
      self.postMessage({type:'ready'});
    }else if(m.type==='step'){
      const start=performance.now(),session=street.session;
      if(session.layout.revision!==m.layout.revision){
        applyRoomPlans(street.island,session.layout.rooms?.lots,m.layout.rooms?.lots);
        sim._recheckAll();
      }
      session.layout=m.layout;session.actors=new Map(m.actors.map(a=>[a.id,a]));session.activities.routes=new Map(m.routes);
      const times=[];
      for(let i=0;i<m.steps;i++){const t=performance.now();sim.step();times.push(performance.now()-t);}
      self.postMessage({type:'frame',positions:sim.positions(),tick:sim.tick,ms:performance.now()-start,times});
    }
  }catch(e){self.postMessage({type:'error',message:e.stack||String(e)});}
};
