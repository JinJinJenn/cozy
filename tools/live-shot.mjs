// Headless screenshot of the live Pages URL. No window.
import {createRequire} from 'node:module';
const require=createRequire(process.env.PLAYWRIGHT_FROM||'C:/trontstack/craftmine/package.json');
const {chromium}=require('playwright');
const url=process.argv[2]||'https://jinjinjenn.github.io/cozy/';
const out=process.argv[3]||'docs/shots/live-pages.png';
const exe=process.env.CHROME_EXE||(process.env.LOCALAPPDATA||'').split(String.fromCharCode(92)).join('/')+'/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-win64/chrome-headless-shell.exe';
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--mute-audio']});
const page=await browser.newPage({viewport:{width:1600,height:900}});
const errs=[];page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});page.on('pageerror',e=>errs.push(String(e)));
await page.goto(url+(url.includes('?')?'&':'?')+'shot=1&preset=harborTown');
await page.waitForFunction(()=>window.__cozy&&window.__cozy.ready,null,{timeout:120000});
await page.evaluate(async()=>{await window.__cozy.flushChunks();window.__cozy.render(3.2);});
await page.screenshot({path:out});
console.log(out,'errors:',JSON.stringify(errs.slice(0,5)));
await browser.close();
