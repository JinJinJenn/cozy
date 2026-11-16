// island-gen public API. Zero dependencies, runs in Node and browsers.
import {createIsland,SEA_LEVEL} from './src/island.js';
import {PRESETS,PRESET_IDS} from './src/presets.js';
import {buildTerrainChunk,buildWaterChunk} from './src/chunks.js';
export {createIsland,SEA_LEVEL,PRESETS,PRESET_IDS,buildTerrainChunk,buildWaterChunk};

// generate({seed, preset, grid?, droplets?, stream?}) -> result
//   result.heightfield  Float32Array grid*grid, row-major (z rows, x cols), metres, sea level = 0
//   result.water        Float32Array grid*grid, water surface level above sea (rivers/lakes), 0 elsewhere
//   result.size/grid/cell  world size (m), grid points per side, metres per cell
//   result.seaLevel     0
//   result.zones        the preset's paint rules (data)
//   result.flattenHook  null; reserved for a future lot/road flatten mask
//   result.island       query handle: sample(x,z) slope(x,z) waterAt(x,z) paint(...) shoreAt(angle) checksum()
// World coordinates: x,z in [-size/2, size/2]; grid index i = (x + size/2)/cell.
export function generate({seed='petalwood',preset='meadowCove',grid,droplets,stream}={}){
  const isl=createIsland(seed,preset,{grid,droplets,stream});
  return {seed:isl.seed,presetId:isl.presetId,preset:isl.preset,seaLevel:SEA_LEVEL,size:isl.size,grid:isl.grid,cell:isl.cell,
    heightfield:isl.h,water:isl.water,stats:isl.stats,zones:isl.preset.zones,palette:isl.preset.palette,flattenHook:isl.flattenHook,island:isl};
}

// ---- exporters (browser-safe) ----
// 16-bit heightmap, heights mapped linearly min..max -> 0..65535.
export function toHeightmap16(result,{res}={}){
  const src=result.heightfield,N=result.grid,R=res||N;
  let min=Infinity,max=-Infinity;for(const v of src){if(v<min)min=v;if(v>max)max=v;}
  const data=new Uint16Array(R*R),k=max-min||1;
  for(let j=0;j<R;j++)for(let i=0;i<R;i++){
    const fx=i/(R-1)*(N-1),fz=j/(R-1)*(N-1),x0=Math.min(N-2,Math.floor(fx)),z0=Math.min(N-2,Math.floor(fz)),tx=fx-x0,tz=fz-z0,q=z0*N+x0;
    const v=(src[q]*(1-tx)+src[q+1]*tx)*(1-tz)+(src[q+N]*(1-tx)+src[q+N+1]*tx)*tz;
    data[j*R+i]=Math.round((v-min)/k*65535);
  }
  return {data,res:R,heightMin:min,heightMax:max,seaLevelNormalized:(0-min)/k,metersPerPixel:result.size/(R-1)};
}
// Unity terrain RAW: 16-bit little-endian, square. Use res = 2^n+1 (513, 1025). Terrain height = heightMax-heightMin,
// sea level at y = -heightMin when the terrain object sits at y=heightMin... see README.
export function toUnityRaw(result,{res=513}={}){
  const hm=toHeightmap16(result,{res});
  const buf=new Uint8Array(hm.data.length*2);
  for(let i=0;i<hm.data.length;i++){buf[i*2]=hm.data[i]&255;buf[i*2+1]=hm.data[i]>>8;}
  return {bytes:buf,info:{res:hm.res,heightMin:hm.heightMin,heightMax:hm.heightMax,terrainHeight:hm.heightMax-hm.heightMin,worldSize:result.size,seaLevelY:-hm.heightMin}};
}
export function toMetaJSON(result){
  return {seed:result.seed,preset:result.presetId,size:result.size,grid:result.grid,cell:result.cell,seaLevel:result.seaLevel,stats:result.stats,zones:result.zones,palette:result.palette,checksum:result.island.checksum()};
}
