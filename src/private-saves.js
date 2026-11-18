import {readLayout} from './street-world.js';
import {printIds} from './home-fixtures.js';

export const project='jenns-cozy-town-waterfront-v1';
const slotPrefix=project+'.recovered.',selectedKey=project+'.selected-save';
const format='jenns-cozy-private-street',world='harborTown/petalwood/1',v=1;
export const maxFileBytes=1024*1024;
const curve={name:'ECDSA',namedCurve:'P-256'},signature={name:'ECDSA',hash:'SHA-256'};
const utf8=new TextEncoder(),header=utf8.encode(format+'/1');
const uid=/^[a-f0-9-]{36}$/i;
export function stored(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
export function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
export const selectedSave=()=>stored(selectedKey)||'';
const printKey=(slot,id)=>project+'.print.'+(slot||'original')+'.'+id;
export function keepPrint(slot,id){
  return printIds.includes(id)&&save(printKey(slot,id),true);
}
export function printCollection(slot){
  const inherited=slot?stored(slotPrefix+slot)?.prints||0:0;
  return printIds.reduce((mask,id,i)=>stored(printKey(slot,id))===true?mask|(1<<i):mask,inherited);
}
export function readSaveValue(key){
  let raw;try{raw=localStorage.getItem(key);}catch{return undefined;}
  if(raw===null)return undefined;
  try{return JSON.parse(raw);}catch{throw Error('This local street save could not be read. You can open a backup from the public town.');}
}

function base64(bytes){
  const view=new Uint8Array(bytes);let result='';
  for(let i=0;i<view.length;i+=8192)result+=String.fromCharCode(...view.subarray(i,i+8192));
  return btoa(result);
}
function decode(text){
  if(typeof text!=='string'||text.length>maxFileBytes)throw Error('Invalid backup data.');
  return Uint8Array.from(atob(text),c=>c.charCodeAt(0));
}
async function unlockIdentity(identity){
  if(!identity||!/^[A-Za-z0-9_-]{87}$/.test(identity.pub)||identity.jwk?.crv!=='P-256')throw Error('Invalid street identity.');
  const raw=decode(identity.pub.replaceAll('-','+').replaceAll('_','/'));
  const [key,publicKey]=await Promise.all([crypto.subtle.importKey('jwk',identity.jwk,curve,false,['sign']),
    crypto.subtle.importKey('raw',raw,curve,false,['verify'])]);
  const challenge=crypto.getRandomValues(new Uint8Array(32)),proof=await crypto.subtle.sign(signature,key,challenge);
  if(!await crypto.subtle.verify(signature,publicKey,proof,challenge))throw Error('The owner identity does not match this street.');
  return {key,publicKey};
}
const lotId=id=>typeof id==='string'&&/^(?:l\d{1,5}|frontage-r\d{1,5}-\d{1,5}-[lr])$/.test(id);
const parcelKey=slot=>project+'.parcel.'+(slot||'original');
export function savedParcel(slot=selectedSave()){
  return readSaveValue(parcelKey(slot))??(slot?readSaveValue(slotPrefix+slot)?.parcel:null)??null;
}
// Public address signatures use a separate key. The private street invitation
// and its signing key are never included in a public claim or town snapshot.
export async function parcelCredential(home){
  const slot=selectedSave();
  const open=async()=>{
    let parcel=savedParcel(slot);
    if(!parcel){
      if(!lotId(home))throw Error('Choose a house first.');
      const pair=await crypto.subtle.generateKey(curve,true,['sign','verify']);
      const pub=base64(await crypto.subtle.exportKey('raw',pair.publicKey)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
      parcel={home:(slot&&readSaveValue(slotPrefix+slot)?.homeLot)||home,pub,jwk:await crypto.subtle.exportKey('jwk',pair.privateKey)};
      if(!save(parcelKey(slot),parcel))throw Error('Browser storage is needed to keep a home address.');
    }
    const {key}=await unlockIdentity(parcel);
    return {home:parcel.home,pub:parcel.pub,key};
  };
  return globalThis.navigator?.locks? navigator.locks.request(parcelKey(slot),open):open();
}
export async function loadOwner(){
  const slot=selectedSave();
  const recovered=slot&&uid.test(slot)?readSaveValue(slotPrefix+slot):null;
  if(slot&&!recovered)throw Error('The selected save is missing. Open another saved street.');
  let identity=recovered?recovered.identity:readSaveValue(project+'.identity'),persistent=true;
  if(identity===undefined&&!recovered){
    const pair=await crypto.subtle.generateKey(curve,true,['sign','verify']);
    const pub=base64(await crypto.subtle.exportKey('raw',pair.publicKey)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
    identity={pub,jwk:await crypto.subtle.exportKey('jwk',pair.privateKey)};
    persistent=save(project+'.identity',identity);
  }
  const {key,publicKey}=await unlockIdentity(identity);
  return {slot,identity,privateKey:key,publicKey,persistent,recovered};
}
export function writeRecovered(owner,layout,coffee,settings){
  const record={...owner.recovered,...settings,layout,coffee};
  if(!save(slotPrefix+owner.slot,record))return false;
  owner.recovered=record;return true;
}
export function savedStreets(){
  const result=[{slot:'',label:'Original street'}];
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key?.startsWith(slotPrefix))continue;
      const slot=key.slice(slotPrefix.length),item=stored(key);
      if(uid.test(slot)&&item?.identity?.pub&&Number.isFinite(item.restored)){
        const date=new Date(item.restored).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
        result.push({slot,label:'Recovered '+date+' · revision '+item.layout.revision+' · '+slot.slice(0,4)});
      }
    }
  }catch{ /* Storage can be unavailable on an otherwise playable visit. */ }
  return result;
}
export function selectSave(slot){
  if(slot&&(!uid.test(slot)||!stored(slotPrefix+slot)))throw Error('That save is unavailable.');
  if(!save(selectedKey,slot||null))throw Error('Browser storage is unavailable.');
}
function validateState(snapshot){
  if(snapshot?.world!==world||snapshot.version!==v)throw Error('This file belongs to a different world or save version.');
  const layout=readLayout(snapshot.layout),coffee=snapshot.coffee;
  if(!layout||!coffee||typeof coffee!=='object'||Array.isArray(coffee)||Object.entries(coffee).some(([id,n])=>
    !['resident0','resident1'].includes(id)||!Number.isInteger(n)||n<0||n>9999))throw Error('Invalid private street save.');
  const homeLot=snapshot.homeLot??null;
  if(homeLot!==null&&(typeof homeLot!=='string'||!/^(?:l\d{1,5}|frontage-r\d{1,5}-\d{1,5}-[lr])$/.test(homeLot)))throw Error('Invalid home address.');
  const parcel=snapshot.parcel;
  if(parcel&&(!lotId(parcel.home)||parcel.pub===snapshot.identity?.pub))throw Error('Invalid public address credential.');
  if(snapshot.askToEnter!==undefined&&typeof snapshot.askToEnter!=='boolean')throw Error('Invalid visitor setting.');
  const prints=snapshot.prints??0;
  if(!Number.isInteger(prints)||prints<0||prints>3)throw Error('Invalid print collection.');
  return {world,version:v,identity:snapshot.identity,layout,coffee:{...coffee},homeLot,askToEnter:snapshot.askToEnter===true,...(prints?{prints}:{}),...(parcel?{parcel}:{})};
}
async function passwordKey(password,salt){
  if(typeof password!=='string'||!password.length||password.length>1024)throw Error('Enter your backup passphrase.');
  const secret=await crypto.subtle.importKey('raw',utf8.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt},secret,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function exportBackup(identity,layout,coffee,password,homeLot=null,parcel=null,askToEnter=false,prints=0){
  const data=utf8.encode(JSON.stringify(validateState({world,version:v,identity,layout,coffee,homeLot,parcel,askToEnter,prints})));
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await passwordKey(password,salt);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:header},key,data);
  return JSON.stringify({format,v,salt:base64(salt),iv:base64(iv),data:base64(ciphertext)});
}
export async function readBackup(text,password){
  if(typeof text!=='string'||text.length>maxFileBytes)throw Error('This backup is too large.');
  let file;try{file=JSON.parse(text);}catch{throw Error('Choose a Cozy street backup file.');}
  if(file?.format!==format||file.v!==v)throw Error('Choose a supported Cozy street backup.');
  const salt=decode(file.salt),iv=decode(file.iv),ciphertext=decode(file.data);
  if(salt.length!==16||iv.length!==12||ciphertext.length<17)throw Error('The backup file is incomplete.');
  const key=await passwordKey(password,salt);
  let raw;try{raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:header},key,ciphertext);}
  catch{throw Error('Could not unlock this backup. Check the passphrase and file.');}
  const data=validateState(JSON.parse(new TextDecoder().decode(raw)));
  await unlockIdentity(data.identity);
  if(data.parcel)await unlockIdentity(data.parcel);
  return data;
}
export function installBackup(data){
  // A fresh slot preserves both the device's current home and an earlier
  // recovery of the same owner. A failed write cannot partially replace either.
  const slot=crypto.randomUUID();
  if(!save(slotPrefix+slot,{...data,restored:Date.now()}))throw Error('Could not store the recovered street. Check browser storage.');
  return slot;
}
