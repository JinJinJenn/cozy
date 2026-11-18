// Replay the production worker from the same startup message and compare every
// resident on every tick. Browser rendering and signing are outside the timer.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url)),baseline=process.argv[2];
if(!/^[a-f0-9]{7,40}$/.test(baseline||''))throw Error('Supply a baseline Git commit.');
const origin='https://cozy.test/cozy/',cache=new Map();
const {chromium}=createRequire(process.env.PLAYWRIGHT_FROM||import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE||undefined});
const results=[];
try{
  for(const revision of [baseline,'working','working',baseline]){
    const ctx=await browser.newContext({viewport:{width:800,height:600}});
    try{
      await ctx.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(!url.href.startsWith(origin))return route.abort();
        const file=url.pathname.slice('/cozy/'.length)||'index.html',key=revision+'/'+file;
        if(!cache.has(key))cache.set(key,revision==='working'?await readFile(path.join(root,file)):
          execFileSync('git',['show',revision+':'+file],{cwd:root,maxBuffer:16000000}));
        await route.fulfill({body:cache.get(key),contentType:{'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'}[path.extname(file)]});
      });
      await ctx.addInitScript(()=>{
        const post=Worker.prototype.postMessage;
        Worker.prototype.postMessage=function(message,...args){
          if(message?.type==='init'&&message.island?.streetBenches)window.workerFixture=message;
          return post.call(this,message,...args);
        };
      });
      const page=await ctx.newPage();await page.goto(origin+'?net=local');
      await page.waitForFunction(()=>window.__cozy?.ready&&window.workerFixture,null,{timeout:90000});
      const result=await page.evaluate(async()=>{
        const town=window.__cozy.street.town;
        town.worker.terminate();town.advance=()=>{};
        const worker=new Worker('./src/resident-worker.js',{type:'module'});
        function message(data){return new Promise((resolve,reject)=>{
          worker.onerror=e=>reject(Error(e.message));
          worker.onmessage=e=>e.data.type==='error'?reject(Error(e.data.message)):resolve(e.data);
          worker.postMessage(data);
        });}
        try{
          await message(window.workerFixture);
          const times=[],hashes=[];
          const layout=window.__cozy.street.session.layout,encoder=new TextEncoder();
          let count=0;
          for(let i=0;i<160;i++){
            const frame=await message({type:'step',steps:1,layout,actors:[],routes:[]});
            count=frame.positions.length;times.push(frame.times[0]);
            hashes.push(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(frame.positions)))));
          }
          const checksum=new Uint8Array(hashes.length*32);hashes.forEach((h,i)=>checksum.set(h,32*i));
          const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',checksum)),n=>n.toString(16).padStart(2,'0')).join('');
          times.sort((a,b)=>a-b);
          return {count,ticks:times.length,digest,totalMs:Math.round(times.reduce((a,b)=>a+b,0)),p50:times[80],p95:times[152],max:times.at(-1)};
        }finally{worker.terminate();}
      });
      console.log(JSON.stringify({revision,...result}));results.push(result);
      assert.equal(result.count,457);assert.equal(result.digest,results[0].digest,'Resident snapshots diverged');
    }finally{await ctx.close();}
  }
}finally{await browser.close();}
