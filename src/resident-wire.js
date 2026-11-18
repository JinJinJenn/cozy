// Signed host frames carry the whole town, quantized to 10 cm. Positions are
// interpolated by the receiver. Seven bytes per resident keep a city snapshot
// comfortably below the existing frame limit without omitting distant NPCs.
export function encodeResidents(people){
  const bytes=new Uint8Array(people.length*7),view=new DataView(bytes.buffer);
  people.forEach((p,i)=>{
    for(const [j,k] of ['x','y','z'].entries())view.setInt16(i*7+j*2,Math.round(p.position[k]*10),true);
    bytes[i*7+6]=(p.visible?1:0)|(p.scale.y<.9?2:0)|((Math.round((p.userData?.heading||0)*64/(2*Math.PI))&63)<<2);
  });
  let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text);
}
export function decodeResidents(encoded,count){
  if(typeof encoded!=='string'||encoded.length!==4*Math.ceil(count*7/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))return null;
  try{
    const raw=atob(encoded);if(raw.length!==count*7)return null;
    const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),rows=[];
    for(let i=0;i<count;i++){
      rows.push([view.getInt16(i*7,true)/10,view.getInt16(i*7+2,true)/10,view.getInt16(i*7+4,true)/10,bytes[i*7+6]&1,bytes[i*7+6]&2?.73:1,(bytes[i*7+6]>>2)*2*Math.PI/64]);
    }
    return rows;
  }catch{return null;}
}
