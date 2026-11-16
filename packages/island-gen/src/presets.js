// Presets are JSON data (presets.json). Add a locale by adding an object there.
import data from './presets.json' with {type:'json'};
export const PRESETS=data;
export const PRESET_IDS=Object.keys(PRESETS);
