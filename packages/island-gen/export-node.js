// Node-only exporters: 16-bit grayscale PNG + raw + JSON files.
import zlib from 'node:zlib';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {toHeightmap16,toUnityRaw,toMetaJSON} from './index.js';
const crcT=new Uint32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=b=>{let c=0xffffffff;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
export function png16(res,data){
  const raw=Buffer.alloc((res*2+1)*res);
  for(let y=0;y<res;y++){raw[y*(res*2+1)]=0;for(let x=0;x<res;x++){const v=data[y*res+x],d=y*(res*2+1)+1+x*2;raw[d]=v>>8;raw[d+1]=v&255;}}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(res,0);ihdr.writeUInt32BE(res,4);ihdr[8]=16;ihdr[9]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
// writes <name>.heightmap16.png, <name>.unity.raw, <name>.json into dir
export async function exportAll(result,dir,name){
  await mkdir(dir,{recursive:true});
  const hm=toHeightmap16(result),raw=toUnityRaw(result,{res:513});
  await writeFile(path.join(dir,`${name}.heightmap16.png`),png16(hm.res,hm.data));
  await writeFile(path.join(dir,`${name}.unity.raw`),raw.bytes);
  await writeFile(path.join(dir,`${name}.json`),JSON.stringify({...toMetaJSON(result),unity:raw.info,heightmap16:{res:hm.res,heightMin:hm.heightMin,heightMax:hm.heightMax}},null,1));
}
