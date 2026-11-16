// Read-only terrain view over an island-gen result. Uses only heightfield, water, size, grid, cell, seaLevel.
// Convention: k=j*N+i, x=-half+i*cell, z=-half+j*cell.
function dt(N,isSource){ // chamfer distance (in cells) to nearest source cell
  const n=N*N,d=new Float32Array(n),INF=1e9,D=1.41421356;
  for(let k=0;k<n;k++)d[k]=isSource[k]?0:INF;
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const k=j*N+i;let v=d[k];
    if(i>0&&d[k-1]+1<v)v=d[k-1]+1;
    if(j>0){if(d[k-N]+1<v)v=d[k-N]+1;if(i>0&&d[k-N-1]+D<v)v=d[k-N-1]+D;if(i<N-1&&d[k-N+1]+D<v)v=d[k-N+1]+D;}
    d[k]=v;}
  for(let j=N-1;j>=0;j--)for(let i=N-1;i>=0;i--){const k=j*N+i;let v=d[k];
    if(i<N-1&&d[k+1]+1<v)v=d[k+1]+1;
    if(j<N-1){if(d[k+N]+1<v)v=d[k+N]+1;if(i<N-1&&d[k+N+1]+D<v)v=d[k+N+1]+D;if(i>0&&d[k+N-1]+D<v)v=d[k+N-1]+D;}
    d[k]=v;}
  return d;
}
export function makeTerrain(island,{maxHalf=3,slopeMax=0.8}={}){
  const N=island.grid,cell=island.cell,half=island.size/2,sea=island.seaLevel||0;
  const h=island.heightfield||island.h,w=island.water,n=N*N;
  const hard=new Uint8Array(n),wat=new Uint8Array(n),dry=new Uint8Array(n),slope=new Float32Array(n);
  for(let k=0;k<n;k++){hard[k]=h[k]<sea+0.3?1:0;wat[k]=(w&&w[k]>0.02&&!hard[k])?1:0;dry[k]=(!hard[k]&&!wat[k])?1:0;}
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const k=j*N+i,i0=i>0?k-1:k,i1=i<N-1?k+1:k,j0=j>0?k-N:k,j1=j<N-1?k+N:k;
    slope[k]=Math.hypot((h[i1]-h[i0])/((i1-i0||1)*cell),(h[j1]-h[j0])/((((j1-j0)/N)||1)*cell));}
  const notDry=new Uint8Array(n),isWat=new Uint8Array(n),isHard=hard;
  for(let k=0;k<n;k++){notDry[k]=dry[k]?0:1;isWat[k]=wat[k];}
  const thick=dt(N,dry);          // for water cells: distance to nearest dry cell (cells)
  const distWater=dt(N,notDry);   // for dry cells: distance to nearest water or sea
  const dRiver=dt(N,isWat),dSea=dt(N,isHard);
  const pass=new Uint8Array(n);
  for(let k=0;k<n;k++)pass[k]=(!hard[k]&&thick[k]<=maxHalf&&(wat[k]||slope[k]<=slopeMax))?1:0;
  // connected components of passable cells (8-neighbour)
  const comp=new Int32Array(n).fill(-1);let nc=0;const st=new Int32Array(n);
  for(let s=0;s<n;s++){if(!pass[s]||comp[s]>=0)continue;let sp=0;st[sp++]=s;comp[s]=nc;
    while(sp){const k=st[--sp],i=k%N,j=(k/N)|0;for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj)continue;const a=i+di,b=j+dj;if(a<0||b<0||a>=N||b>=N)continue;const q=b*N+a;if(pass[q]&&comp[q]<0){comp[q]=nc;st[sp++]=q;}}}
    nc++;}
  const clampI=v=>v<0?0:v>N-1?N-1:v;
  const T={N,cell,half,sea,h,w,hard,wat,dry,slope,thick,distWater,dRiver,dSea,pass,comp,maxHalf,
    ij(x,z){return [clampI(Math.round((x+half)/cell)),clampI(Math.round((z+half)/cell))];},
    xz(i,j){return [-half+i*cell,-half+j*cell];},
    k(x,z){return clampI(Math.round((z+half)/cell))*N+clampI(Math.round((x+half)/cell));},
    bil(a,x,z){const fi=Math.min(N-1.0001,Math.max(0,(x+half)/cell)),fj=Math.min(N-1.0001,Math.max(0,(z+half)/cell));const i=Math.floor(fi),j=Math.floor(fj),tx=fi-i,tz=fj-j,k=j*N+i;
      return (a[k]*(1-tx)+a[k+1]*tx)*(1-tz)+(a[k+N]*(1-tx)+a[k+N+1]*tx)*tz;},
    height(x,z){return T.bil(h,x,z);},
    slopeAt(x,z){return T.bil(slope,x,z);},
    // 0 dry land, 1 bridgeable inland water (narrow), 2 sea / wide water / unusable
    state(x,z){const k=T.k(x,z);if(hard[k])return 2;if(wat[k])return thick[k]<=maxHalf?1:2;return T.height(x,z)<sea+0.1?2:0;}};
  return T;
}
