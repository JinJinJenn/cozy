import {createBroadcastTransport} from '../packages/net/src/transport-broadcast.js';
import {createTrysteroTransport} from '../packages/net/src/transport-trystero.js';
import {defaultLayout,frontAt,hasEditableFront,isHome,wallLimit,moveWalker,readLayout,toRoom,toWorld,wallState,within} from './street-world.js';

const project='jenns-cozy-town-waterfront-v1';
const zero={x:0,z:0};
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const utf8=new TextEncoder(),algorithm={name:'ECDSA',namedCurve:'P-256'},signature={name:'ECDSA',hash:'SHA-256'};
const validKey=k=>typeof k==='string'&&/^[A-Za-z0-9_-]{87}$/.test(k);
const validActor=p=>p && typeof p.id==='string' && p.id.length<=64 && Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.yaw);
function stored(key){try{return JSON.parse(localStorage.getItem(key))}catch{return null}}
function save(key,data){try{localStorage.setItem(key,JSON.stringify(data));return true}catch{return false}}
async function identity(){
  const key=project+'.identity',old=stored(key);
  if(old&&validKey(old.pub)){try{return {pub:old.pub,privateKey:await crypto.subtle.importKey('jwk',old.jwk,algorithm,false,['sign'])}}catch{}}
  const pair=await crypto.subtle.generateKey(algorithm,true,['sign','verify']),pub=encode(await crypto.subtle.exportKey('raw',pair.publicKey));
  const jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
  return {pub,privateKey:pair.privateKey,persistent:save(key,{pub,jwk})};
}
function linkFor(pub){const u=new URL(location.href);u.search='';u.hash='';
  u.searchParams.set('view','street');u.searchParams.set('visit',pub);if(new URLSearchParams(location.search).get('net')==='local')u.searchParams.set('net','local');return u.href;}
function transports(){
  const list=[createBroadcastTransport({name:project})];
  if(new URLSearchParams(location.search).get('net')!=='local')list.push(createTrysteroTransport({appId:project}));
  return list;
}
export class StreetSession {
  constructor(island,plots,notice,town){
    this.island=island;this.plots=plots;this.cafe=plots.find(b=>b.cafe);this.notice=notice;this.town=town;
    this.id=crypto.randomUUID();this.boot=crypto.randomUUID();this.actors=new Map();this.controls=new Map();this.peers=new Map();
    this.roomList=new Map();this.connections=[];this.directory=[];this.connecting=null;this.discovery=null;
    this.layout=defaultLayout();this.time=0;this.seq=0;this.lastFrame=0;this.lastSent=0;this.connected=false;this.ready=false;this.listed=false;
    this.keys={...zero};this.inputSeq=0;this.actionSeq=0;this.verifiedSeq=-1;this.oldBoots=new Set();
    this.visit=new URLSearchParams(location.search).get('visit');this.owner=!this.visit;
    this.spawn=toWorld(this.cafe,0,this.cafe.d/2+3.4);
    this.actors.set(this.id,{id:this.id,...this.spawn,yaw:this.cafe.yaw+Math.PI,activity:'',part:''});
    this.start=this.init();
  }
  updatePatrol(){
    const [cottage,cafe,house]=this.plots;
    const approach=b=>toWorld(b,0,b.d/2+3.35);
    const entry=b=>toWorld(b,0,frontAt(b,this.layout)+.8);
    this.patrol=[approach(cottage),approach(cafe),toWorld(cafe,0,1.5),toWorld(cafe,0,-2.35),
      toWorld(cafe,0,1.5),approach(cafe),approach(house),entry(house),toWorld(house,0,.35),entry(house),
      approach(house),approach(cafe),approach(cottage),entry(cottage),toWorld(cottage,0,.35),entry(cottage)];
  }
  async init(){
    try{
      if(this.owner){
        const id=navigator.locks?await navigator.locks.request(project+'.create-owner',identity):await identity();this.pub=id.pub;
        if(navigator.locks){
          let inform;const acquired=new Promise(r=>inform=r);
          void navigator.locks.request(project+'.host.'+id.pub,{ifAvailable:true},async lock=>{
            inform(!!lock);if(lock&&!this.closed)await new Promise(r=>this.releaseLock=r);});
          if(!await acquired){this.owner=false;this.visit=id.pub;}
        }
        if(this.owner)this.privateKey=id.privateKey;
        this.layout=readLayout(stored(project+'.layout.'+this.pub))||defaultLayout();this.saved=id.persistent!==false;
      }
      if(this.owner){
        this.updatePatrol();
        for(let i=0;i<2;i++)this.actors.set('resident'+i,{id:'resident'+i,...this.patrol[i*6],yaw:0,activity:'',part:'',way:i*6,dwell:1+i*3});
      }else{
        if(!validKey(this.visit))throw Error('Invalid street invitation');
        this.pub=this.visit;this.publicKey=await crypto.subtle.importKey('raw',decode(this.pub),algorithm,false,['verify']);
      }
      if(this.closed)return;
      this.ready=true;
      await this.connect(!this.owner||!!stored(project+'.host.'+this.pub));
    }catch(e){this.notice(e.message);this.error=e.message;}
  }
  async open(name,connections,handlers,allow=()=>true){
    const joins=transports().filter(allow).map(async transport=>{
      try{const conn=await transport.join(name,handlers(transport.kind));if(this.closed)conn.leave();else connections.push(conn);}
      catch(e){if(!this.closed)this.transportError=String(e.message||e);}
    });
    await joins[0]; // Local discovery works even while public signalling is connecting.
    void Promise.allSettled(joins);
  }
  async connect(publicly=true){
    const handlers=kind=>({
        onMessage:(peer,m)=>this.receive(kind+'/'+peer,m),
        onPeerLeave:peer=>this.peers.delete(kind+'/'+peer),onError:()=>{}
    });
    const name='street-'+this.pub;
    this.connecting??=this.open(name,this.connections,handlers,t=>t.kind==='broadcast');
    await this.connecting;
    if(publicly&&!this.closed){
      this.wide??=this.open(name,this.connections,handlers,t=>t.kind!=='broadcast');
      if(this.owner)save(project+'.host.'+this.pub,true);
    }
    return !this.closed;
  }
  async invite(){await this.start;if(!this.owner||!this.ready||!await this.connect())return null;return linkFor(this.pub);}
  async discover(){
    if(!this.discovery)this.discovery=this.open('public-directory',this.directory,()=>({onMessage:(_,m)=>{
      if(m?.kind==='listed'&&validKey(m.pub)&&m.pub!==this.pub)this.roomList.set(m.pub,{url:linkFor(m.pub),seen:performance.now()});
      if(m?.kind==='unlisted')this.roomList.delete(m.pub);
      if(m?.kind==='browse'&&this.listed)this.advertise();
    }}));
    await this.discovery;this.directory.forEach(c=>c.send({kind:'browse'}));if(this.listed)this.advertise();
  }
  advertise(){this.directory.forEach(c=>c.send({kind:this.listed?'listed':'unlisted',pub:this.pub}));}
  rooms(){for(const [id,v] of this.roomList)if(performance.now()-v.seen>12000)this.roomList.delete(id);return [...this.roomList.values()];}
  async setListed(value){if(!this.owner||!await this.invite())return;this.listed=value;await this.discover();this.advertise();}
  persist(){this.saved=save(project+'.layout.'+this.pub,this.layout);if(!this.saved)this.notice('Storage unavailable. Edits last for this visit.');}
  limitFor(b,goal){
    const people=[...this.actors.values(),...this.town.people.filter(p=>p.visible).map(p=>p.position)];
    return wallLimit(wallState(this.layout,b).wall,goal,people,b);
  }
  edit(target,undo=false,lot=this.cafe.id){
    if(!this.owner||!this.ready)return false;
    const b=this.plots.find(p=>p.id===lot&&(p.cafe||hasEditableFront(p)));
    if(!b)return false;
    const state=wallState(this.layout,b),old=state.wall,goal=undo?state.undo.at(-1):target;
    if(!Number.isFinite(goal))return false;
    const {offset:next,reason}=this.limitFor(b,goal);
    if(goal===old){this.notice('The wall is already there.');return false;}
    if(next===old||(undo&&next!==goal)){this.notice(reason==='parcel'?'Wall held at the lot boundary.':'Wall held. Someone is in its path.');return false;}
    if(undo)state.undo.pop();else state.undo=[...state.undo.slice(-31),old];
    state.wall=next;
    if(isHome(b)){this.layout.homes[b.id]=state;this.updatePatrol();}
    if(b.kind==='club')this.layout.club=state;
    this.layout.revision++;this.persist();this.notice(next===goal?'Wall and doorway moved.':'Wall stopped at its safe limit.');return true;
  }
  near(actor){return this.plots.find(b=>{const p=toRoom(b,actor);return Math.abs(p.x)<b.w/2+1&&p.z>=-b.d/2-.35&&p.z<=frontAt(b,this.layout)+4});}
  station(actor,b){
    if(!b)return null;
    if(b.cafe)return {action:'lights'};
    const seats={
      club:[[-1.7,-1.1,'piano','melody'],[1.7,-1.1,'piano','bass'],[0,1,'dance']],
      restaurant:[[-1.65,.57,'dine'],[1.65,.57,'dine'],[-1.65,-1.17,'dine'],[1.65,-1.17,'dine']],
      gym:[[0,-.6,'train']],spa:[[-.22,-.2,'relax']],
      house:[[1.38,-.14,'sit']],cottage:[[1.38,-.14,'sit']]
    };
    const p=toRoom(b,actor);
    if(Math.abs(p.x)>b.w/2-.25||p.z< -b.d/2+.22||p.z>frontAt(b,this.layout)-.22)return null;
    return seats[b.kind].map(([x,z,action,part=''])=>({...toWorld(b,x,z),action,part,dist:Math.hypot(x-p.x,z-p.z)}))
      .filter(q=>q.dist<=1.35&&![...this.actors.values()].some(a=>a.id!==actor.id&&within(a,q,.55)))
      .sort((a,c)=>a.dist-c.dist)[0];
  }
  interact(id){
    const a=this.actors.get(id),b=a&&this.near(a);if(!b)return;
    if(a.activity){a.activity='';a.part='';return;}
    const spot=this.station(a,b);if(!spot)return;
    if(b.cafe){this.layout.lights=!this.layout.lights;this.layout.revision++;this.persist();}
    else Object.assign(a,{x:spot.x,z:spot.z,activity:spot.action,part:spot.part,yaw:b.yaw+Math.PI});
  }
  use(){if(this.owner)this.interact(this.id);else if(this.connected){this.actionSeq++;this.sendInput();}}
  sendInput(){const m={kind:'input',id:this.id,seq:++this.inputSeq,x:this.keys.x,z:this.keys.z,action:this.actionSeq};
    this.connections.forEach(c=>c.send(m));}
  async receive(sender,m){
    if(this.closed||!m)return;
    if(this.owner){
      if(m.kind!=='input'||typeof m.id!=='string'||!/^[\da-f-]{36}$/i.test(m.id)||m.id===this.id||
        !Number.isSafeInteger(m.seq)||!Number.isSafeInteger(m.action)||!Number.isFinite(m.x)||!Number.isFinite(m.z))return;
      if(this.peers.has(sender)&&this.peers.get(sender)!==m.id)return;
      this.peers.set(sender,m.id);let state=this.controls.get(m.id);
      if(!state){if(this.controls.size>=12)return;state={seq:-1,action:0};this.controls.set(m.id,state);
        this.actors.set(m.id,{id:m.id,...this.spawn,yaw:this.cafe.yaw,activity:'',part:''});}
      if(state.seq>=m.seq)return;
      Object.assign(state,{seq:m.seq,x:Math.max(-1,Math.min(1,m.x)),z:Math.max(-1,Math.min(1,m.z)),at:performance.now()});
      if(m.action>state.action){state.action=m.action;this.interact(m.id);}
    }else if(m.kind==='frame'&&typeof m.body==='string'&&m.body.length<18000&&typeof m.sig==='string'&&m.sig.length<140){
      try{
        if(!await crypto.subtle.verify(signature,this.publicKey,decode(m.sig),utf8.encode(m.body)))return;
        const f=JSON.parse(m.body);
        const layout=readLayout(f.layout);
        if(this.closed||f.room!==this.pub||!Number.isFinite(f.t)||!Number.isFinite(f.seq)||!Array.isArray(f.actors)||f.actors.length>16||
          !f.actors.every(validActor)||!layout||!f.actors.some(a=>a.id===this.id))return;
        if(this.oldBoots.has(f.boot)||(this.hostBoot===f.boot&&f.seq<=this.verifiedSeq))return;
        if(this.hostBoot&&this.hostBoot!==f.boot)this.oldBoots.add(this.hostBoot);
        this.hostBoot=f.boot;this.verifiedSeq=f.seq;this.connected=true;this.lastFrame=performance.now();
        this.actors=new Map(f.actors.map(a=>[a.id,a]));this.layout=layout;this.time=f.t;
        if(Array.isArray(f.residents)&&f.residents.length===this.town.people.length)
          f.residents.forEach((r,i)=>{if(!Array.isArray(r)||r.length!==5||!r.every(Number.isFinite))return;
            const m=this.town.people[i];m.position.set(r[0],r[1],r[2]);m.visible=!!r[3];m.scale.y=r[4];});
      }catch{}
    }
  }
  async broadcast(){
    if(this.sending||!this.connections.length||!this.privateKey)return;
    this.sending=true;
    try{const residents=this.town.people.map(m=>[m.position.x,m.position.y,m.position.z,Number(m.visible),m.scale.y]);
      const body=JSON.stringify({room:this.pub,boot:this.boot,seq:++this.seq,t:this.time,layout:this.layout,actors:[...this.actors.values()],residents});
      const sig=encode(await crypto.subtle.sign(signature,this.privateKey,utf8.encode(body)));if(!this.closed)this.connections.forEach(c=>c.send({kind:'frame',body,sig}));
    }finally{this.sending=false;}
  }
  tick(dt){
    if(!this.ready)return;
    const now=performance.now();this.time+=dt;
    if(this.owner){
      this.town.advance(dt);
      for(const [id,a] of this.actors){
        if(id.startsWith('resident')){
          if(a.dwell>0){a.dwell-=dt;continue;}const dst=this.patrol[(a.way+1)%this.patrol.length];
          if(within(a,dst,.23)){a.way=(a.way+1)%this.patrol.length;a.dwell=a.way===3?3:.3;continue;}
          const dx=dst.x-a.x,dz=dst.z-a.z,len=Math.hypot(dx,dz);
          moveWalker(this.island,this.plots,this.layout,a,{x:dx/len*.32,z:dz/len*.32},dt);continue;
        }
        const remote=this.controls.get(id);if(remote&&now-remote.at>7000){this.controls.delete(id);this.actors.delete(id);continue;}
        const input=id===this.id?this.keys:remote&&now-remote.at<600?remote:zero;
        if(input.x||input.z){a.activity='';a.part='';moveWalker(this.island,this.plots,this.layout,a,input,dt);}
      }
    }else if(now-this.lastFrame>4000)this.connected=false;
    if(now-this.lastSent>=85){this.lastSent=now;if(this.owner)void this.broadcast();else this.sendInput();}
    if(this.listed&&now-(this.adAt||0)>3000){this.adAt=now;this.advertise();}
  }
  dispose(){this.closed=true;if(this.listed){this.listed=false;this.advertise();}this.connections.concat(this.directory).forEach(c=>c.leave());this.releaseLock?.();}
}
