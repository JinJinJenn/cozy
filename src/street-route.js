import {walkable} from './street-world.js';

const steps=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const stride=.64;
const distance=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);

function clearSegment(canWalk,a,b){
  const n=Math.max(1,Math.ceil(distance(a,b)/.24));
  for(let i=1;i<=n;i++){
    const t=i/n;
    if(!canWalk({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}))return false;
  }
  return true;
}

// A sparse grid anchored on the walker fits doors with arbitrary rotations.
// Start with the exact requested line. Search only where obstacles require it.
export function walkingRoute(island,plots,layout,start,goal){
  const allowed=p=>walkable(island,plots,layout,p);
  if(!Number.isFinite(goal.x)||!Number.isFinite(goal.z)||!allowed(goal))return null;
  if(clearSegment(allowed,start,goal))return [goal];
  const nodes=new Map(),open=[];
  function push(n){
    let i=open.length;open.push(n);
    while(i){const parent=(i-1)>>1;if(open[parent].f<=n.f)break;open[i]=open[parent];i=parent;}
    open[i]=n;
  }
  function pop(){
    const first=open[0],last=open.pop();if(!open.length)return first;
    let i=0;
    while(i*2+1<open.length){let child=i*2+1;
      if(child+1<open.length&&open[child+1].f<open[child].f)child++;
      if(open[child].f>=last.f)break;open[i]=open[child];i=child;
    }
    open[i]=last;return first;
  }
  function node(ix,iz){
    const key=ix+','+iz;
    if(!nodes.has(key)){
      const p={x:start.x+ix*stride,z:start.z+iz*stride,ix,iz,g:Infinity};
      nodes.set(key,allowed(p)?p:null);
    }
    return nodes.get(key);
  }
  const root={x:start.x,z:start.z,ix:0,iz:0,g:0};nodes.set('0,0',root);push({p:root,f:0});
  for(let count=0;open.length&&count<6500;count++){
    const {p}=pop();if(p.closed)continue;p.closed=true;
    if(distance(p,goal)<1.4&&clearSegment(allowed,p,goal)){
      const route=[goal];for(let q=p;q.previous;q=q.previous)route.push(q);
      route.reverse();
      const result=[];let at=start,i=0;
      while(i<route.length){
        let j=i;
        while(j+1<route.length&&clearSegment(allowed,at,route[j+1]))j++;
        at=route[j];result.push({x:at.x,z:at.z});i=j+1;
      }
      return result;
    }
    for(const [dx,dz] of steps){
      const q=node(p.ix+dx,p.iz+dz);
      if(!q||q.closed)continue;
      const g=p.g+stride*(dx&&dz?Math.SQRT2:1);
      if(g>=q.g||!clearSegment(allowed,p,q))continue;
      q.g=g;q.previous=p;push({p:q,f:g+distance(q,goal)*1.02});
    }
  }
  return null;
}
