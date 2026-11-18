// Moving body against a pedestrian, bicycle or car. Extending the rectangle
// by the distance of one straight step covers its entire swept footprint.
const bodies={car:{halfWidth:.88,halfLength:1.62},bike:{halfWidth:.28,halfLength:.99}};
export function trafficContact(kind,dx,dz,travel,rx,rz,otherKind,otherYaw=0,clearance=0){
  const body=bodies[kind],length=body.halfLength+travel*.5+clearance,width=body.halfWidth+clearance;
  const forward=rx*dx+rz*dz-travel*.5,right=rx*dz-rz*dx;
  const other=Object.hasOwn(bodies,otherKind)?bodies[otherKind]:null;
  if(!other){
    const end=Math.max(0,Math.abs(forward)-length),side=Math.max(0,Math.abs(right)-width);
    return end*end+side*side<.29*.29;
  }
  if(Math.abs(right)>width+other.halfLength+other.halfWidth||Math.abs(forward)>length+other.halfLength+other.halfWidth)return false;
  // Test both cars' longitudinal and lateral axes, including rotated corners.
  const sx=Math.sin(otherYaw),sz=Math.cos(otherYaw);
  const cos=dx*sx+dz*sz,sin=dz*sx-dx*sz,c=Math.abs(cos),s=Math.abs(sin);
  return Math.abs(forward)<length+other.halfLength*c+other.halfWidth*s
    &&Math.abs(right)<width+other.halfLength*s+other.halfWidth*c
    &&Math.abs(forward*cos+right*sin)<other.halfLength+length*c+width*s
    &&Math.abs(right*cos-forward*sin)<other.halfWidth+width*c+length*s;
}
