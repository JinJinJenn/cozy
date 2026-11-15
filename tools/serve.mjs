// Tiny static server. Binds to localhost only; does NOT open a browser.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||4180);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
export const server=http.createServer(async(req,res)=>{
  try{
    let p=decodeURIComponent(new URL(req.url,'http://x').pathname);
    if(p.endsWith('/'))p+='index.html';
    const file=path.join(root,p);
    if(!file.startsWith(root)||/node_modules|\.git[\/]/.test(file)){res.writeHead(403).end('no');return;}
    if(!(await stat(file)).isFile()){res.writeHead(404).end('nf');return;}
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
    res.end(await readFile(file));
  }catch{res.writeHead(404).end('nf');}
});
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  server.listen(port,'127.0.0.1',()=>console.log(`Cozy at http://127.0.0.1:${port}/  (open it yourself; nothing auto-launches)`));
}
