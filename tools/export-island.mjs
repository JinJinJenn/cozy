// node tools/export-island.mjs <preset> [seed] [outDir]  -> heightmap PNG16 + Unity RAW + JSON
import {generate} from '../packages/island-gen/index.js';
import {exportAll} from '../packages/island-gen/export-node.js';
const [preset='pineHighlands',seed='petalwood',out='docs/exports']=process.argv.slice(2);
const r=generate({seed,preset});
await exportAll(r,out,`${preset}-${seed}`);
console.log('exported',preset,seed,'to',out,JSON.stringify(r.stats));
