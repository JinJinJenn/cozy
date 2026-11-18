import {parcelCredential,savedParcel} from './private-saves.js';

export const absenceGrace=120000;
const maxLeases=40;
const keyPattern=/^[A-Za-z0-9_-]{87}$/,uuid=/^[0-9a-f-]{36}$/i;
const curve={name:'ECDSA',namedCurve:'P-256'},signature={name:'ECDSA',hash:'SHA-256'};
const bytes=new TextEncoder();
const encode=data=>btoa(String.fromCharCode(...new Uint8Array(data)));
const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const fits=(home,lot)=>lot.w+.001>=home.w&&lot.d+.001>=home.d;
const distance=(a,b)=>(a.x-b.x)**2+(a.z-b.z)**2;

export class ParcelBook{
  constructor(homes){this.homes=homes;this.entries=[];this.revision=0;}
  byLot(lot){return this.entries.find(p=>p.lot===lot);}
  byKey(key){return this.entries.find(p=>p.key===key);}
  change(){this.revision++;}
  sweep(present,now){
    this.entries=this.entries.filter(p=>{
      if(present(p.actor)){
        if(p.until){p.until=0;this.change();}
      }else if(!p.until){p.until=now+absenceGrace;this.change();}
      else if(p.until<=now){this.change();return false;}
      return true;
    });
  }
  decide({key,home:source,lot,action},actor,present){
    const home=this.homes.get(source),target=this.homes.get(lot),own=this.byKey(key);
    if(!home||!target||own&&own.home!==source)return {code:'invalid'};
    if(own&&own.actor!==actor&&present(own.actor))return {code:'other-device'};
    if(this.entries.some(p=>p.actor===actor&&p.key!==key))return {code:'other-save'};
    if(action==='release'){
      if(!own||own.lot!==lot)return {code:'invalid'};
      this.entries=this.entries.filter(p=>p!==own);this.change();return {code:'released'};
    }
    if(own){
      if(own.actor!==actor||own.until){own.actor=actor;own.until=0;this.change();}
      return {code:'owned',lot:own.lot};
    }
    if(action==='resume')return {code:'expired'};
    if(action!=='claim'||this.entries.length>=maxLeases)return {code:'unavailable'};
    if(this.byLot(lot)||!fits(home,target)){
      let best;
      for(const b of this.homes.values())if(!this.byLot(b.id)&&fits(home,b)&&(!best||distance(target,b)<distance(target,best)))best=b;
      return {code:this.byLot(lot)?'taken':'small',lot:best?.id};
    }
    this.entries.push({key,home:source,lot,actor,until:0});this.change();
    return {code:'owned',lot};
  }
  hydrate(revision,entries){
    if(!Number.isSafeInteger(revision)||revision<0||!Array.isArray(entries)||entries.length>maxLeases)return false;
    const keys=new Set(),lots=new Set(),actors=new Set();
    for(const p of entries){
      if(!p||!keyPattern.test(p.key)||!uuid.test(p.actor)||!Number.isSafeInteger(p.until)||p.until<0||
        !this.homes.has(p.home)||!this.homes.has(p.lot)||!fits(this.homes.get(p.home),this.homes.get(p.lot))||
        keys.has(p.key)||lots.has(p.lot)||actors.has(p.actor))return false;
      keys.add(p.key);lots.add(p.lot);actors.add(p.actor);
    }
    this.entries=entries.map(({key,home,lot,actor,until})=>({key,home,lot,actor,until}));this.revision=revision;return true;
  }
}

export class PublicAddresses{
  constructor(session){
    this.session=session;this.book=new ParcelBook(session.island.homesById);
    this.queue=Promise.resolve();this.checking=new Set();
    try{this.key=savedParcel()?.pub;}catch{ /* The town also works without persistent storage. */ }
  }
  get own(){return this.key&&this.confirmed?.find(p=>p.key===this.key);}
  confirm(revision){
    if(revision===this.book.revision&&this.confirmedRevision!==revision){
      this.confirmed=this.book.entries.map(p=>({...p}));this.confirmedRevision=revision;
    }
  }
  election(){
    this.synced=false;this.pending=null;this.busy=false;this.result=null;
    this.confirmedRevision=-1;
    if(!this.session.owner)this.confirmed=[];
    this.nextSweep=0;this.resumeAfter=0;this.generation=(this.generation||0)+1;
  }
  present(id){
    const s=this.session;
    return id===s.id||[...s.lobby.members.values()].some(m=>m.actor===id);
  }
  async request(action,lot){
    const s=this.session,epoch=this.generation;
    if(this.busy||!s.ready||(!s.owner&&!this.synced))return;
    this.busy=true;this.result=null;
    try{
      const credential=await parcelCredential(lot);
      const host=s.owner?s.boot:s.hostBoot;
      const id=crypto.randomUUID(),body=JSON.stringify([s.lobby.room,host,s.id,id,action,lot,credential.home,credential.pub]);
      const sig=encode(await crypto.subtle.sign(signature,credential.key,bytes.encode(body)));
      if(s.closed||epoch!==this.generation)return;
      this.key=credential.pub;
      this.pending={kind:'parcel',body,sig,id};this.sentAt=performance.now();this.started=this.sentAt;
      this.send();
    }catch(e){if(epoch===this.generation){this.result={code:'error',message:e.message};this.busy=false;}}
  }
  send(){
    const s=this.session;
    if(s.owner)this.receive(s.id,this.pending);
    else s.connections.forEach(c=>c.send(this.pending));
  }
  receive(actor,m){
    const s=this.session,epoch=this.generation,a=s.actors.get(actor);
    if(!s.owner||!a||this.checking.has(actor)||typeof m.body!=='string'||m.body.length>800||
       typeof m.sig!=='string'||m.sig.length!==88||!uuid.test(m.id)||a.parcelReply?.id===m.id)return;
    let fields;try{fields=JSON.parse(m.body);}catch{return;}
    if(!Array.isArray(fields)||fields.length!==8)return;
    const [room,boot,player,id,action,lot,home,key]=fields;
    if(room!==s.lobby.room||boot!==s.boot||player!==actor||id!==m.id||!keyPattern.test(key)||
       !['claim','release','resume'].includes(action)||!this.book.homes.has(lot)||!this.book.homes.has(home))return;
    const now=performance.now();
    if(now-(a.parcelChecked??-Infinity)<250)return;
    a.parcelChecked=now;this.checking.add(actor);
    // Commit in arrival order even when the second signature verifies first.
    this.queue=this.queue.then(async()=>{
      const verifier=await crypto.subtle.importKey('raw',decode(key),curve,false,['verify']);
      if(!await crypto.subtle.verify(signature,verifier,decode(m.sig),bytes.encode(m.body))||
         s.closed||epoch!==this.generation||s.actors.get(actor)!==a||!this.present(actor))return;
      const result=this.book.decide({key,home,lot,action},actor,other=>this.present(other));
      a.parcelReply={id,...result,revision:this.book.revision};
    }).catch(()=>{}).finally(()=>this.checking.delete(actor));
  }
  tick(now){
    const s=this.session;
    if(s.owner&&now>=this.nextSweep){
      this.nextSweep=now+1000;this.book.sweep(id=>this.present(id),Date.now());
    }
    if(s.owner&&this.confirmedRevision!==this.book.revision){
      const reachable=new Set([...s.lobby.members.values()].map(p=>p.actor));
      const voters=reachable.size<=12?reachable:[...s.controls.keys()].filter(id=>reachable.has(id));
      if([...voters].every(id=>s.controls.get(id)?.parcelRevision===this.book.revision))this.confirm(this.book.revision);
    }
    if(this.pending){
      const reply=s.actors.get(s.id)?.parcelReply;
      if(reply?.id===this.pending.id&&this.confirmedRevision>=reply.revision){
        this.result=reply;this.pending=null;this.busy=false;
      }else if(now-this.started>12000){
        this.result={code:'timeout'};this.pending=null;this.busy=false;
      }else if(now-this.sentAt>900){this.sentAt=now;this.send();}
    }
    if(this.own&&this.own.actor!==s.id&&!this.busy&&(s.owner||this.synced)&&
      !this.present(this.own.actor)&&now>=this.resumeAfter){
      this.resumeAfter=now+5000;void this.request('resume',this.own.lot);
    }
  }
}
