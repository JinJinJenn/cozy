// Road network: town streets by style (grid / organic / boardwalk / switchback), then a main coast loop with branches
// between town centres. Everything is routed on the heightfield with slope-aware A* and validated after smoothing.
import {astar,nearestValid,valueNoise} from './astar.js';
import {chaikin,dpOpen,r1} from './geom.js';
import {rngFor,hashStr} from './rng.js';

export function buildRoads(T,sites,S,seed){
  const N=T.N,cell=T.cell,used=new Uint8Array(N*N),roads=[],stats={droppedPieces:0,failedRoutes:0,routes:0};
  const W=S.widths,noise=valueNoise(hashStr(seed+'|noise'),6);
  const stamp=k=>{const i=k%N,j=(k/N)|0;for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const a=i+di,b=j+dj;if(a>=0&&b>=0&&a<N&&b<N)used[b*N+a]=1;}};
  const segState=(a,b)=>{const L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(L/1.5));let s=0;for(let i=0;i<=n;i++){const t=i/n,v=T.state(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t);if(v>s)s=v;if(s===2)return 2;}return s;};
  const statesOf=p=>{const out=[];for(let i=0;i<p.length-1;i++){const s=segState(p[i],p[i+1]);if(s===2)return null;out.push(s);}return out;};
  function emit(raw,cls,width){
    const cands=[chaikin(dpOpen(raw,1.5),2),chaikin(raw,2),raw];let pts=null,st=null;
    for(const c of cands){st=statesOf(c);if(st){pts=c;break;}}
    if(!pts){stats.droppedPieces++;return;}
    let s=0;while(s<st.length){let e=s;while(e+1<st.length&&st[e+1]===st[s])e++;
      const piece=pts.slice(s,e+2);if(piece.length>=2){let len=0;for(let i=0;i<piece.length-1;i++)len+=Math.hypot(piece[i+1][0]-piece[i][0],piece[i+1][1]-piece[i][1]);
        if(st[s]===0||len>1){const r={id:'r'+roads.length,class:cls,width:width,bridge:st[s]===1,pts:piece.map(p=>[r1(p[0]),r1(p[1])])};if(r.bridge)r.kind=len<=10?'ford':'bridge';roads.push(r);}}
      s=e+1;}
  }
  function addPath(nodes,cls,width,dedupe=true){
    if(!nodes||nodes.length<2)return;
    const xz=nodes.map(k=>T.xz(k%N,(k/N)|0));let i=0;
    while(i<nodes.length){
      if(dedupe&&used[nodes[i]]){i++;continue;}
      let e=i;while(e+1<nodes.length&&(!dedupe||!used[nodes[e+1]]))e++;
      if(e-i+1>=2||!dedupe){const s=Math.max(0,i-1),f=Math.min(nodes.length-1,e+1);emit(xz.slice(s,f+1),cls,width);}
      i=e+1;}
    for(const k of nodes)stamp(k);stats.routes++;
  }
  function addPolyline(pts,cls,width){emit(pts,cls,width);const L=pts.length;for(let i=0;i<L-1;i++){const a=pts[i],b=pts[i+1],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/cell);for(let t=0;t<=n;t++)stamp(T.k(a[0]+(b[0]-a[0])*t/n,a[1]+(b[1]-a[1])*t/n));}}
  const baseOpts=()=>({gradeMax:S.gradeMax,gradeRef:S.gradeRef,wGrade:S.wGrade,wSlope:S.wSlope});
  const route=(a,b,o)=>{const p=astar(T,a,b,{...baseOpts(),...o});if(!p)stats.failedRoutes++;return p;};

  // ---- town streets ----
  for(const site of sites){
    const rng=rngFor(seed,'streets|'+site.id),cx=site.x,cz=site.z,R=S.R;
    const box=[Math.max(0,site.i-Math.ceil((R+30)/cell)),Math.min(N-1,site.i+Math.ceil((R+30)/cell)),Math.max(0,site.j-Math.ceil((R+30)/cell)),Math.min(N-1,site.j+Math.ceil((R+30)/cell))];
    if(S.type==='grid'){
      let best=0,bd=1e9;for(let a=0;a<32;a++){const ang=a*Math.PI/16;for(let d=8;d<=220;d+=4){if(T.state(cx+Math.cos(ang)*d,cz+Math.sin(ang)*d)!==0){if(d<bd){bd=d;best=ang;}break;}}}
      const ang=bd<1e9?Math.round(best/(Math.PI/36))*(Math.PI/36):0;
      for(const axis of [0,1]){const a=ang+axis*Math.PI/2,ux=Math.cos(a),uz=Math.sin(a),vx=-uz,vz=ux,m=Math.floor(R/S.streetSpacing);
        for(let q=-m;q<=m;q++){const off=q*S.streetSpacing,L=Math.sqrt(Math.max(0,R*R-off*off));let run=[];
          const flush=()=>{if(run.length>=9){const pts=dpOpen(run,0.4);addPolyline(pts,q===0?'main':S.streetClass,q===0?W.main:W.street);}run=[];};
          for(let s=-L;s<=L;s+=3){const x=cx+ux*s+vx*off,z=cz+uz*s+vz*off;if(T.state(x,z)===0&&T.slopeAt(x,z)<=0.22)run.push([x,z]);else flush();}
          flush();}}
    }else{
      const n=S.spokes,base=rng()*Math.PI*2,spokes=[];
      for(let q=0;q<n;q++){const th=base+Math.PI*2*(q+(rng()-0.5)*0.5)/n;let r=R*(0.8+0.3*rng());
        if(S.type==='boardwalk'){let d=8;while(d<R*1.25&&T.state(cx+Math.cos(th)*d,cz+Math.sin(th)*d)===0)d+=3;r=Math.min(R*1.25,d-9);if(r<14)continue;}
        const [ti,tj]=T.ij(cx+Math.cos(th)*r,cz+Math.sin(th)*r),tk=nearestValid(T,ti,tj,4);if(tk<0||tk===site.k)continue;
        const p=route(site.k,tk,{box,used,reuseMul:0.4,noise,noiseAmp:S.noiseAmp||0,maxHalf:S.maxHalf});if(!p)continue;
        spokes.push({th,nodes:p});addPath(p,S.streetClass,W.street);}
      if(spokes.length>=3){
        const fr=S.rings.slice();if(S.type==='boardwalk')fr.push(1);
        for(const f of fr){const pts=spokes.map(sp=>sp.nodes[Math.round(f*(sp.nodes.length-1))]);
          for(let q=0;q<pts.length;q++){const a=pts[q],b=pts[(q+1)%pts.length];if(a===b)continue;
            const o={box,used:null,noise,noiseAmp:(S.noiseAmp||0)*0.8};if(S.type==='boardwalk'&&f===1){o.shoreDist=S.shoreDist;o.shoreW=S.shoreW;}
            const p=route(a,b,o);if(p)addPath(p,f===1&&S.type==='boardwalk'?'path':S.streetClass,f===1&&S.type==='boardwalk'?W.path:W.street);}}}
    }
  }

  // ---- main roads: coast loop through town centres plus branches ----
  const groups=new Map();for(const s of sites){const c=T.comp[s.k];if(!groups.has(c))groups.set(c,[]);groups.get(c).push(s);}
  const unconnected=[];
  for(const [,g] of [...groups.entries()].sort((a,b)=>a[0]-b[0])){
    if(g.length<2){for(const s of g)unconnected.push(s.id);continue;}
    const mx=g.reduce((a,s)=>a+s.x,0)/g.length,mz=g.reduce((a,s)=>a+s.z,0)/g.length;
    const ord=g.slice().sort((a,b)=>Math.atan2(a.z-mz,a.x-mx)-Math.atan2(b.z-mz,b.x-mx)||a.k-b.k);
    const mainOpts={used,reuseMul:0.35,shoreDist:S.shoreDist*1.5,shoreW:S.shoreW,maxHalf:S.maxHalf};
    const edges=[];const m=ord.length;for(let q=0;q<(m===2?1:m);q++)edges.push([ord[q],ord[(q+1)%m]]);
    if(m>=4){let bd=1e18,be=null;for(let a=0;a<m;a++)for(let b=a+2;b<m;b++){if(a===0&&b===m-1)continue;const d=Math.hypot(ord[a].x-ord[b].x,ord[a].z-ord[b].z);if(d<bd){bd=d;be=[ord[a],ord[b]];}}if(be)edges.push(be);}
    for(const [a,b] of edges){const p=route(a.k,b.k,mainOpts);if(p)addPath(p,'main',W.main);}
  }
  return {roads,unconnected,stats};
}
