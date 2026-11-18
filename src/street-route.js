import {walkable} from './street-world.js';
import {routeOnGrid} from './walk-grid.js';

export function walkingRoute(island,plots,layout,start,goal){
  return routeOnGrid(p=>walkable(island,plots,layout,p),start,goal);
}
