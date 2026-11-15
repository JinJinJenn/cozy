// Deterministic helpers: string-seeded rng, gradient noise, fBm, ridged fBm.
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};

export function hashSeed(str){
  let h=2166136261;
  for(const c of String(str)) h=Math.imul(h^c.charCodeAt(0),16777619);
  return h>>>0;
}
export function rng(seed){
  let h=hashSeed(seed);
  return ()=>{
    h=(h+0x6d2b79f5)|0;
    let t=Math.imul(h^(h>>>15),1|h);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

// 2D gradient noise in about [-1,1].
export function makeNoise(seed){
  const base=hashSeed(seed);
  const gx=new Float32Array(256),gz=new Float32Array(256),perm=new Uint8Array(512);
  const r=rng('noise:'+base);
  const p=Array.from({length:256},(_,i)=>i);
  for(let i=255;i>0;i--){const j=Math.floor(r()*(i+1));[p[i],p[j]]=[p[j],p[i]];}
  for(let i=0;i<512;i++)perm[i]=p[i&255];
  for(let i=0;i<256;i++){const a=r()*Math.PI*2;gx[i]=Math.cos(a);gz[i]=Math.sin(a);}
  const fade=t=>t*t*t*(t*(t*6-15)+10);
  const noise=(x,z)=>{
    const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,X=ix&255,Z=iz&255;
    const a=perm[perm[X]+Z],b=perm[perm[X+1]+Z],c=perm[perm[X]+Z+1],d=perm[perm[X+1]+Z+1];
    const u=fade(fx),v=fade(fz);
    const n00=gx[a]*fx+gz[a]*fz,n10=gx[b]*(fx-1)+gz[b]*fz,n01=gx[c]*fx+gz[c]*(fz-1),n11=gx[d]*(fx-1)+gz[d]*(fz-1);
    return (n00+(n10-n00)*u+(n01-n00)*v+(n00-n10-n01+n11)*u*v)*1.41;
  };
  const fbm=(x,z,oct=4,lac=2,gain=.5)=>{
    let amp=1,f=1,s=0,n=0;
    for(let i=0;i<oct;i++){s+=noise(x*f+i*17.3,z*f-i*9.1)*amp;n+=amp;amp*=gain;f*=lac;}
    return s/n;
  };
  // ridged: sharp crests, in [0,1]
  const ridged=(x,z,oct=5,lac=2.05,gain=.5)=>{
    let amp=1,f=1,s=0,n=0,w=1;
    for(let i=0;i<oct;i++){
      let v=1-Math.abs(noise(x*f+i*31.7,z*f+i*13.3));v*=v;v*=w;w=clamp(v*1.6,0,1);
      s+=v*amp;n+=amp;amp*=gain;f*=lac;
    }
    return s/n;
  };
  return {noise,fbm,ridged};
}
