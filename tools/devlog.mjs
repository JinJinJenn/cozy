// Builds docs/DEVLOG.html and docs/blog/*.html (self-contained, stills inlined as base64).
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//,'')),'..');
const docs=path.join(root,'docs');
const data=JSON.parse(await readFile(path.join(docs,'devlog.json'),'utf8'));
const b64=async f=>'data:image/png;base64,'+(await readFile(path.join(docs,f))).toString('base64');
const css=`:root{--ink:#4a3b4f;--bg:#fff4f8;--card:#fff;--accent:#e98fb0;--mint:#8fd9c0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Georgia,'Segoe UI',serif}
@media(prefers-color-scheme:dark){:root{--ink:#f4e4ee;--bg:#2a2230;--card:#352b3c}}
main{max-width:860px;margin:0 auto;padding:28px 18px 80px}h1{font-size:34px;margin:.2em 0}h2{margin:1.6em 0 .2em;font-size:22px}
.date{color:var(--accent);font:600 13px system-ui;letter-spacing:.08em;text-transform:uppercase}
article{background:var(--card);border-radius:16px;padding:20px 22px;margin:22px 0;box-shadow:0 4px 18px rgba(120,60,90,.12)}
figure{margin:14px 0}img,video{width:100%;border-radius:12px;display:block}figcaption{font-size:13px;opacity:.75;margin-top:4px}
ul{padding-left:20px}.bad li{color:inherit}code{background:rgba(233,143,176,.18);padding:1px 5px;border-radius:5px}
nav a{margin-right:12px}a{color:var(--accent)}`;
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
async function entryHtml(e,blog){
  let h=`<article><div class="date">${e.date} &middot; ${esc(e.milestone)}</div><h2>${esc(blog&&e.blogTitle?e.blogTitle:e.title)}</h2>`;
  for(const p of (blog&&e.blog?e.blog:e.text)) h+=`<p>${esc(p)}</p>`;
  for(const f of e.stills||[]) h+=`<figure><img alt="${esc(f.caption)}" src="${await b64(f.file)}"><figcaption>${esc(f.caption)}</figcaption></figure>`;
  for(const v of e.videos||[]) h+=`<figure><video controls preload="none" src="${blog?'../':''}${v.file}"></video><figcaption>${esc(v.caption)} (local file: docs/${v.file})</figcaption></figure>`;
  if(e.bad?.length) h+=`<h3>What still looks bad</h3><ul class="bad">${e.bad.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`;
  if(e.next?.length) h+=`<h3>Next</h3><ul>${e.next.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`;
  return h+'</article>';
}
const page=(title,body)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body><main>${body}</main></body></html>`;
const entries=[...data.entries].sort((a,b)=>b.date.localeCompare(a.date)||b.n-a.n);
let body=`<h1>Cozy devlog</h1><p>${esc(data.intro)}</p>`;
for(const e of entries) body+=await entryHtml(e,false);
await writeFile(path.join(docs,'DEVLOG.html'),page('Cozy devlog',body));
await mkdir(path.join(docs,'blog'),{recursive:true});
for(const e of entries.filter(e=>e.blog)){
  const slug=`${e.date}-${e.slug}.html`;
  await writeFile(path.join(docs,'blog',slug),page(e.blogTitle||e.title,`<nav><a href="../DEVLOG.html">Devlog</a></nav><h1>${esc(e.blogTitle||e.title)}</h1>`+await entryHtml(e,true)));
  console.log('blog',slug);
}
console.log('devlog written');
