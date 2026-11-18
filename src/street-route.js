import {walkable,walkCell} from './street-world.js';
import {routeOnGrid} from './walk-grid.js';

export function walkingRoute(island,plots,layout,start,goal){
  let cell,cx,cz;
  return routeOnGrid(p=>{
    const x=Math.floor(p.x/32),z=Math.floor(p.z/32);
    if(x!==cx||z!==cz){cell=walkCell(island,plots,x,z);cx=x;cz=z;}
    return walkable(island,plots,layout,p,cell);
  },start,goal);
}
