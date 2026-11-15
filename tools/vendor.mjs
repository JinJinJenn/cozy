import {mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const nm=path.join(root,'node_modules/three');
await mkdir(path.join(root,'vendor/addons/controls'),{recursive:true});
try{
  for(const f of ['three.module.js','three.core.js'])await copyFile(path.join(nm,'build',f),path.join(root,'vendor',f));
  await copyFile(path.join(nm,'examples/jsm/controls/OrbitControls.js'),path.join(root,'vendor/addons/controls/OrbitControls.js'));
  await copyFile(path.join(nm,'LICENSE'),path.join(root,'vendor/THREE-LICENSE.txt'));
  console.log('Three.js 0.180.0 copied to vendor/.');
}catch(e){console.error('Run npm install first, then npm run vendor.',e.message);process.exit(1);}
