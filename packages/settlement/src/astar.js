// Slope-aware least-cost A* over the terrain grid. 16-neighbour moves, binary heap, deterministic.
const OFFS=[];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1],[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]])OFFS.push([dx,dy,Math.hypot(dx,dy)]);
export function nearestValid(T,i,j,rad=4){let best=-1,bd=1e9;for(let dj=-rad;dj<=rad;dj++)for(let di=-rad;di<=rad;di++){const a=i+di,b=j+dj;if(a<0||b<0||a>=T.N||b>=T.N)continue;const k=b*T.N+a;if(!T.dry[k]||!T.pass[k])continue;const d=di*di+dj*dj;if(d<bd){bd=d;best=k;}}return best;}
export function astar(T,start,goal,o={}){
  const N=T.N,n=N*N,cell=T.cell,h=T.h,slope=T.slope;
  const gradeMax=o.gradeMax??0.3,gradeRef=o.gradeRef??0.12,wGrade=o.wGrade??2,wSlope=o.wSlope??3,bridgeCost=o.bridgeCost??30,reuse=o.reuseMul??0.35,used=o.used||null;
  const noise=o.noise||null,noiseAmp=o.noiseAmp||0,shoreD=o.shoreDist??0,shoreW=o.shoreW||0,hMul=o.hMul??0.85;
  const [bi0,bi1,bj0,bj1]=o.box||[0,N-1,0,N-1];
  const g=new Float32Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),closed=new Uint8Array(n);
  let cap=1<<14,hk=new Float64Array(cap),hv=new Int32Array(cap),hs=0;
  const push=(key,v)=>{if(hs===cap){cap*=2;const a=new Float64Array(cap);a.set(hk);hk=a;const b=new Int32Array(cap);b.set(hv);hv=b;}let i=hs++;while(i>0){const p=(i-1)>>1;if(hk[p]<key||(hk[p]===key&&hv[p]<=v))break;hk[i]=hk[p];hv[i]=hv[p];i=p;}hk[i]=key;hv[i]=v;};
  const pop=()=>{const rk=hk[0],rv=hv[0];hs--;if(hs>0){const key=hk[hs],v=hv[hs];let i=0;for(;;){let c=2*i+1;if(c>=hs)break;if(c+1<hs&&(hk[c+1]<hk[c]||(hk[c+1]===hk[c]&&hv[c+1]<hv[c])))c++;if(hk[c]<key||(hk[c]===key&&hv[c]<v)){hk[i]=hk[c];hv[i]=hv[c];i=c;}else break;}hk[i]=key;hv[i]=v;}return rv;};
  const gi=goal%N,gj=(goal/N)|0;
  g[start]=0;push(0,start);let exp=0,found=false;const maxExp=o.maxExp||600000;
  while(hs){const k=pop();if(closed[k])continue;closed[k]=1;if(k===goal){found=true;break;}if(++exp>maxExp)break;
    const ki=k%N,kj=(k/N)|0;
    for(let q=0;q<16;q++){const [dx,dy,len]=OFFS[q];const a=ki+dx,b=kj+dy;if(a<bi0||a>bi1||b<bj0||b>bj1)continue;const k2=b*N+a;if(closed[k2]||!T.pass[k2])continue;
      if(q>=8){const sx=dx>0?1:dx<0?-1:0,sy=dy>0?1:dy<0?-1:0;let m1,m2;if(Math.abs(dx)===2){m1=kj*N+ki+sx;m2=(kj+dy)*N+ki+sx;}else{m1=(kj+sy)*N+ki;m2=(kj+sy)*N+ki+dx;}if(!T.pass[m1]||!T.pass[m2])continue;}
      const d=len*cell,grade=Math.abs(h[k2]-h[k])/d;if(grade>gradeMax)continue;
      let c=d*(1+wGrade*(grade/gradeRef)*(grade/gradeRef)+wSlope*slope[k2]);
      if(T.wat[k2])c+=bridgeCost*d;
      if(shoreW){const e=Math.abs(T.dSea[k2]-shoreD);c+=shoreW*d*(e>4?4:e);}
      if(noiseAmp)c*=1+noiseAmp*noise(a,b);
      if(used&&used[k2])c*=reuse;
      const ng=g[k]+c;if(ng<g[k2]){g[k2]=ng;prev[k2]=k;push(ng+Math.hypot(a-gi,b-gj)*cell*hMul,k2);}}}
  if(!found)return null;const out=[];for(let k=goal;k!==-1;k=prev[k])out.push(k);out.reverse();return out;
}
export function valueNoise(seedInt,scale){const hsh=(x,y)=>{let t=Math.imul(x*374761393+y*668265263+seedInt,1274126177);t^=t>>>13;t=Math.imul(t,1103515245);return((t^(t>>>16))>>>0)/4294967296;};
  return (i,j)=>{const x=i/scale,y=j/scale,x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    const a=hsh(x0,y0),b=hsh(x0+1,y0),c=hsh(x0,y0+1),d=hsh(x0+1,y0+1);return (a*(1-sx)+b*sx)*(1-sy)+(c*(1-sx)+d*sx)*sy;};}
