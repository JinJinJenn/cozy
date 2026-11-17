// settlement: seeded, deterministic town/road/plot planner for island-gen heightfields. Pure data out, no drawing.
import petalwood from './src/petalwood-plan.json' with {type:'json'};
import {makeTerrain} from './src/terrain.js';
import {pickSites} from './src/sites.js';
import {buildRoads} from './src/roads.js';
import {buildBlocks} from './src/blocks.js';
import {buildLots} from './src/lots.js';
import {flattenHeightfield,createFlattenHook} from './src/flatten.js';
import {styleFor,STYLES} from './src/styles.js';
import {rngFor} from './src/rng.js';
import {r1,r2,polyArea} from './src/geom.js';
import {planCivicCentre} from './src/civic.js';
import {finishStreetEnds,addCountryLanes} from './src/street-ends.js';
import {addFrontageLots} from './src/infill.js';
export {flattenHeightfield,createFlattenHook,STYLES};

// generateSettlement(island, {seed, style}) -> plain JSON-able plan.
// island: a generate() result (heightfield, water, size, grid, cell, seaLevel). style: a locale id (default island.presetId).
export function generateSettlement(island,{seed,style}={}){
  const t0=Date.now(),sd=String(seed??island.seed??'settlement'),S=styleFor(style||island.presetId);
  // Resident homes and saved multiplayer renovations refer to the issued parcel IDs.
  if(island.publishedLayout==='petalwood-v1'&&sd===petalwood.seed&&S.id===petalwood.style){
    const plan=structuredClone(petalwood);
    finishStreetEnds(plan);
    addCountryLanes(plan,makeTerrain(island,{maxHalf:S.maxHalf}));
    plan.civic=planCivicCentre(plan,['l102','l104','l105','l106','l107','l108','l109']);
    addFrontageLots(plan,makeTerrain(island,{maxHalf:S.maxHalf}));
    plan.layers=planLayers(plan);
    plan.stats.ms=Date.now()-t0;
    return plan;
  }
  const T=makeTerrain(island,{maxHalf:S.maxHalf});
  const sites=pickSites(T,S,sd);
  const {roads,unconnected,stats:rs}=buildRoads(T,sites,S,sd);
  const owner=(x,z)=>{let b=null,bd=1e18;for(const s of sites){const d=(s.x-x)**2+(s.z-z)**2;if(d<bd){bd=d;b=s.id;}}return b;};
  const segs=[];for(const r of roads)for(let i=0;i<r.pts.length-1;i++){const a=r.pts[i],b=r.pts[i+1];segs.push({rid:r.id,ax:a[0],az:a[1],bx:b[0],bz:b[1],hw:r.width/2,mnx:Math.min(a[0],b[0]),mxx:Math.max(a[0],b[0]),mnz:Math.min(a[1],b[1]),mxz:Math.max(a[1],b[1])});}
  const blocks=[],lots=[];
  // towns whose windows overlap must not both claim the same free area: 1 m world raster of already-claimed ground
  const G=Math.ceil(island.size)+2,claimed=new Uint8Array(G*G),hs=island.size/2;
  for(const site of sites){
    const {blocks:bl,win,reg}=buildBlocks(T,roads,site,S,owner);const occ=new Uint8Array(win.W*win.W);const rng=rngFor(sd,'lots|'+site.id);
    for(const b of bl){
      {const cl=[];let hit=0;const rs=win.rs,xa=Math.max(0,Math.floor(Math.min(...b.poly.map(v=>v[0]))-win.ox)-1),xb=Math.min(win.W-1,Math.ceil(Math.max(...b.poly.map(v=>v[0]))-win.ox)+1),ya=Math.max(0,Math.floor(Math.min(...b.poly.map(v=>v[1]))-win.oz)-1),yb=Math.min(win.W-1,Math.ceil(Math.max(...b.poly.map(v=>v[1]))-win.oz)+1);
        for(let y=ya;y<=yb;y++)for(let x=xa;x<=xb;x++){if(reg[y*win.W+x]!==b.q)continue;const gx=Math.floor(win.ox+(x+0.5)*rs+hs),gz=Math.floor(win.oz+(y+0.5)*rs+hs);if(gx<0||gz<0||gx>=G||gz>=G)continue;const g=gz*G+gx;if(claimed[g])hit++;cl.push(g);}
        if(hit>cl.length*0.25)continue;for(const g of cl)claimed[g]=1;}
      let poly=b.poly;if(polyArea(poly)<0)poly=poly.slice().reverse();b.poly=poly;const id='b'+blocks.length;
      const before=lots.length;buildLots(T,b,id,site.id,S,{reg,win,centre:site,segs,occ},rng,lots);
      blocks.push({id,townId:site.id,poly:poly.map(v=>[r1(v[0]),r1(v[1])]),area:Math.round(b.area),lots:lots.length-before,
        roadIds:[...new Set(lots.slice(before).map(l=>l.frontageRoadId))]});}
  }
  const outSites=sites.map(s=>({id:s.id,x:r1(s.x),z:r1(s.z),h:r2(s.h),flatFrac:r2(s.flatFrac),flatArea:s.flatArea,coastDist:s.coastDist,riverMouth:s.riverMouth,score:r2(s.score),slopeLevel:s.slopeLevel,landFrac:r2(s.landFrac),radius:S.R}));
  const buildable=lots.filter(l=>l.buildable).length;
  const plan={
    version:1,seed:sd,style:S.id,size:island.size,seaLevel:island.seaLevel||0,
    params:{slopeLimit:S.slopeLimit,lotW:S.lotW,lotD:S.lotD,type:S.type},
    sites:outSites,roads,blocks,lots,
    stats:{sites:sites.length,roads:roads.length,bridges:roads.filter(r=>r.bridge).length,blocks:blocks.length,lots:lots.length,buildable,
      unconnectedSites:unconnected,failedRoutes:rs.failedRoutes,droppedRoadPieces:rs.droppedPieces,relaxedRoutes:rs.relaxedRoutes,ms:Date.now()-t0}};
  plan.civic=planCivicCentre(plan);
  finishStreetEnds(plan);
  addCountryLanes(plan,T);
  addFrontageLots(plan,T);
  plan.layers=planLayers(plan);
  return plan;
}
function planLayers({roads,lots,blocks,sites}){
  return {
    roads:roads.map(r=>({id:r.id,class:r.class,width:r.width,bridge:r.bridge,xz:r.pts.flat()})),
    plots:lots.map(l=>({id:l.id,buildable:l.buildable,district:l.district,size:l.size,xz:l.poly.flat()})),
    blocks:blocks.map(b=>({id:b.id,xz:b.poly.flat()})),
    sites:sites.map(s=>({id:s.id,x:s.x,z:s.z,radius:s.radius}))
  };
}
export const generateTown=generateSettlement;
