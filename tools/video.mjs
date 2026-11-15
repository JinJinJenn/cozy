// Headless orbit fly-over -> frames -> mp4 via ffmpeg. No window, no focus steal.
//   node tools/video.mjs <preset> [seconds=8] [fps=30] [seed=petalwood] [WxH=1920x1080]
import {createRequire} from 'node:module';
import {mkdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {server} from './serve.mjs';
const [preset='pineHighlands',secs='8',fps='30',seed='petalwood',size='1920x1080']=process.argv.slice(2);
const [W,H]=size.split('x').map(Number),S=+secs,F=+fps,n=Math.round(S*F);
const require=createRequire('C:/trontstack/craftmine/package.json');
const {chromium}=require('playwright');
const date=new Date().toISOString().slice(0,10);
const outDir=path.resolve('docs/video',date,'raw');await mkdir(outDir,{recursive:true});
const tmp=path.join(os.tmpdir(),'cozy-frames-'+preset);await rm(tmp,{recursive:true,force:true});await mkdir(tmp,{recursive:true});
await new Promise(r=>server.listen(4182,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/trent/AppData/Local/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:W,height:H}});
await page.goto(`http://127.0.0.1:4182/index.html?shot=1&preset=${preset}&seed=${seed}`);
await page.waitForFunction(()=>window.__cozy&&window.__cozy.ready,null,{timeout:180000});
const cam=await page.evaluate(()=>{const c=window.__cozy.island.preset.camera;return c;});
for(let i=0;i<n;i++){
  const t=i/n,az=cam.az+t*Math.PI*0.9,el=cam.elev*(0.75+0.35*Math.sin(t*Math.PI)),dist=cam.dist*(1.05-0.3*Math.sin(t*Math.PI));
  await page.evaluate(([az,el,dist,time])=>{
    const c=window.__cozy;c.setView('oblique',{az,elev:el,dist});c.flushChunks();c.render(time);
  },[az,el,dist,i/F]);
  await page.screenshot({path:path.join(tmp,`f${String(i).padStart(5,'0')}.jpg`),type:'jpeg',quality:92});
  if(i%30===0)console.log('frame',i,'/',n);
}
await browser.close();server.close();
const file=path.join(outDir,`${preset}-orbit-${seed}-${W}x${H}-${F}fps.mp4`);
const r=spawnSync('ffmpeg',['-y','-framerate',String(F),'-i',path.join(tmp,'f%05d.jpg'),'-c:v','libx264','-pix_fmt','yuv420p','-crf','17','-preset','medium',file],{stdio:'inherit'});
console.log('wrote',file,r.status);
await rm(tmp,{recursive:true,force:true});
