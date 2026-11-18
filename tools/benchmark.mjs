// Comparable fixed cameras and frame intervals. Software WebGL is a stress test,
// not a substitute for measuring a real integrated GPU.
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const {chromium}=createRequire(process.env.PLAYWRIGHT_FROM||import.meta.url)('playwright');
const out=process.env.COZY_BENCH_REPORT||path.join(root,'test-results/benchmark.json');
const baseline=process.argv.find(s=>s.startsWith('--baseline='))?.split('=')[1];
if(baseline&&!/^[a-f0-9]{7,40}$/.test(baseline))throw Error('Expected a commit hash');
const software=process.argv.includes('--software'),cache=new Map(),results=[];
const orbit=process.argv.includes('--orbit'),cpu=process.argv.includes('--cpu4')?4:1;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE||undefined,
  args:['--mute-audio','--enable-unsafe-swiftshader',...(software?['--use-angle=swiftshader']:[])]});
try{
  for(const mode of [...baseline?['baseline']:[],'balanced','low']){
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    if(cpu>1){const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});}
    await page.addInitScript(()=>{window.benchLong=[];new PerformanceObserver(l=>window.benchLong.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});});
    await page.addInitScript(mode=>localStorage.setItem('cozy.graphics',mode),mode);
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());if(u.origin!=='https://cozy.test')return route.abort();
      const relative=u.pathname.slice('/cozy/'.length)||'index.html',file=path.resolve(root,relative);
      if(!file.startsWith(root+path.sep))return route.abort();
      let body;
      if(mode==='baseline'){
        if(!cache.has(relative))cache.set(relative,execFileSync('git',['show',baseline+':'+relative],{cwd:root,maxBuffer:16000000}));
        body=cache.get(relative);
      }else body=await readFile(file);
      await route.fulfill({body,contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]});
    });
    await page.goto('https://cozy.test/cozy/?net=local&view=street');
    await page.waitForFunction(()=>window.__cozy?.ready&&window.__cozy.street?.session?.ready,null,{timeout:120000});
    const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown';});
    for(const distance of [24,180]){
      await page.evaluate(async d=>{const c=window.__cozy;c.controls.maxDistance=420;const t=c.controls.target;
        if(d>100)c.setView('centre');
        await c.setCamera([t.x+d*.47,t.y+d*.68,t.z+d*.56],[t.x,t.y,t.z]);await c.flushChunks();},distance);
      const sample=await page.evaluate(async ({count,orbit,distance})=>{
        for(let i=0;i<30;i++)await new Promise(requestAnimationFrame);
        window.benchLong=[];
        let peakCalls=0,peakTriangles=0,maxVisibleResidents=0;
        const intervals=[];let last=performance.now();
        for(let i=0;i<count;i++){
          await new Promise(requestAnimationFrame);const now=performance.now();intervals.push(now-last);last=now;
          const info=window.__cozy.info();peakCalls=Math.max(peakCalls,info.calls);peakTriangles=Math.max(peakTriangles,info.tris);maxVisibleResidents=Math.max(maxVisibleResidents,info.simulation?.visible||0);
          if(orbit){const c=window.__cozy,t=c.controls.target,a=i*.012;c.camera.position.set(t.x+Math.sin(a)*distance*.8,t.y+distance*.6,t.z+Math.cos(a)*distance*.8);c.controls.update();}
        }
        intervals.sort((a,b)=>a-b);
        const pct=(a,p)=>a[Math.floor((a.length-1)*p)];
        return {frames:count,peakCalls,peakTriangles,maxVisibleResidents,frameMs:{p50:pct(intervals,.5),p95:pct(intervals,.95),p99:pct(intervals,.99),max:intervals.at(-1)},longTasks:window.benchLong,info:window.__cozy.info()};
      },{count:software?60:360,orbit,distance});
      sample.residents=sample.info.residents.length;
      delete sample.info.residents;
      const record={mode,distance,gpu,...sample,errors};results.push(record);console.log(JSON.stringify(record));
    }
    await page.close();
  }
}finally{await browser.close();await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify({time:new Date().toISOString(),baseline,software,orbit,mainThreadCpuThrottle:cpu,viewport:[1920,1080],results},null,2));}
if(results.some(r=>r.errors.length))process.exitCode=1;
