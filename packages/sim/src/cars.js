import {hashFloat} from './rng.js';

// Both cars fit the town's compact parking spaces and share wheel mounting points.
const roadster={mass:890,torque:114,frontArm:.96,yawInertia:1.12,cgHeight:.42,lock:.60,frontDrive:false};
const wagon={mass:1230,torque:132,frontArm:.85,yawInertia:1.48,cgHeight:.56,lock:.52,frontDrive:true};

export function carSpec(model){return model==='wagon'?wagon:roadster;}
export function householdCar(seed,lot){return lot && hashFloat(seed,'household car',lot)<.47?'wagon':'roadster';}
