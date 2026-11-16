// Main-thread proxy for the generator worker. Exposes the light queries the viewer needs
// (sample/slope/waterAt/shoreAt over the transferred field) and async chunk/minimap requests.
// Built chunk data is kept in an LRU cache so revisiting an area costs nothing.
const SEA_LEVEL=0;
export class IslandClient{
  constructor(){
    this.worker=new Worker(new URL('./gen-worker.js',import.meta.url),{type:'module'});
    this.pending=new Map();this.nextId=1;this.cache=new Map();this.cacheMax=1800;this.gen=0;
    this.worker.onmessage=e=>{const m=e.data,p=this.pending.get(m.id);if(!p) return;this.pending.delete(m.id);m.type==='error'?p.reject(new Error(m.message)):p.resolve(m);};
    this.worker.onerror=e=>{for(const p of this.pending.values())p.reject(new Error(e.message));this.pending.clear();};
  }
  _req(msg,transfer){return new Promise((resolve,reject)=>{const id=this.nextId++;this.pending.set(id,{resolve,reject});this.worker.postMessage({...msg,id},transfer||[]);});}
  async load(seed,preset,opts){
    this.gen++;this.cache.clear();
    const m=await this._req({type:'load',seed,preset,opts});
    const meta=m.meta,N=meta.grid,half=meta.half,cell=meta.cell,h=m.h,w=m.water;
    Object.assign(this,meta);this.ms=m.ms;this.h=h;this.water=w;
    const bil=(a,x,z)=>{const fi=Math.min(N-1.0001,Math.max(0,(x+half)/cell)),fj=Math.min(N-1.0001,Math.max(0,(z+half)/cell));const i=Math.floor(fi),j=Math.floor(fj),tx=fi-i,tz=fj-j,k=j*N+i;return (a[k]*(1-tx)+a[k+1]*tx)*(1-tz)+(a[k+N]*(1-tx)+a[k+N+1]*tx)*tz;};
    this.sample=(x,z)=>bil(h,x,z);
    this.waterAt=(x,z)=>Math.max(0,bil(w,x,z));
    this.slope=(x,z,e=cell)=>Math.hypot((this.sample(x+e,z)-this.sample(x-e,z))/(2*e),(this.sample(x,z+e)-this.sample(x,z-e))/(2*e));
    this.shoreAt=a=>{for(let d=0;d<half;d+=cell*.5){const x=Math.cos(a)*d,z=Math.sin(a)*d;if(this.sample(x,z)<SEA_LEVEL) return {x,z,d};}return {x:0,z:0,d:0};};
    return this;
  }
  async chunk(cx,cz,res,wres){
    const key=`${this.gen}|${cx},${cz},${res}`,hit=this.cache.get(key);
    if(hit){this.cache.delete(key);this.cache.set(key,hit);return hit;}
    const gen=this.gen,m=await this._req({type:'chunk',cx,cz,res,wres});
    if(gen!==this.gen) return null;
    const out={terrain:m.terrain,water:m.water};
    this.cache.set(key,out);
    if(this.cache.size>this.cacheMax) this.cache.delete(this.cache.keys().next().value);
    return out;
  }
  async minimap(w,h){return (await this._req({type:'minimap',w,h})).px;}
}
