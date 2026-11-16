// Headless captures (no visible window, no focus steal). Usage:
//   node tools/shots.mjs [outDir] [seed]
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {server} from './serve.mjs';
const require=createRequire(process.env.PLAYWRIGHT_FROM||'C:/trontstack/craftmine/package.json');
const {chromium}=require('playwright');
const date=new Date().toISOString().slice(0,10);
const out=process.argv[2]||path.resolve('docs/shots',date);
const seed=process.argv[3]||'petalwood';
const only=process.env.ONLY?process.env.ONLY.split(','):null;
await mkdir(out,{recursive:true});
await new Promise(r=>server.listen(4181,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE||'C:/Users/trent/AppData/Local/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--mute-audio']});
const page=await browser.newPage({viewport:{width:1600,height:900}});
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
const presets=['meadowCove','pineHighlands','sandbarArchipelago','harborTown'];
for(const id of presets){
  if(only&&!only.includes(id)) continue;
  await page.goto(`http://127.0.0.1:4181/index.html?shot=1&preset=${id}&seed=${seed}`);
  await page.waitForFunction(()=>window.__cozy&&window.__cozy.ready,null,{timeout:120000});
  for(const view of ['oblique','top','shore']){
    await page.evaluate(async v=>{window.__cozy.setView(v);await window.__cozy.flushChunks();window.__cozy.render(3.2);},view);
    await page.evaluate(()=>window.__cozy.render(3.2));
    const file=path.join(out,`${id}-${view}.png`);
    await page.screenshot({path:file});
    console.log(file,JSON.stringify(await page.evaluate(()=>window.__cozy.info())));
  }
}
await browser.close();server.close();
