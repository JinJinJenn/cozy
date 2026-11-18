import {StreetActivities} from './street-activities.js';
import {chairs,maxTables,tableFeet,tableFit} from './terrace.js';
import {createBroadcastTransport} from '../packages/net/src/transport-broadcast.js';
import {createTrysteroTransport} from '../packages/net/src/transport-trystero.js';
import {defaultLayout,gardenForStreet,gardenSeats,frontAt,sideAt,sideLimit,hasEditableFront,isHome,wallLimit,moveWalker,readLayout,toRoom,toWorld,wallState,within} from './street-world.js';
import {homeAt} from './home-plan.js';
import {applyRoomPlans,dividerLimit,sameDivider} from './room-divider.js';
import {editedItems,installFurniture,occupantLimit,planInterior,syncInteriors} from './home-furnishing.js';
import {furnishings,originalPose,samePose,supportFor,validPose} from './furniture-pose.js';
import {tuneTelevision} from './home-fixtures.js';
import {mealStation} from './home-meals.js';
import {encodeResidents,decodeResidents} from './resident-wire.js';
import {lobbyIdentity,PublicTown,publicWorld,streetSpace} from './public-town.js';
import {takeVehicle,moveVehicle,dismount,teleport} from './street-travel.js';
import {project,loadOwner,readSaveValue,save,stored,writeRecovered} from './private-saves.js';
import {PublicAddresses} from './public-parcels.js';

const nowAllowed=state=>performance.now()-(state.commandAt??-Infinity)>=180;
const zero={x:0,z:0};
const furniture={
  wayside:[[-.48,.18,'sit'],[.48,.18,'sit']],
  garden:gardenSeats,terrace:chairs,club:[[-1.7,-1.1,'piano','melody'],[1.7,-1.1,'piano','bass'],[0,1,'dance']],
  restaurant:[[-1.65,.57,'dine'],[1.65,.57,'dine'],[-1.65,-1.17,'dine'],[1.65,-1.17,'dine']],
  gym:[[0,-.6,'train']],spa:[[-.22,-.2,'relax']],
  house:[[1.38,-.14,'sit'],[1.38,-1.80,'sit']],cottage:[[1.38,-.14,'sit']]
};
const homeStations=new WeakMap();
export function stationsFor(b){
  if(b.kind==='home'){
    const uses=b.uses||b.seats;
    let spots=homeStations.get(uses);
    if(!spots){
      spots=uses.map((p,index)=>({...p,...toWorld(b,p.x,p.z),
        target:p.target?{...toWorld(b,p.target.x,p.target.z),y:b.y+p.target.y}:null,
        pose:p.pose?{...p.pose,...toWorld(b,p.pose.x,p.pose.z)}:null,index,part:''}));
      homeStations.set(uses,spots);
    }
    return spots;
  }
  return (furniture[b.kind]||[]).map(([x,z,action,part=''],index)=>({...toWorld(b,x,z),action,part,index,
    yaw:b.yaw+((b.kind==='wayside'||b.kind==='terrace'&&index===0||b.kind==='house'&&index===1||b.kind==='restaurant'&&index>=2)?0:Math.PI)}));
}
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const utf8=new TextEncoder(),algorithm={name:'ECDSA',namedCurve:'P-256'},signature={name:'ECDSA',hash:'SHA-256'};
const validKey=k=>typeof k==='string'&&/^[A-Za-z0-9_-]{87}$/.test(k);
const validActor=p=>p && typeof p.id==='string' && p.id.length<=64 && Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.yaw);
function linkFor(pub,home){const u=new URL(location.href);u.search='';u.hash='';
  u.searchParams.set('view','street');u.searchParams.set('visit',pub);if(home)u.searchParams.set('home',home);
  if(new URLSearchParams(location.search).get('net')==='local')u.searchParams.set('net','local');return u.href;}
function transports(){
  const list=[createBroadcastTransport({name:project})];
  if(new URLSearchParams(location.search).get('net')!=='local')list.push(createTrysteroTransport({appId:project}));
  return list;
}
export class StreetSession {
  constructor(island,plots,notice,town){
    this.island=island;this.plots=plots;this.cafe=plots.find(b=>b.cafe);this.notice=notice;this.town=town;this.garden=gardenForStreet(this.cafe);
    this.id=crypto.randomUUID();this.boot=crypto.randomUUID();this.actors=new Map();this.controls=new Map();this.peers=new Map();
    this.roomList=new Map();this.connections=[];this.directory=[];this.connecting=null;this.discovery=null;
    this.layout=defaultLayout();this.time=0;this.seq=0;this.lastFrame=0;this.lastSent=0;this.connected=false;this.ready=false;this.listed=false;
    this.keys={...zero};this.inputSeq=0;this.actionSeq=0;this.verifiedSeq=-1;this.oldBoots=new Set();
    const params=new URLSearchParams(location.search);
    this.space=streetSpace(island,params);this.visit=params.get('visit');this.owner=this.space==='personal';
    if(this.space==='visit'&&island.homesById?.has(params.get('home')))this.invitedHome=params.get('home');
    this.spawn=toWorld(this.cafe,0,this.cafe.d/2+3.4);
    this.actors.set(this.id,{id:this.id,...this.spawn,yaw:this.cafe.yaw+Math.PI,activity:'',part:''});
    this.activities=new StreetActivities(this);this.commandSeq=0;this.motion=0;
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
      if(this.space==='public'){
        const id=await lobbyIdentity();if(this.closed)return;
        const room=publicWorld+'@'+new URL('.',location.href).href;
        const avatar=this.actors.get(this.id);this.id=id.actor;avatar.id=this.id;this.actors=new Map([[this.id,avatar]]);
        this.addresses=new PublicAddresses(this);
        this.lobby=new PublicTown(room,id,leader=>this.publicLeader(leader));
        this.lobby.elect();
        await this.open(room,this.connections,kind=>({
          onMessage:(peer,m)=>this.receive(kind+'/'+peer,m),
          onPeerJoin:()=>this.lobby.announce(kind),
          onPeerLeave:peer=>{const sender=kind+'/'+peer;this.peers.delete(sender);this.lobby.leave(sender);}
        }),undefined,(kind,c)=>this.lobby.attach(kind,c));
        this.ready=!this.closed;
        return;
      }
      if(this.owner){
        const id=navigator.locks?await navigator.locks.request(project+'.create-owner',loadOwner):await loadOwner();this.pub=id.identity.pub;this.localSlot=id.slot;
        if(navigator.locks){
          let inform;const acquired=new Promise(r=>inform=r);
          void navigator.locks.request(project+'.host.'+this.pub,{ifAvailable:true},async lock=>{
            inform(!!lock);if(lock&&!this.closed)await new Promise(r=>this.releaseLock=r);});
          if(!await acquired){this.owner=false;this.visit=this.pub;}
        }
        if(this.owner){
          this.ownerSave=id;this.privateKey=id.privateKey;this.publicKey=id.publicKey;
          this.hostStarted=Date.now();this.hostCards=new Map();
        }
        const savedLayout=id.recovered?id.recovered.layout:readSaveValue(project+'.layout.'+this.pub);
        const layout=savedLayout===undefined&&!id.recovered?defaultLayout():readLayout(savedLayout);
        if(!layout)throw Error('This saved layout could not be read. You can restore a backup from the public town.');
        this.layout=layout;
        this.saved=id.persistent!==false;
        if(!syncInteriors(this.island,null,this.layout))throw Error('The saved furnishings do not fit this house. Open a different save or restore a backup.');
        const home=this.island.homesById?.get(id.recovered?.homeLot);
        if(this.owner&&home)Object.assign(this.actors.get(this.id),home.inside);
      }
      if(this.owner){
        this.coffeeVisits=this.ownerSave.recovered?.coffee??readSaveValue(project+'.coffee.'+this.pub)??{};
        this.startPatrol();
      }else{
        if(!validKey(this.visit))throw Error('Invalid street invitation');
        this.pub=this.visit;this.publicKey=await crypto.subtle.importKey('raw',decode(this.pub),algorithm,false,['verify']);
      }
      if(this.closed)return;
      this.ready=true;
      await this.connect(!this.owner||!!this.ownerSave?.slot||!!stored(project+'.host.'+this.pub));
    }catch(e){this.notice(e.message);this.error=e.message;}
  }
  startPatrol(){
    this.updatePatrol();
    for(let i=0;i<2;i++)this.actors.set('resident'+i,{id:'resident'+i,...this.patrol[i*6],yaw:0,activity:'',part:'',way:i*6,dwell:1+i*3});
  }
  publicLeader(leader){
    const previous=this.pub;
    this.pub=leader.pub;this.owner=leader===this.lobby.self;
    this.addresses.election();
    this.publicKey=leader.publicKey;this.privateKey=this.owner?leader.privateKey:null;
    this.connected=false;this.lastFrame=0;this.hostBoot=null;this.verifiedSeq=-1;this.oldBoots.clear();
    this.boot=crypto.randomUUID();this.poseEpoch=(this.poseEpoch||0)+1;this.seq=0;
    this.pendingCommand=null;this.actionSeq=0;this.residentTargets=null;
    this.peers.clear();this.controls.clear();this.activities=new StreetActivities(this);
    const local=this.actors.get(this.id)||this.spawn;
    this.actors=new Map([[this.id,{id:this.id,x:local.x,z:local.z,yaw:local.yaw,activity:'',part:''}]]);
    if(this.owner){this.coffeeVisits={};this.startPatrol();}
    if(previous)this.notice(this.owner?'You are hosting the public town.':'Joining the public town host.');
  }
  async open(name,connections,handlers,allow=()=>true,joined){
    const joins=transports().filter(allow).map(async transport=>{
      try{const conn=await transport.join(name,handlers(transport.kind));if(this.closed)conn.leave();else{connections.push(conn);await joined?.(transport.kind,conn);}}
      catch(e){if(!this.closed)this.transportError=String(e.message||e);}
    });
    await joins[0]; // Local discovery works even while public signalling is connecting.
    void Promise.allSettled(joins);
  }
  async connect(publicly=true){
    const handlers=kind=>({
        onMessage:(peer,m)=>this.receive(kind+'/'+peer,m),
        onPeerJoin:()=>this.announceOwner(kind),
        onPeerLeave:peer=>this.peers.delete(kind+'/'+peer),onError:()=>{}
    });
    const name='street-'+this.pub;
    const attach=async(kind,connection)=>{
      if(!this.ownerSave||!this.owner)return;
      const body=JSON.stringify([this.pub,kind+'/'+connection.selfId,this.boot,this.hostStarted]);
      const sig=encode(await crypto.subtle.sign(signature,this.privateKey,utf8.encode(body)));
      if(!this.closed&&this.owner){this.hostCards.set(kind,{connection,packet:{kind:'private-host',body,sig}});this.announceOwner(kind);}
    };
    this.connecting??=this.open(name,this.connections,handlers,t=>t.kind==='broadcast',attach);
    await this.connecting;
    if(publicly&&!this.closed){
      this.wide??=this.open(name,this.connections,handlers,t=>t.kind!=='broadcast',attach);
      if(this.owner)save(project+'.host.'+this.pub,true);
    }
    return !this.closed;
  }
  announceOwner(kind){
    const card=this.owner&&this.hostCards?.get(kind);if(card)card.connection.send(card.packet);
  }
  async checkOtherOwner(sender,message){
    if(!this.ownerSave||!this.owner||typeof message.body!=='string'||message.body.length>400||
      typeof message.sig!=='string'||message.sig.length>140)return;
    try{
      const [pub,peer,boot,started]=JSON.parse(message.body);
      if(pub!==this.pub||peer!==sender||typeof boot!=='string'||!/^[0-9a-f-]{36}$/i.test(boot)||
        !Number.isSafeInteger(started)||started<=0||started>this.hostStarted||
        started===this.hostStarted&&boot>=this.boot)return;
      if(!await crypto.subtle.verify(signature,this.publicKey,decode(message.sig),utf8.encode(message.body))||this.closed||!this.owner)return;
      // Copies have the same signing key. Once connected, keep one writer.
      // Losing this election never writes the winning host's state to our slot.
      this.owner=false;this.privateKey=null;this.ownerSave=null;this.hostCards.clear();this.visit=this.pub;
      this.boot=crypto.randomUUID();this.hostBoot=null;this.oldBoots.clear();this.verifiedSeq=-1;
      this.connected=false;this.lastFrame=0;this.controls.clear();this.peers.clear();this.activities=new StreetActivities(this);
      if(this.listed){this.listed=false;this.advertise();}
      this.notice('This street is already hosted on another device. You joined as a guest. Your saved copy is kept here.');
      this.sendInput();
    }catch{ /* Ignore unrelated or invalid peer announcements. */ }
  }
  get canBuild(){return this.owner&&this.space!=='public';}
  async invite(){await this.start;if(!this.canBuild||!this.ready||!await this.connect())return null;
    return linkFor(this.pub,homeAt(this.island,this.actors.get(this.id))?.id);}
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
  persist(){
    if(!this.canBuild)return;
    this.saved=this.ownerSave?.slot?writeRecovered(this.ownerSave,this.layout,this.coffeeVisits):save(project+'.layout.'+this.pub,this.layout);
    if(!this.saved)this.notice('Storage unavailable. Edits last for this visit.');
  }
  roomOccupants(home){
    const nearby=p=>Math.abs(p.x-home.x)<=home.collisionHalfX&&Math.abs(p.z-home.z)<=home.collisionHalfZ;
    return [...this.actors.values()].flatMap(a=>a.using?.exit?[a,a.using.exit]:[a]).filter(nearby)
      .concat((this.town.current||[]).filter(nearby),[...this.activities.routes.values()].map(r=>r.goal).filter(nearby));
  }
  furnitureInUse(home,item){
    const using=index=>home.uses[index]&&supportFor(home.uses[index])===item;
    for(const a of this.actors.values())if(a.using?.lot===home.id&&using(a.using.index))return true;
    for(const r of this.activities.routes.values())if(r.arrival?.lot===home.id&&using(r.arrival.index))return true;
    return false;
  }
  editFurniture(lot,id,draft,revision,undo=false){
    const home=this.island.homesById?.get(lot),state=this.layout.furnishings||{v:1,lots:{}};
    if(!this.ready||!this.canBuild||!home||homeAt(this.island,this.actors.get(this.id))!==home)return false;
    if(revision!==this.layout.revision){this.notice('The room changed. Review the placement and apply again.');return false;}
    if(undo){
      if(state.last?.[0]!==lot)return false;
      [,id,draft]=state.last;
    }
    if(!Object.hasOwn(furnishings,id)||!validPose(draft)||!home.furniture.some(f=>f.id===id))return false;
    const previous=state.lots[lot]?.[id]||originalPose;
    if(samePose(previous,draft))return false;
    if(this.furnitureInUse(home,id)){this.notice('Someone is using this item or walking to it.');return false;}
    const items=editedItems(state.lots[lot],id,draft),{next,reason}=planInterior(home,items,home.divider);
    const issue=reason||occupantLimit(home,next,id,this.roomOccupants(home),true);
    if(issue){this.notice(issue);return false;}
    const lots={...state.lots};
    if(Object.keys(items).length)lots[lot]=items;else delete lots[lot];
    installFurniture(home,items,next);
    this.layout.furnishings={v:1,lots,...(undo?{}:{last:[lot,id,[...previous]]})};
    this.layout.revision++;this.town.sim?._recheckAll();this.persist();return true;
  }
  editRoom(id,draft,revision,undo=false){
    if(!this.ready||!this.canBuild)return false;
    const home=this.island.homesById.get(id),rooms=this.layout.rooms||{v:1,lots:{}};
    if(!home||homeAt(this.island,this.actors.get(this.id))!==home)return false;
    if(revision!==this.layout.revision){this.notice('The room changed. Review the preview and apply again.');return false;}
    if(undo&&rooms.last?.[0]!==id)return false;
    const next=undo?rooms.last[1]:draft,previous=rooms.lots[id]??null;
    const reason=dividerLimit(home,next,this.roomOccupants(home),true);
    if(reason){this.notice(reason);return false;}
    if(sameDivider(previous,next))return false;
    const lots={...rooms.lots};
    if(next)lots[id]=[...next];else delete lots[id];
    applyRoomPlans(this.island,rooms.lots,lots);
    this.layout.rooms={v:1,lots,...(undo?{}:{last:[id,previous]})};
    this.layout.revision++;this.town.sim?._recheckAll();this.persist();return true;
  }
  rememberCoffee(id){
    const last=this.coffeeVisits[id];
    const count=Number.isSafeInteger(last)?Math.min(9999,last+1):1;
    this.coffeeVisits[id]=count;
    if(this.ownerSave?.slot)this.persist();else if(this.canBuild)save(project+'.coffee.'+this.pub,this.coffeeVisits);
    return count;
  }
  limitFor(b,goal,side=sideAt(b,this.layout)-b.w/2){
    const people=[...this.actors.values(),...this.town.people.filter(p=>p.visible).map(p=>p.position)];
    const state=wallState(this.layout,b),currentSide=state.side??0;
    const front=wallLimit(state.wall,goal,people,b,b.w/2+currentSide);
    if(b.kind!=='house')return front;
    const lateral=sideLimit(b,currentSide,side,b.d/2+front.offset,people);
    return {...front,side:lateral.offset,reason:front.reason||lateral.reason};
  }
  terraceLots(){
    const tables=this.layout?.terrace?.tables;
    if(!this.cafe?.cafe||!tables)return [];
    if(this.terraceSource===tables)return this.terracePlaces;
    this.terraceSource=tables;
    return this.terracePlaces=tables.map(t=>{
      const center=toWorld(this.cafe,t.x,t.z),yaw=this.cafe.yaw+t.turn*Math.PI/2;
      return {...center,kind:'terrace',id:'terrace-'+t.id,yaw,c:Math.cos(yaw),s:Math.sin(yaw),w:3.2,d:3.8};
    });
  }
  tableIssue(id,next){
    const tables=this.layout.terrace.tables,old=tables.find(t=>t.id===id);
    if(next){const reason=tableFit(next,tables);if(reason)return reason;}
    const lot='terrace-'+id;
    if(this.activities.tableBooked(lot)||[0,1].some(i=>this.activities.stationClaimed(lot,i)))
      return 'Someone is on the way to this table.';
    const people=[...this.actors.values(),...this.town.people.filter(m=>m.visible).map(m=>m.position)];
    for(const table of [old,next].filter(Boolean))for(const q of tableFeet(table)){
      const p=toWorld(this.cafe,q.x,q.z);
      if(people.some(a=>within(a,p,q.r+.34)))return 'Someone is at this table or in the new spot.';
    }
    return '';
  }
  editTable(id,next,undo=false){
    if(!this.canBuild||!this.ready)return false;
    const state=this.layout.terrace,last=state.undo.at(-1);
    if(undo){if(!last)return false;id=last.id;next=last.before;}
    if(!Number.isInteger(id)||id<0||id>=maxTables||next&&next.id!==id)return false;
    const before=state.tables.find(t=>t.id===id);
    if(!next&&!before||before&&next&&before.x===next.x&&before.z===next.z&&before.turn===next.turn)return false;
    const reason=this.tableIssue(id,next);
    if(reason){this.notice(reason);return false;}
    if(undo)state.undo.pop();
    else state.undo=[...state.undo.slice(-15),{id,before:before?{...before}:null}];
    state.tables=state.tables.filter(t=>t.id!==id);
    if(next)state.tables.push({...next});
    state.tables.sort((a,b)=>a.id-b.id);this.layout.revision++;this.persist();
    this.notice(undo?'Terrace edit undone.':next?'Table and chairs placed.':'Table removed.');return true;
  }
  edit(target,undo=false,lot=this.cafe.id,side){
    if(!this.canBuild||!this.ready)return false;
    const b=this.plots.find(p=>p.id===lot&&(p.cafe||hasEditableFront(p)));
    if(!b)return false;
    const state=wallState(this.layout,b),old=state.wall,oldSide=state.side??0;
    const prior=state.undo.at(-1);
    const goal=undo?(Array.isArray(prior)?prior[0]:prior):target;
    const wantedSide=undo?(Array.isArray(prior)?prior[1]:0):(side??oldSide);
    if(!Number.isFinite(goal)||!Number.isFinite(wantedSide)||b.kind!=='house'&&wantedSide!==0)return false;
    const result=this.limitFor(b,goal,wantedSide),next=result.offset,nextSide=result.side??0;
    if(next===old&&nextSide===oldSide||undo&&(next!==goal||nextSide!==wantedSide)){
      this.notice(result.reason==='parcel'?'Wall held at the lot boundary.':result.reason==='occupied'?'Wall held. Someone is in its path.':
        result.reason==='furniture'?'The seats need this space.':'The wall is already there.');return false;
    }
    if(undo)state.undo.pop();else state.undo=[...state.undo.slice(-31),oldSide||oldSide!==nextSide?[old,oldSide]:old];
    state.wall=next;
    if(b.kind==='house'&&(nextSide||state.side!==undefined||oldSide!==nextSide))state.side=nextSide;
    if(isHome(b)){this.layout.homes[b.id]=state;this.updatePatrol();}
    if(b.kind==='club'||b.kind==='restaurant')this.layout[b.kind]=state;
    this.layout.revision++;this.persist();this.notice(result.reason?'Wall stopped at its safe limit.':oldSide!==nextSide?'Bluebell room resized.':'Wall and doorway moved.');return true;
  }
  near(actor){return this.terraceLots().find(b=>within(actor,b,1.34))||this.waysideNear(actor,1.46)[0]||this.plots.find(b=>{const p=toRoom(b,actor);return p.x> -b.w/2-1&&p.x<sideAt(b,this.layout)+1&&p.z>=-b.d/2-.35&&p.z<=frontAt(b,this.layout)+4})||
    (this.garden&&within(actor,this.garden,4.2)?this.garden:undefined)||homeAt(this.island,actor,.6)||this.squareAt(actor);}
  squareAt(actor){
    const square=this.island?.townSquare;if(!square)return;
    const p=toRoom(square,actor);if(Math.abs(p.x)<square.half&&Math.abs(p.z)<square.half)return square;
  }
  station(actor,b){
    if(!b)return null;
    if(b.cafe)return {action:'lights'};
    const p=toRoom(b,actor);
    if(p.x< -b.w/2+.25||p.x>sideAt(b,this.layout)-.25||p.z< -b.d/2+.22||p.z>frontAt(b,this.layout)-.22)return null;
    let best=null,bestDistance=1.35;
    for(const base of stationsFor(b)){
      const distance=Math.hypot(base.x-actor.x,base.z-actor.z);
      if(distance>bestDistance||(best&&distance===bestDistance))continue;
      const spot=mealStation(this,b.id,base,actor);
      if(spot&&this.available(actor,b,spot)){best=spot;bestDistance=distance;}
    }
    return best&&{...best,dist:bestDistance};
  }
  available(actor,b,spot){
    if(this.town?.people.some(p=>p.visible&&Math.hypot(p.position.x-spot.x,p.position.z-spot.z)<.55))return false;
    if(spot.object){
      if([...this.actors.values()].some(a=>a.id!==actor.id&&a.using?.lot===b.id&&a.using.object===spot.object))return false;
      for(const [id,r] of this.activities.routes)if(id!==actor.id&&r.arrival?.lot===b.id&&this.furnitureAt(b.id,r.arrival.index)?.spot.object===spot.object)return false;
    }
    if((b.kind==='terrace'||b.kind==='house')&&this.activities?.tableBooked(b.id))return false;
    if(b.kind==='garden'&&this.activities?.reserved.has(spot.index))return false;
    if(this.activities?.stationClaimed(b.id,spot.index,actor.id))return false;
    return ![...this.actors.values()].some(a=>a.id!==actor.id&&within(a,spot,.55));
  }
  furnitureAt(lot,index){
    const b=lot===this.garden?.id?this.garden:this.island?.streetBenches?.get(lot)||this.island?.homesById?.get(lot)||this.plots.find(p=>p.id===lot)||this.terraceLots().find(p=>p.id===lot);
    if(!b||!Number.isInteger(index))return null;
    const spot=stationsFor(b)[index];return spot?{b,spot}:null;
  }
  waysideNear(actor,distance){
    const benches=[];
    for(const b of this.island?.streetBenches?.values()||[])if(within(actor,b,distance))benches.push(b);
    return benches;
  }
  interact(id){
    const a=this.actors.get(id);if(a?.vehicle){dismount(this,a);return;}
    const b=a&&this.near(a);if(!b)return;
    if(a.dinnerSeat!==undefined&&this.activities){this.activities.finish(a);return;}
    if(a.outing==='chat'||a.outing==='waiting'){this.activities.finish(a);return;}
    if(a.activity){this.activities?.leaveFurniture(a);a.activity='';a.part='';return;}
    const spot=this.station(a,b);if(!spot)return;
    if(b.kind==='home'){this.activities.command(a,{type:'furniture',lot:b.id,index:spot.index});return;}
    if(b.cafe){this.layout.lights=!this.layout.lights;this.layout.revision++;this.persist();}
    else{
      if(spot.action==='dine'&&this.activities){
        this.activities.finish(a);a.dinnerSeat=spot.index;a.outing='menu';
      }
      Object.assign(a,{x:spot.x,z:spot.z,activity:spot.action,part:spot.part,yaw:spot.yaw});
    }
  }
  use(){if(this.owner)this.interact(this.id);else if(this.connected){this.actionSeq++;this.sendInput();}}
  command(cmd){
    if(!this.ready||(!this.owner&&!this.connected))return;
    if(this.owner)this.applyCommand(this.actors.get(this.id),cmd);
    else{this.pendingCommand={...cmd,seq:++this.commandSeq};this.sendInput();}
  }
  applyCommand(actor,cmd){
    if(cmd.type==='tv-channel'){
      if(actor.activity==='watch'&&actor.using?.lot===cmd.lot)tuneTelevision(this,cmd.lot,cmd.channel);
      return;
    }
    if(cmd.type==='ride')return takeVehicle(this,actor,cmd.vehicle);
    if(cmd.type==='dismount')return dismount(this,actor);
    if(cmd.type==='teleport')return teleport(this,actor,cmd);
    if(actor.vehicle){
      dismount(this,actor);
      if(actor.vehicle)return;
    }
    this.activities.command(actor,cmd);
  }
  setInput(x,z){
    if(Math.hypot(x-this.keys.x,z-this.keys.z)<.009&&!(x===0&&z===0&&(this.keys.x||this.keys.z)))return;
    this.keys={x,z};this.motion++;
    if(!this.owner&&this.connected)this.sendInput();
  }
  sendInput(){const m={kind:'input',id:this.id,seq:++this.inputSeq,x:this.keys.x,z:this.keys.z,action:this.actionSeq,motion:this.motion,cmd:this.pendingCommand};
    if(this.lobby){
      m.authority=this.pub;
      if(this.addresses.synced){m.parcelRevision=this.addresses.book.revision;m.parcelBoot=this.hostBoot;}
    }else if(this.invitedHome)m.entryHome=this.invitedHome;
    this.connections.forEach(c=>c.send(m));}
  async receive(sender,m){
    if(this.closed||!m)return;
    if(!this.lobby&&m.kind==='private-host')return this.checkOtherOwner(sender,m);
    if(this.lobby){
      if(m.kind==='presence')return this.lobby.receive(sender,m);
      const member=this.lobby.members.get(sender);
      if(!member||(m.kind==='input'&&(member.actor!==m.id||m.authority!==this.pub))||
        (m.kind==='frame'&&member.pub!==this.pub))return;
      if(m.kind==='parcel')return this.addresses.receive(member.actor,m);
    }
    if(this.owner){
      if(m.kind!=='input'||typeof m.id!=='string'||!/^[\da-f-]{36}$/i.test(m.id)||m.id===this.id||
        !Number.isSafeInteger(m.seq)||!Number.isSafeInteger(m.action)||!Number.isFinite(m.x)||!Number.isFinite(m.z))return;
      if(this.peers.has(sender)&&this.peers.get(sender)!==m.id)return;
      this.peers.set(sender,m.id);let state=this.controls.get(m.id);
      if(!state){if(this.controls.size>=12)return;state={seq:-1,action:0};this.controls.set(m.id,state);
        const joining={id:m.id,...this.spawn,yaw:this.cafe.yaw,activity:'',part:''};
        this.actors.set(m.id,joining);
        if(!this.lobby&&this.island.homesById?.has(m.entryHome)){
          teleport(this,joining,{place:m.entryHome});joining.entryHome=m.entryHome;
        }
      }
      if(state.seq>=m.seq)return;
      Object.assign(state,{seq:m.seq,x:Math.max(-1,Math.min(1,m.x)),z:Math.max(-1,Math.min(1,m.z)),at:performance.now()});
      state.motion=Number.isSafeInteger(m.motion)?m.motion:0;
      if(this.lobby&&m.parcelBoot===this.boot)state.parcelRevision=m.parcelRevision;
      const cmd=m.cmd,actor=this.actors.get(m.id);
      if(cmd&&Number.isSafeInteger(cmd.seq)&&cmd.seq>(state.commandSeq??0)&&nowAllowed(state)){
        state.commandSeq=cmd.seq;state.commandAt=performance.now();actor.commandAck=cmd.seq;
        if(['ride','dismount','teleport','tv-channel','coffee','cancel','beach','furniture','terrace-coffee','visit-bluebell','book-dinner','order-meal'].includes(cmd.type)||(cmd.type==='walk'&&Number.isFinite(cmd.x)&&Number.isFinite(cmd.z)&&
          Math.abs(cmd.x)<this.island.half&&Math.abs(cmd.z)<this.island.half))this.applyCommand(actor,cmd);
      }
      if(m.action>state.action){state.action=m.action;this.interact(m.id);}
    }else if(m.kind==='frame'&&typeof m.body==='string'&&m.body.length<131072&&typeof m.sig==='string'&&m.sig.length<140){
      try{
        const epoch=this.boot;
        if(!await crypto.subtle.verify(signature,this.publicKey,decode(m.sig),utf8.encode(m.body)))return;
        const f=JSON.parse(m.body);
        const layout=readLayout(f.layout);
        if(this.closed||this.boot!==epoch||f.room!==this.pub||!Number.isFinite(f.t)||!Number.isFinite(f.seq)||!Array.isArray(f.actors)||f.actors.length>16||
          !f.actors.every(validActor)||!layout||!f.actors.some(a=>a.id===this.id))return;
        if(this.oldBoots.has(f.boot)||(this.hostBoot===f.boot&&f.seq<=this.verifiedSeq))return;
        if(!this.lobby&&this.connected&&this.hostBoot!==f.boot&&performance.now()-this.lastFrame<4000)return;
        if(this.lobby){
          const address=this.addresses;
          if(f.parcels!==undefined){
            if(!address.book.hydrate(f.parcelRevision,f.parcels))return;
            address.synced=true;
          }else if(!address.synced||f.parcelRevision!==address.book.revision)return;
          address.confirm(f.confirmedRevision);
        }
        const newHost=this.hostBoot!==f.boot;
        if((this.layout.revision!==layout.revision||newHost)&&!syncInteriors(this.island,this.layout,layout))return;
        if(this.hostBoot&&newHost)this.oldBoots.add(this.hostBoot);
        if(this.space==='public'&&!this.connected)this.notice('');
        if(newHost)this.poseEpoch=(this.poseEpoch??0)+1;
        this.residentInterval=Math.min(160,Math.max(32,performance.now()-this.lastFrame));
        this.hostBoot=f.boot;this.verifiedSeq=f.seq;this.connected=true;this.lastFrame=performance.now();
        this.actors=new Map(f.actors.map(a=>[a.id,a]));this.layout=layout;this.time=f.t;
        if(this.pendingCommand&&this.actors.get(this.id).commandAck>=this.pendingCommand.seq)this.pendingCommand=null;
        if(this.invitedHome&&this.inviteBoot!==f.boot){
          this.inviteBoot=f.boot;
          if(this.actors.get(this.id).entryHome!==this.invitedHome)this.command({type:'teleport',place:this.invitedHome});
        }
        const residents=typeof f.residents==='string'?decodeResidents(f.residents,this.town.people.length):f.residents;
        if(Array.isArray(residents)&&residents.length===this.town.people.length){
          this.residentTargets=residents.map((r,i)=>{
            if(!Array.isArray(r)||![5,6].includes(r.length)||!r.every(Number.isFinite))return null;
            const m=this.town.people[i],p=m.position,visible=!!r[3];
            if(newHost||m.visible!==visible||Math.hypot(r[0]-p.x,r[2]-p.z)>3)p.set(r[0],r[1],r[2]);
            m.visible=visible;m.scale.y=r[4];
            if(r.length===6)m.userData.heading=r[5];
            return {x:p.x,y:p.y,z:p.z,to:r};
          });
        }
      }catch{}
    }
  }
  async broadcast(){
    if(this.sending||!this.peers.size||!this.connections.length||!this.privateKey)return;
    this.sending=true;
    try{const residents=encodeResidents(this.town.people);
      const frame={room:this.pub,boot:this.boot,seq:++this.seq,t:this.time,layout:this.layout,actors:[...this.actors.values()],residents};
      if(this.addresses){
        const book=this.addresses.book;frame.parcelRevision=book.revision;frame.confirmedRevision=this.addresses.confirmedRevision;
        if([...this.controls.values()].some(c=>c.parcelRevision!==book.revision))frame.parcels=book.entries;
      }
      const body=JSON.stringify(frame);
      const epoch=this.boot,sig=encode(await crypto.subtle.sign(signature,this.privateKey,utf8.encode(body)));if(!this.closed&&this.boot===epoch)this.connections.forEach(c=>c.send({kind:'frame',body,sig}));
    }finally{this.sending=false;}
  }
  tick(dt){
    if(!this.ready)return;
    const now=performance.now();this.time+=dt;
    this.lobby?.tick(now);
    this.addresses?.tick(now);
    if(this.owner&&this.hostCards&&now>=(this.nextOwnerPulse??0)){
      this.nextOwnerPulse=now+2500;for(const kind of this.hostCards.keys())this.announceOwner(kind);
    }
    if(this.owner){
      this.town.advance(dt);
      for(const [id,a] of this.actors){
        if(id.startsWith('resident')){
          if(this.activities?.advance(a,dt))continue;
          if(a.dwell>0){a.dwell-=dt;continue;}const dst=this.patrol[(a.way+1)%this.patrol.length];
          if(within(a,dst,.23)){a.way=(a.way+1)%this.patrol.length;a.dwell=a.way===3?3:.3;continue;}
          const dx=dst.x-a.x,dz=dst.z-a.z,len=Math.hypot(dx,dz);
          const oldX=a.x,oldZ=a.z;
          moveWalker(this.island,this.plots,this.layout,a,{x:dx/len*.32,z:dz/len*.32},dt);
          if(dt>0&&Math.hypot(a.x-oldX,a.z-oldZ)<.00001&&!this.activities?.go(a,dst,'patrol'))a.dwell=.65;
          continue;
        }
        const remote=this.controls.get(id);if(remote&&now-remote.at>7000){this.activities?.finish(a);this.controls.delete(id);this.actors.delete(id);continue;}
        const input=id===this.id?this.keys:remote&&now-remote.at<600?remote:zero;
        const oldX=a.x,oldZ=a.z;
        if(a.vehicle)moveVehicle(this,a,input,dt);
        else if(input.x||input.z){
          this.activities?.leaveFurniture(a);
          if(a.walking||a.outing&&a.outing!=='carry')this.activities?.manual(a);
          a.activity='';a.part='';moveWalker(this.island,this.plots,this.layout,a,input,dt);
        }else this.activities?.advance(a,dt);
        a.motion=id===this.id?this.motion:remote?.motion??0;
        a.vx=(a.x-oldX)/Math.max(.001,dt);a.vz=(a.z-oldZ)/Math.max(.001,dt);
      }
    }else{
      if(now-this.lastFrame>4000)this.connected=false;
      const blend=Math.min(1,(now-this.lastFrame)/this.residentInterval);
      this.residentTargets?.forEach((r,i)=>{
        if(r)this.town.people[i].position.set(r.x+(r.to[0]-r.x)*blend,r.y+(r.to[1]-r.y)*blend,r.z+(r.to[2]-r.z)*blend);
      });
    }
    if(now-this.lastSent>=85){this.lastSent=now;if(this.owner)void this.broadcast();else this.sendInput();}
    if(this.listed&&now-(this.adAt||0)>3000){this.adAt=now;this.advertise();}
  }
  dispose(){this.closed=true;this.lobby?.dispose();if(this.listed){this.listed=false;this.advertise();}this.connections.concat(this.directory).forEach(c=>c.leave());this.releaseLock?.();}
}
