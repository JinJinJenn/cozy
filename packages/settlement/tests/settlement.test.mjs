import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSettlement,flattenHeightfield,createFlattenHook} from '../index.js';
import {pointInPoly,distSeg} from '../src/geom.js';

// Synthetic island: a dome with a narrow river (x=60) and a wide lake. Independent of island-gen, so these tests stay
// valid when the real generator changes. Invariants only, never snapshots.
function fixture(){
  const N=257,size=1024,cell=size/(N-1),half=size/2,h=new Float32Array(N*N),w=new Float32Array(N*N);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const x=-half+i*cell,z=-half+j*cell,r=Math.hypot(x,z);let v=26*(1-(r/400)**2)+1.2*Math.sin(x*0.03)*Math.cos(z*0.027);
    if(Math.abs(x-60)<6&&Math.abs(z)<380){v-=2.5;w[j*N+i]=1;}
    if(Math.hypot(x+170,z-130)<65){v-=9;w[j*N+i]=1;}
    h[j*N+i]=v;}
  return {seed:'fx',presetId:'harborTown',size,grid:N,cell,seaLevel:0,heightfield:h,water:w};
}
const strip=p=>JSON.stringify({...p,stats:{...p.stats,ms:0}});
const isl=fixture();
const plan=generateSettlement(isl,{seed:'t1',style:'harborTown'});
const nearestW=(x,z)=>{const half=isl.size/2,i=Math.min(isl.grid-1,Math.max(0,Math.round((x+half)/isl.cell))),j=Math.min(isl.grid-1,Math.max(0,Math.round((z+half)/isl.cell)));return isl.water[j*isl.grid+i];};
const hAt=(x,z)=>{const N=isl.grid,half=isl.size/2,fi=Math.min(N-1.0001,Math.max(0,(x+half)/isl.cell)),fj=Math.min(N-1.0001,Math.max(0,(z+half)/isl.cell)),i=Math.floor(fi),j=Math.floor(fj),tx=fi-i,tz=fj-j,k=j*N+i,a=isl.heightfield;
  return (a[k]*(1-tx)+a[k+1]*tx)*(1-tz)+(a[k+N]*(1-tx)+a[k+N+1]*tx)*tz;};
function dense(pts,step=1.5){const o=[];for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/step));for(let t=0;t<n;t++)o.push([a[0]+(b[0]-a[0])*t/n,a[1]+(b[1]-a[1])*t/n]);}o.push(pts[pts.length-1]);return o;}

test('fixture produces sites, roads, blocks, lots',()=>{
  assert.ok(plan.sites.length>=1);assert.ok(plan.roads.length>0);assert.ok(plan.blocks.length>0);assert.ok(plan.lots.length>0);
  assert.ok(plan.stats.buildable>0);
});
test('deterministic: same seed identical, different seed differs',()=>{
  const again=generateSettlement(isl,{seed:'t1',style:'harborTown'});assert.equal(strip(plan),strip(again));
  const other=generateSettlement(isl,{seed:'t2',style:'meadowCove'});assert.notEqual(strip(plan),strip(other));
});
test('output is plain JSON: round trips, all numbers finite',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(plan)),plan);
  const walk=v=>{if(typeof v==='number')assert.ok(Number.isFinite(v));else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){assert.ok(!ArrayBuffer.isView(v));Object.values(v).forEach(walk);}else assert.notEqual(typeof v,'function');};
  walk(plan);
});
test('roads never enter the sea; water only under flagged bridges, never the wide lake',()=>{
  for(const r of plan.roads){
    for(const p of dense(r.pts)){
      assert.ok(hAt(p[0],p[1])>0,`road ${r.id} point in sea`);
      if(nearestW(p[0],p[1])>0.02)assert.ok(r.bridge,`road ${r.id} crosses water without bridge flag`);
      assert.ok(Math.hypot(p[0]+170,p[1]-130)>50,`road ${r.id} in lake`);
    }
    if(r.bridge)assert.ok(['bridge','ford'].includes(r.kind));
  }
});
test('main roads and branches exist and bridges are short',()=>{
  assert.ok(plan.roads.some(r=>r.class==='main'));
  for(const r of plan.roads.filter(r=>r.bridge)){let L=0;for(let i=0;i<r.pts.length-1;i++)L+=Math.hypot(r.pts[i+1][0]-r.pts[i][0],r.pts[i+1][1]-r.pts[i][1]);assert.ok(L<60,'bridge too long');}
});
test('lots sit inside their blocks and front an existing road',()=>{
  const blocks=new Map(plan.blocks.map(b=>[b.id,b])),roads=new Set(plan.roads.map(r=>r.id));
  for(const l of plan.lots){
    const b=blocks.get(l.blockId);assert.ok(b);assert.ok(roads.has(l.frontageRoadId));
    const cx=l.poly.reduce((a,p)=>a+p[0],0)/l.poly.length,cz=l.poly.reduce((a,p)=>a+p[1],0)/l.poly.length;
    assert.ok(pointInPoly(cx,cz,b.poly),`lot ${l.id} centroid outside block`);
    for(const v of l.poly){let inside=pointInPoly(v[0],v[1],b.poly),d=1e9;if(!inside)for(let i=0;i<b.poly.length;i++){const a=b.poly[i],c=b.poly[(i+1)%b.poly.length];d=Math.min(d,distSeg(v[0],v[1],a[0],a[1],c[0],c[1]).d);}
      assert.ok(inside||d<2.5,`lot ${l.id} vertex ${d.toFixed(1)}m outside block`);}
    assert.ok(['small','medium','large'].includes(l.size));assert.ok(l.district);
  }
});
test('buildable lots are under the slope limit and dry',()=>{
  const lim=plan.params.slopeLimit;let n=0;
  for(const l of plan.lots.filter(l=>l.buildable)){n++;assert.ok(l.slope<=lim);assert.ok(l.area>=plan.params.lotW*plan.params.lotD*0.4);assert.ok(hAt(l.poly[0][0],l.poly[0][1])>0);}
  assert.ok(n>0);
});
test('layers carry minimap-ready flat world-metre arrays',()=>{
  assert.equal(plan.layers.roads.length,plan.roads.length);assert.equal(plan.layers.plots.length,plan.lots.length);
  for(const r of plan.layers.roads.slice(0,5)){assert.equal(r.xz.length%2,0);assert.ok(r.xz.length>=4);}
});
test('flatten returns a graded copy: input untouched, sea and water cells untouched',()=>{
  const before=Float32Array.from(isl.heightfield),out=flattenHeightfield(isl,plan);
  assert.deepEqual(isl.heightfield,before);assert.notEqual(out,isl.heightfield);assert.equal(out.length,before.length);
  let changed=0;for(let k=0;k<out.length;k++){if(before[k]<0.3||isl.water[k]>0.02)assert.equal(out[k],before[k]);else if(out[k]!==before[k])changed++;assert.ok(Number.isFinite(out[k]));}
  assert.ok(changed>0);
  assert.deepEqual(createFlattenHook(plan)(isl),out);
});
test('flatten flattens: road beds have lower cross slope than before',()=>{
  const out=flattenHeightfield(isl,plan,{pads:false});
  const N=isl.grid,half=isl.size/2,c=isl.cell,sample=(a,x,z)=>{const i=Math.round((x+half)/c),j=Math.round((z+half)/c);return a[j*N+i];};
  let b=0,a=0,n=0;
  for(const r of plan.roads){if(r.bridge||r.width<5)continue;for(const p of dense(r.pts,4)){if(nearestW(p[0],p[1])>0)continue;const gx=(sample(isl.heightfield,p[0]+c,p[1])-sample(isl.heightfield,p[0]-c,p[1])),gx2=(sample(out,p[0]+c,p[1])-sample(out,p[0]-c,p[1]));b+=Math.abs(gx);a+=Math.abs(gx2);n++;}}
  assert.ok(n>0);assert.ok(a<=b+1e-3,'graded roads should not be steeper on average');
});
test('real presets: at least one site and buildable lots, roads dry (loose floors)',async()=>{
  const {generate,PRESET_IDS}=await import('../../island-gen/index.js');
  for(const id of PRESET_IDS){
    const r=generate({seed:'cozy-1',preset:id}),p=generateSettlement(r,{seed:'cozy-1',style:id});
    assert.ok(p.sites.length>=1,id+' sites');assert.ok(p.stats.buildable>=1,id+' lots');assert.ok(p.roads.length>=1,id+' roads');
    const hh=Float32Array.from(r.heightfield);
    for(const rd of p.roads)for(const q of dense(rd.pts,3)){const N=r.grid,half=r.size/2,i=Math.round((q[0]+half)/r.cell),j=Math.round((q[1]+half)/r.cell);assert.ok(hh[j*N+i]>0,id+' road in sea');}
    assert.deepEqual(r.heightfield,hh);
  }
});

// ---- weakness fixes: connectivity, grade fallback, smooth roads, non-rect lots, site shape ----
const crs=(o,p,q)=>(p[0]-o[0])*(q[1]-o[1])-(p[1]-o[1])*(q[0]-o[0]);
const simplePoly=p=>{const k=p.length;for(let i=0;i<k;i++)for(let j=i+2;j<k;j++){if(i===0&&j===k-1)continue;const a=p[i],b=p[(i+1)%k],c=p[j],d=p[(j+1)%k];if(crs(a,b,c)*crs(a,b,d)<0&&crs(c,d,a)*crs(c,d,b)<0)return false;}return true;};
function lotsOk(p,label){
  for(const l of p.lots){assert.ok(l.poly.length>=3&&l.poly.length<=16,label+' vertex count');assert.ok(simplePoly(l.poly),`${label} lot ${l.id} self-intersects`);
    assert.ok(['rect','quad','corner','irregular'].includes(l.shape),label+' shape');}
  // pairwise overlap: area shared by two lots stays under 10% of the smaller one
  const bb=p.lots.map(l=>{let a=1e9,b=-1e9,c=1e9,d=-1e9;for(const v of l.poly){a=Math.min(a,v[0]);b=Math.max(b,v[0]);c=Math.min(c,v[1]);d=Math.max(d,v[1]);}return [a,b,c,d];});
  for(let i=0;i<p.lots.length;i++)for(let j=i+1;j<p.lots.length;j++){const A=bb[i],B=bb[j];if(A[1]<B[0]||B[1]<A[0]||A[3]<B[2]||B[3]<A[2])continue;
    let h=0;for(let x=Math.max(A[0],B[0]);x<=Math.min(A[1],B[1]);x+=1)for(let z=Math.max(A[2],B[2]);z<=Math.min(A[3],B[3]);z+=1)if(pointInPoly(x,z,p.lots[i].poly)&&pointInPoly(x,z,p.lots[j].poly))h++;
    assert.ok(h<=0.1*Math.min(p.lots[i].area,p.lots[j].area)+2,`${label} lots ${p.lots[i].id}/${p.lots[j].id} overlap`);}
}
test('fixture lots: simple polygons, no overlap, some non-rectangular shapes',()=>{
  lotsOk(plan,'fixture');
  const shapes=new Set(plan.lots.map(l=>l.shape));assert.ok(shapes.has('quad'),'quads');assert.ok(shapes.size>=2,'more than one plot shape');
});
test('real presets: all sites connected, no failed routes, smooth roads, valid lots',async()=>{
  const {generate,PRESET_IDS}=await import('../../island-gen/index.js');
  for(const id of PRESET_IDS){
    const r=generate({seed:'cozy-1',preset:id}),p=generateSettlement(r,{seed:'cozy-1',style:id});
    assert.deepEqual(p.stats.unconnectedSites,[],id+' unconnected sites');assert.equal(p.stats.failedRoutes,0,id+' failed routes');
    assert.ok(p.sites.every(s=>s.landFrac>0),id+' site landFrac');
    // smooth: very few sharp kinks per vertex outside switchback terrain (pine hairpins are intentional)
    let n=0,sharp=0;for(const rd of p.roads)for(let k=1;k<rd.pts.length-1;k++){const a=rd.pts[k-1],b=rd.pts[k],c=rd.pts[k+1],u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-b[0],c[1]-b[1]];
      if(!Math.hypot(...u)||!Math.hypot(...v))continue;n++;if(Math.abs(Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]))>Math.PI/4)sharp++;}
    if(id!=='pineHighlands')assert.ok(sharp<=0.02*n+1,`${id} sharp bends ${sharp}/${n}`);
    lotsOk(p,id);
  }
});
