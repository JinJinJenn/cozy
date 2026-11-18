// Diagnostic renderer isolation only. The served source is instrumented in memory;
// the application files and live site are never modified by this harness.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const out=process.env.COZY_RENDER_REPORT||path.join(root,'test-results/renderer');
await mkdir(out,{recursive:true});
const software=process.argv.includes('--software'),cpu=process.argv.includes('--cpu4')?4:1;
const label=software?'software':cpu>1?'cpu4':'gpu';
const {chromium}=createRequire(process.env.PLAYWRIGHT_FROM||import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE,args:['--mute-audio','--enable-unsafe-swiftshader',...(software?['--use-angle=swiftshader']:[])]});
const report={software,mainThreadCpuThrottle:cpu,results:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),cdp=await page.context().newCDPSession(page);
 if(cpu>1)await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
 await page.addInitScript(()=>localStorage.setItem('cozy.graphics','low'));
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!=='https://cozy.test')return route.abort();
  const relative=u.pathname.slice('/cozy/'.length)||'index.html',file=path.resolve(root,relative);if(!file.startsWith(path.resolve(root)+path.sep))return route.abort();
  let body=await readFile(file);
  if(relative==='src/main.js')body=body.toString()+"\nwindow.__renderAudit={renderer,scene,group,waterMat,ocean,sky,THREE,get town(){return town;},get street(){return street;}};";
  await route.fulfill({body,contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]});
 });
 const started=Date.now();await page.goto('https://cozy.test/cozy/?net=local');
 await page.waitForFunction(()=>window.__cozy?.ready&&window.__cozy.street.session?.ready,null,{timeout:120000});report.readyMs=Date.now()-started;
 report.setup=await page.evaluate(()=>{
  const a=window.__renderAudit,{renderer,scene,town,street,THREE}=a,gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
  a.land=[];a.water=[];scene.traverse(m=>{if(m.material===town.terrainMaterial)a.land.push(m);if(m.material===a.waterMat)a.water.push(m);});
  a.original=town.terrainMaterial;a.flat=new THREE.MeshLambertMaterial({vertexColors:true});
  a.noGrain=new THREE.MeshLambertMaterial({vertexColors:true});a.noRoads=new THREE.MeshLambertMaterial({vertexColors:true});
  a.noGrain.onBeforeCompile=s=>{a.original.onBeforeCompile(s);s.fragmentShader=s.fragmentShader.replace('float smoothGrain(vec2 p){','float smoothGrain(vec2 p){return .5;');};a.noGrain.customProgramCacheKey=()=> 'audit-no-grain';
  a.noRoads.onBeforeCompile=s=>{a.original.onBeforeCompile(s);s.fragmentShader=s.fragmentShader.replace('ivec2 cell=ivec2(floor((p+islandHalf)/16.));','return ground;\nivec2 cell=ivec2(floor((p+islandHalf)/16.));');};a.noRoads.customProgramCacheKey=()=> 'audit-no-roads';
  a.scenery=street.clearExteriors.interiors.parent;a.staticRoots=[scene,a.group,town.group,a.scenery,street.art.g];a.rootFlags=a.staticRoots.map(n=>n.matrixAutoUpdate);a.pose=town.posePeople.bind(town);a.metrics={cpu:[],gpu:[],calls:[],triangles:[]};a.pending=[];
  a.sceneryMeshes=[];a.scenery.traverse(m=>{if(m.isMesh)a.sceneryMeshes.push({m,material:m.material,foliage:m.material.onBeforeCompile.toString().includes('leafUV'),visible:m.visible});});a.unlit=[new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial({vertexColors:true})];
  const render=renderer.render.bind(renderer);renderer.render=(s,c)=>{
   while(a.pending.length&&gl.getQueryParameter(a.pending[0].q,gl.QUERY_RESULT_AVAILABLE)){
    const p=a.pending.shift();if(!gl.getParameter(ext.GPU_DISJOINT_EXT)&&p.key===a.key)a.metrics.gpu.push(gl.getQueryParameter(p.q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(p.q);
   }
   const q=ext?gl.createQuery():null;if(q)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);
   const start=performance.now();render(s,c);a.metrics.cpu.push(performance.now()-start);a.metrics.calls.push(renderer.info.render.calls);a.metrics.triangles.push(renderer.info.render.triangles);
   if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);a.pending.push({q,key:a.key});}
  };
  return {gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unknown',gpuTimers:!!ext,landMeshes:a.land.length,waterMeshes:a.water.length,geometryCount:renderer.info.memory.geometries,textureCount:renderer.info.memory.textures,
   roots:scene.children.map(g=>{let meshes=0,instances=0;g.traverse(m=>{if(m.isMesh){meshes++;if(m.isInstancedMesh)instances+=m.count;}});return {type:g.type,meshes,instances};})};
 });
 for(const distance of process.argv.includes('--wide-only')?[180]:[24,180]){
  await page.evaluate(async d=>{const c=window.__cozy;if(d>100)c.setView('centre');const t=c.controls.target;await c.setCamera([t.x+d*.47,t.y+d*.68,t.z+d*.56],[t.x,t.y,t.z]);await c.flushChunks();const a=window.__renderAudit;a.land=[];a.water=[];a.scene.traverse(m=>{if(m.material===a.original)a.land.push(m);if(m.material===a.waterMat)a.water.push(m);});},distance);
  for(const variant of process.argv.includes('--full-only')?['full']:process.argv.includes('--matrix-only')?['full','static-roots','full-restored']:process.argv.includes('--geometry-only')?['full','no-foliage','unlit-scenery','full-restored']:['full','flat-terrain','no-grain','no-roads','no-terrain','no-water','no-scenery','no-crowd']){
   await page.evaluate(v=>{
    const a=window.__renderAudit;a.key=v;a.staticRoots.forEach((n,i)=>n.matrixAutoUpdate=v==='static-roots'?false:a.rootFlags[i]);
    for(const s of a.sceneryMeshes){s.m.visible=s.visible&&!(v==='no-foliage'&&s.foliage);s.m.material=v==='unlit-scenery'?a.unlit[Number(s.material.vertexColors)]:s.material;}
    for(const m of a.land){m.visible=v!=='no-terrain';m.material=v==='flat-terrain'?a.flat:v==='no-grain'?a.noGrain:v==='no-roads'?a.noRoads:a.original;}
    for(const m of a.water)m.visible=v!=='no-water';a.scenery.visible=v!=='no-scenery';
    a.town.posePeople=v==='no-crowd'?()=>{for(const b of a.town.crowd.batches.values())b.mesh.visible=false;}:a.pose;
   },variant);
   await page.evaluate(async()=>{for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);});
   if(!software&&distance===180&&variant==='full'){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
   const sample=await page.evaluate(async count=>{
    const a=window.__renderAudit;a.metrics={cpu:[],gpu:[],calls:[],triangles:[]};const frames=[];let last=performance.now();
    for(let i=0;i<count;i++){await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-last);last=now;}
    const summary=values=>{values.sort((a,b)=>a-b);const p=n=>values[Math.floor((values.length-1)*n)];return {samples:values.length,p50:p(.5),p95:p(.95),max:values.at(-1)};};
    return {frameMs:summary(frames),renderCpuMs:summary(a.metrics.cpu),renderGpuMs:summary(a.metrics.gpu),calls:Math.max(...a.metrics.calls),triangles:Math.max(...a.metrics.triangles),residentCount:a.town.people.length,visibleResidents:a.town.crowd.visible,heapBytes:performance.memory?.usedJSHeapSize};
   },software?35:180);
   if(!software&&distance===180&&variant==='full'){const {profile}=await cdp.send('Profiler.stop');await writeFile(out+'/render-'+label+'.cpuprofile',JSON.stringify(profile));}
   const row={distance,variant,...sample};report.results.push(row);console.log(JSON.stringify(row));
  }
 }
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{await browser.close();report.passed=!report.error&&!report.errors.length;if(!report.passed)process.exitCode=1;await writeFile(out+'/renderer-audit-'+label+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({setup:report.setup,error:report.error,errors:report.errors}));}
