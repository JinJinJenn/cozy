import {defaultProfile,readProfile} from './player-profile.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const privateReconnectMs=60000;

// A visitor keeps one random ticket for the lifetime of the page, including
// a switch between signalling routes. Only the verified owner receives it.
export class VisitAdmission {
  constructor(required){
    this.required=required;
    this.visits=new Map();
    this.nextSweep=0;
  }
  sweep(now){
    if(now>=this.nextSweep){
      this.nextSweep=now+5000;
      for(const [key,v] of this.visits)if(now-v.last>privateReconnectMs)this.visits.delete(key);
    }
  }
  leave(sender){
    for(const [key,v] of this.visits){
      v.routes.delete(sender);
      if(v.status==='waiting'&&!v.routes.size)this.visits.delete(key);
    }
  }
  check(sender,input,now,report,full=false){
    const ticket=typeof input.visitTicket==='string'&&uuid.test(input.visitTicket)?input.visitTicket:null;
    // Old builds can still use open invites. Their grants only cover the
    // connection they joined on because they have no route-independent ticket.
    let key=ticket||sender;
    if(!ticket){
      const previous=[...this.visits.values()].find(v=>v.legacy&&v.actor===input.id&&
        (v.routes.has(sender)||!this.required&&v.status==='admitted'));
      if(previous)key=previous.key;
    }
    let visit=this.visits.get(key);
    if(!visit){
      if(this.visits.size>=48)return false;
      if([...this.visits.values()].some(v=>v.actor===input.id))return false;
      visit={key,actor:input.id,legacy:!ticket,name:(readProfile(input.profile)||defaultProfile(input.id)).name,
        home:typeof input.entryHome==='string'?input.entryHome.slice(0,64):null,
        status:this.required?'waiting':'admitted',routes:new Set(),reports:new Map()};
      this.visits.set(key,visit);
    }
    if(visit.actor!==input.id)return false;
    if(!visit.routes.has(sender)&&visit.routes.size>=5)return false;
    visit.routes.add(sender);
    visit.last=now;
    if(visit.status==='waiting'&&!this.required)visit.status='admitted';
    if(visit.status==='admitted'&&!full)return true;
    if(now-(visit.reports.get(sender)??-Infinity)>=2000){
      if(visit.reports.size>=5)visit.reports.clear();
      visit.reports.set(sender,now);report(visit.status==='admitted'?'full':visit.status);
    }
    return false;
  }
  get waiting(){return [...this.visits.values()].filter(v=>v.status==='waiting');}
  decide(key,allow){
    const visit=this.visits.get(key);
    if(visit?.status!=='waiting')return;
    visit.status=allow?'admitted':'declined';
    visit.reports.clear();
  }
}
