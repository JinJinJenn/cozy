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
const television=process.argv.includes('--television');
const entryLight=process.argv.includes('--entry-light');
const wideStreet=process.argv.includes('--wide-street');
if(entryLight&&(television||wideStreet||orbit||baseline))throw Error('The entry light comparison uses a fixed camera in the current build.');
if(wideStreet&&(television||baseline))throw Error('The island-scale street camera requires the current street view.');
if(television&&(orbit||baseline))throw Error('The television comparison uses a fixed camera on the current build.');
const trackCompletion=process.argv.includes('--gpu-completion');
const adapter=process.env.COZY_ADAPTER_LUID,expectedGpu=process.env.COZY_EXPECT_GPU;
if(adapter&&(software||!/^-?\d+,\d+$/.test(adapter)))throw Error('Use a decimal high,low Windows adapter LUID in hardware mode');
const viewport=process.argv.includes('--720p')?{width:1280,height:720}:{width:1920,height:1080};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE||undefined,
  args:['--mute-audio','--enable-unsafe-swiftshader',...(software?['--use-angle=swiftshader']:[]),
    ...(adapter?['--use-angle=d3d11','--use-adapter-luid='+adapter]:[])]});
try{
  for(const mode of [...baseline?['baseline']:[],'balanced','low']){
    const page=await browser.newPage({viewport,deviceScaleFactor:1});
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
    if(expectedGpu&&!gpu.toLowerCase().includes(expectedGpu.toLowerCase()))throw Error('Unexpected WebGL adapter: '+gpu);
    if(television){
      await page.evaluate(async()=>{
        const c=window.__cozy,s=c.street.session,b=c.island.homes.find(b=>b.name==='Home 5');
        const {homeWorld}=await import('./src/home-plan.js'),{televisionIn}=await import('./src/home-fixtures.js');
        Object.assign(s.actors.get(s.id),b.inside);
        s.command({type:'furniture',lot:b.id,index:b.uses.findIndex(u=>u.action==='watch')});
        const tv=televisionIn(b),eye=homeWorld(b,-2.5*tv.side,tv.z+7.6);
        const target=c.street.cameraFocus=homeWorld(b,.15,tv.z-.1);
        await c.setCamera([eye.x,b.y+4.3,eye.z],[target.x,b.y+1.48,target.z]);await c.flushChunks();
      });
      await page.waitForFunction(()=>{const s=window.__cozy.street.session;return s.actors.get(s.id).activity==='watch';});
    }
    if(entryLight)await page.evaluate(async()=>{
      const c=window.__cozy,s=c.street.session,b=c.island.homes.find(h=>h.name==='Home 5');
      const {homeWorld}=await import('./src/home-plan.js');
      Object.assign(s.actors.get(s.id),b.inside);
      const eye=homeWorld(b,2.55,b.d/2-5),aim=c.street.cameraFocus=homeWorld(b,-.45,b.d/2-.75);
      await c.setCamera([eye.x,b.y+2.8,eye.z],[aim.x,b.y+1.48,aim.z]);await c.flushChunks();
    });
    const scenes=entryLight?[{lit:false},{lit:true},{lit:false}]:television?[0,1,2,3,0].map(channel=>({channel})):(wideStreet?[1800]:[24,180]).map(distance=>({distance}));
    for(const scene of scenes){
      const {distance,channel}=scene;
      if(entryLight){
        await page.evaluate(async on=>{
          const s=window.__cozy.street.session,b=s.island.homes.find(h=>h.name==='Home 5');
          if(!!s.layout.entryLights?.[b.id]!==on)(await import('./src/home-fixtures.js')).switchEntryLights(s,b);
        },scene.lit);
        await page.waitForFunction(on=>{
          const app=window.__cozy.street.clearExteriors.interiors.appliances;
          return app?.home.name==='Home 5'&&[app.entry,...app.lamps].every(l=>Math.abs(l.level-Number(on))<.01);
        },scene.lit);
      }else if(television){
        await page.locator('#tv-channel').selectOption(String(channel));
        await page.waitForFunction(n=>window.__cozy.street.clearExteriors.interiors.appliances?.tv.channel===n,channel);
      }else await page.evaluate(async ({distance:d,wideStreet})=>{const c=window.__cozy,t=c.controls.target;
        if(d>100&&!wideStreet)c.setView('centre');
        await c.setCamera([t.x+d*.47,t.y+d*.68,t.z+d*.56],[t.x,t.y,t.z]);await c.flushChunks();
        if(wideStreet&&(!c.street.active||c.controls.getDistance()<d*.96))throw Error('Street camera did not reach island scale');
      },{distance,wideStreet});
      const sample=await page.evaluate(async ({count,orbit,distance,trackCompletion,wideStreet})=>{
        for(let i=0;i<30;i++)await new Promise(requestAnimationFrame);
        window.benchLong=[];
        let peakCalls=0,peakTriangles=0,maxVisibleResidents=0;
        const intervals=[],pending=[],queueDepths=[];
        const gl=trackCompletion?document.querySelector('#gl').getContext('webgl2'):null;
        function retireFrames(){
          while(pending.length){
            const status=gl.clientWaitSync(pending[0],0,0);
            if(status===gl.TIMEOUT_EXPIRED)break;
            if(status===gl.WAIT_FAILED)throw Error('Could not observe GPU frame completion');
            gl.deleteSync(pending.shift());
          }
        }
        const start=performance.now();let last=start;
        for(let i=0;i<count;i++){
          await new Promise(requestAnimationFrame);const now=performance.now();intervals.push(now-last);last=now;
          const info=window.__cozy.info();peakCalls=Math.max(peakCalls,info.calls);peakTriangles=Math.max(peakTriangles,info.tris);maxVisibleResidents=Math.max(maxVisibleResidents,info.simulation?.visible||0);
          if(gl){
            retireFrames();queueDepths.push(pending.length);
            const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
            if(!fence)throw Error('WebGL frame fence unavailable');
            pending.push(fence);gl.flush();
          }
          if(orbit){const c=window.__cozy,t=c.controls.target,a=i*.012;c.camera.position.set(t.x+Math.sin(a)*distance*.8,t.y+distance*.6,t.z+Math.cos(a)*distance*.8);c.controls.update();
            if(wideStreet&&c.street.cameraFraction()<.99)throw Error('A roof pulled the aerial camera into the street');}
        }
        while(pending.length){
          await new Promise(requestAnimationFrame);retireFrames();
          if(performance.now()-last>10000)throw Error('Last GPU frame did not finish');
        }
        const completedFps=count*1000/(performance.now()-start);
        intervals.sort((a,b)=>a-b);queueDepths.sort((a,b)=>a-b);
        const pct=(a,p)=>a[Math.floor((a.length-1)*p)];
        return {frames:count,peakCalls,peakTriangles,maxVisibleResidents,frameMs:{p50:pct(intervals,.5),p95:pct(intervals,.95),p99:pct(intervals,.99),max:intervals.at(-1)},
          ...(gl?{gpuCompletion:{framesPerSecond:completedFps,previousFramesInFlightP95:pct(queueDepths,.95)}}:{}),
          longTasks:window.benchLong,info:window.__cozy.info()};
      },{count:software?60:360,orbit,distance,trackCompletion,wideStreet});
      sample.residents=sample.info.residents.length;
      delete sample.info.residents;
      const record={mode,...scene,gpu,...sample,errors};results.push(record);console.log(JSON.stringify(record));
    }
    await page.close();
  }
}finally{await browser.close();await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify({time:new Date().toISOString(),baseline,software,orbit,mainThreadCpuThrottle:cpu,viewport:[viewport.width,viewport.height],results},null,2));}
if(results.some(r=>r.errors.length))process.exitCode=1;
