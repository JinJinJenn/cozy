export const keyNames=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
export const bindings=['A','W','S','E','D','F','T','G','Y','H','U','J','K'];
export const baseNote=part=>part==='melody'?60:48;
export const validKey=key=>Number.isInteger(key)&&key>=0&&key<=24;
export const keyLabel=(part,key)=>keyNames[key%12]+Math.floor((baseNote(part)+key)/12-1);
export const keyWidth=1.58/15;
export const keyShape=Array.from({length:25},(_,i)=>{
  const black=[1,3,6,8,10].includes(i%12);
  const whiteIndex=Math.floor(i/12)*7+[0,0,1,1,2,3,3,4,4,5,5,6][i%12];
  return {black,x:-.79+(whiteIndex+(black?1:.5))*keyWidth,y:black?.895:.84,z:black?-1.96:-1.85,
    w:black?.061:keyWidth-.006,d:black?.25:.47};
});
const history=16;
export function setFreePlay(actor,enabled){
  if(actor.activity!=='piano'||!['melody','bass'].includes(actor.part)||typeof enabled!=='boolean')return;
  if(enabled&&!actor.piano)actor.piano={id:crypto.randomUUID(),seq:0,notes:[]};
  if(!enabled)delete actor.piano;
}
export function validPiano(piano){
  return piano===undefined||piano&&typeof piano.id==='string'&&piano.id.length===36&&
    Number.isSafeInteger(piano.seq)&&piano.seq>=0&&Array.isArray(piano.notes)&&piano.notes.length<=history&&
    piano.notes.every(n=>Array.isArray(n)&&n.length===3&&Number.isSafeInteger(n[0])&&n[0]>0&&n[0]<=piano.seq&&validKey(n[1])&&Number.isFinite(n[2]));
}
export function acceptNotes(actor,packet,time){
  const piano=actor?.piano;
  if(!piano||actor.activity!=='piano'||packet?.id!==piano.id||!Array.isArray(packet.notes)||packet.notes.length>history)return;
  for(const n of packet.notes){
    if(!Array.isArray(n)||n.length!==3)continue;
    const [seq,key,age]=n;
    if(!Number.isSafeInteger(seq)||seq<=piano.seq||!validKey(key)||!Number.isFinite(age)||age<0||age>.7)continue;
    piano.seq=seq;
    // The burst budget permits chords. Repeated input packets carry the same
    // sequences so a missed snapshot cannot trigger the same attack twice.
    if(piano.notes.length===history&&time-piano.notes[0][2]<.36)continue;
    const at=Math.max(time-age,piano.notes.at(-1)?.[2]??-Infinity);
    piano.notes.push([seq,key,at]);if(piano.notes.length>history)piano.notes.shift();
  }
}
export function pressedKeys(notes,time){
  let mask=0;
  if(notes)for(const [,key,at] of notes)if(at<=time+.03&&time-at<.30)mask|=1<<key;
  return mask;
}
