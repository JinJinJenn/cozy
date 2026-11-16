// Plain 2D geometry helpers. Points are [x,z].
export function polyArea(p){let a=0;for(let i=0,n=p.length;i<n;i++){const q=p[(i+1)%n];a+=p[i][0]*q[1]-q[0]*p[i][1];}return a/2;}
export function polyCentroid(p){let x=0,z=0,a=0;for(let i=0,n=p.length;i<n;i++){const q=p[(i+1)%n],c=p[i][0]*q[1]-q[0]*p[i][1];a+=c;x+=(p[i][0]+q[0])*c;z+=(p[i][1]+q[1])*c;}
  if(Math.abs(a)<1e-9){let sx=0,sz=0;for(const v of p){sx+=v[0];sz+=v[1];}return [sx/p.length,sz/p.length];}return [x/(3*a),z/(3*a)];}
export function pointInPoly(x,z,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
export function distSeg(px,pz,ax,az,bx,bz){const dx=bx-ax,dz=bz-az,l=dx*dx+dz*dz;let t=l>0?((px-ax)*dx+(pz-az)*dz)/l:0;t=t<0?0:t>1?1:t;const x=ax+dx*t,z=az+dz*t;return {d:Math.hypot(px-x,pz-z),t,x,z};}
// keep side n.p <= c
export function clipHalf(poly,nx,nz,c){const out=[];for(let i=0,n=poly.length;i<n;i++){const a=poly[i],b=poly[(i+1)%n],da=nx*a[0]+nz*a[1]-c,db=nx*b[0]+nz*b[1]-c;
  if(da<=0)out.push(a);if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}return out;}
export function chaikin(pts,iters){let p=pts;for(let k=0;k<iters;k++){if(p.length<3)break;const o=[p[0]];for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1];o.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}o.push(p[p.length-1]);p=o;}return p;}
export function dpOpen(pts,tol){if(pts.length<3)return pts.slice();const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const st=[[0,pts.length-1]];
  while(st.length){const [s,e]=st.pop();let md=-1,mi=-1;for(let i=s+1;i<e;i++){const d=distSeg(pts[i][0],pts[i][1],pts[s][0],pts[s][1],pts[e][0],pts[e][1]).d;if(d>md){md=d;mi=i;}}if(md>tol){keep[mi]=1;st.push([s,mi],[mi,e]);}}
  return pts.filter((_,i)=>keep[i]);}
export function dpClosed(pts,tol){if(pts.length<4)return pts.slice();let far=0,fd=-1;for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i][0]-pts[0][0],pts[i][1]-pts[0][1]);if(d>fd){fd=d;far=i;}}
  const a=dpOpen(pts.slice(0,far+1),tol),b=dpOpen(pts.slice(far).concat([pts[0]]),tol);return a.slice(0,-1).concat(b.slice(0,-1));}
export const r1=v=>Math.round(v*10)/10+0, r2=v=>Math.round(v*100)/100+0, r3=v=>Math.round(v*1000)/1000+0;
