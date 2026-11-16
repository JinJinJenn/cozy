// Town-centre site selection: flat dry land with a minimum flat area, preferring coast and river mouths.
import {rngFor} from './rng.js';
const LEVELS=[{frac:0.6,slope:0.15},{frac:0.5,slope:0.18},{frac:0.4,slope:0.22},{frac:0.3,slope:0.28}];
export function pickSites(T,S,seed){
  const N=T.N,cell=T.cell,rng=rngFor(seed,'sites');
  const rad=Math.max(6,Math.round(65/cell)),step=2,sites=[];
  // all sites live on ONE connected landmass (roads never cross the sea): the passable component with the most dry cells
  const cnt=new Map();for(let k=0;k<N*N;k++)if(T.dry[k]&&T.comp[k]>=0)cnt.set(T.comp[k],(cnt.get(T.comp[k])||0)+1);
  let main=-1,mc=-1;for(const [c,v] of [...cnt.entries()].sort((a,b)=>a[0]-b[0]))if(v>mc){mc=v;main=c;}
  const onlyMain=S.mainLandOnly!==false&&main>=0;
  // wide land window (not just the flat window): rejects thin coastal strips and isthmus sites
  const lrad=Math.max(rad+2,Math.round((S.landRadius||100)/cell)),landMin=S.landFrac??0.5;
  const LI=new Int32Array((N+1)*(N+1));
  for(let j=0;j<N;j++){let row=0;for(let i=0;i<N;i++){row+=T.dry[j*N+i]?1:0;LI[(j+1)*(N+1)+i+1]=LI[j*(N+1)+i+1]+row;}}
  const landAt=(i,j)=>{const a=Math.max(0,i-lrad),b=Math.min(N-1,i+lrad),c=Math.max(0,j-lrad),d=Math.min(N-1,j+lrad);
    return (LI[(d+1)*(N+1)+b+1]-LI[c*(N+1)+b+1]-LI[(d+1)*(N+1)+a]+LI[c*(N+1)+a])/((b-a+1)*(d-c+1));};
  for(const L of LEVELS){
    if(sites.length>=S.sites)break;
    const ok=new Uint8Array(N*N);
    for(let k=0;k<N*N;k++)ok[k]=(T.dry[k]&&T.slope[k]<=L.slope&&T.h[k]>=T.sea+1&&T.distWater[k]>=2&&(!onlyMain||T.comp[k]===main))?1:0;
    const I=new Int32Array((N+1)*(N+1));
    for(let j=0;j<N;j++){let row=0;for(let i=0;i<N;i++){row+=ok[j*N+i];I[(j+1)*(N+1)+i+1]=I[j*(N+1)+i+1]+row;}}
    const cand=[];
    for(let j=rad;j<N-rad;j+=step)for(let i=rad;i<N-rad;i+=step){const k=j*N+i;if(!ok[k])continue;
      const a=I[(j+rad+1)*(N+1)+i+rad+1]-I[(j-rad)*(N+1)+i+rad+1]-I[(j+rad+1)*(N+1)+i-rad]+I[(j-rad)*(N+1)+i-rad];
      const frac=a/((2*rad+1)*(2*rad+1));if(frac<L.frac)continue;const lf=landAt(i,j);if(lf<landMin-(L===LEVELS[LEVELS.length-1]?0.1:0))continue;
      const dw=T.dSea[k]*cell,coast=Math.max(0,1-Math.abs(dw-70)/180)*1.5;
      const mouth=(T.dRiver[k]*cell<130&&T.dSea[k]*cell<240)?0.6:0;
      cand.push({k,i,j,frac,coast,mouth,lf,score:frac*3+coast+mouth+rng()*0.05});}
    cand.sort((a,b)=>b.score-a.score||a.k-b.k);
    for(const c of cand){if(sites.length>=S.sites)break;
      const [x,z]=T.xz(c.i,c.j);let clash=false;for(const s of sites)if(Math.hypot(s.x-x,s.z-z)<S.spacing){clash=true;break;}
      if(clash)continue;
      sites.push({id:'s'+sites.length,x,z,k:c.k,i:c.i,j:c.j,h:T.h[c.k],flatFrac:c.frac,flatArea:Math.round(c.frac*(2*rad*cell)**2),coastDist:Math.round(T.dSea[c.k]*cell),riverMouth:c.mouth>0,score:c.score,slopeLevel:L.slope,landFrac:c.lf});}
  }
  return sites;
}
