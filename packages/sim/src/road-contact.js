import {wheelbase} from './roadster.js';

export const halfTrack = .78;
export const halfWheelbase = wheelbase / 2;
const hubs = [[-halfTrack,-halfWheelbase],[-halfTrack,halfWheelbase],
  [halfTrack,-halfWheelbase],[halfTrack,halfWheelbase]];

// The same contact patch supplies the tire model and the rendered wheels.
// Local +X is across the car and +Z is forward. The rig uses YXZ rotations.
export function roadContact(heightAt,x,z,yaw,state) {
  if (state.heightAt === heightAt && state.x === x && state.z === z && state.yaw === yaw) return state;
  state.heightAt=heightAt; state.x=x; state.z=z; state.yaw=yaw;
  const dx=Math.sin(yaw), dz=Math.cos(yaw);
  const heights=state.heights ??= new Float64Array(4);
  const travel=state.travel ??= new Float64Array(4);
  for (let i=0;i<hubs.length;i++) {
    const [u,v]=hubs[i];
    heights[i]=heightAt(x+dz*u+dx*v,z-dx*u+dz*v);
  }
  const [rightRear,rightFront,leftRear,leftFront]=heights;
  const forward=(rightFront+leftFront-rightRear-leftRear)/(4*halfWheelbase);
  const across=(leftRear+leftFront-rightRear-rightFront)/(4*halfTrack);
  const pitch=-Math.atan(forward), roll=Math.atan2(across,Math.hypot(1,forward));
  const cp=Math.cos(pitch), sp=Math.sin(pitch), cr=Math.cos(roll), sr=Math.sin(roll);
  state.grade=forward; state.crossGrade=across; state.pitch=pitch; state.roll=roll;

  // Project the tilted wheel positions back onto the deck. Their mean sets
  // ride height. Any diagonal change in camber is taken up at the four hubs.
  let sum=0;
  for (let i=0;i<hubs.length;i++) {
    const [u,v]=hubs[i];
    const localX=cr*u, localZ=sp*sr*u+cp*v;
    const localY=cp*sr*u-sp*v;
    heights[i]=heightAt(x+dz*localX+dx*localZ,z-dx*localX+dz*localZ)-localY;
    sum+=heights[i];
  }
  state.y=sum/4;
  for (let i=0;i<hubs.length;i++) travel[i]=Math.max(-.16,Math.min(.16,(heights[i]-state.y)*cp*cr));
  return state;
}
