// Assemble an edited cut: title card + clip pairs, 1080p60, no audio (music-free).
//   node tools/edit.mjs <outName> "<card title>|<clip path>|<subtitle>" ...
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const [out,...segs]=process.argv.slice(2);
const date=new Date().toISOString().slice(0,10);
const outFile=path.resolve('docs/video',date,out.endsWith('.mp4')?out:out+'.mp4');
const font='tools/titlefont.ttf';
const clean=s=>s.replace(/[:',\%]/g,'');
const inputs=[],filters=[],labels=[];
segs.forEach((s,i)=>{
  const [title,clip,sub='']=s.split('|');
  inputs.push('-f','lavfi','-t','2','-i','color=c=0xfff0f5:s=1920x1080:r=60');
  inputs.push('-i',path.resolve(clip));
  const c=i*2,v=i*2+1;
  filters.push(`[${c}:v]drawtext=fontfile='${font}':text='${clean(title)}':fontcolor=0x4a3b4f:fontsize=84:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=fontfile='${font}':text='${clean(sub)}':fontcolor=0xe98fb0:fontsize=36:x=(w-text_w)/2:y=(h/2)+60,fade=t=in:st=0:d=0.4,fade=t=out:st=1.6:d=0.4,setsar=1,format=yuv420p[c${i}]`);
  filters.push(`[${v}:v]scale=1920:1080,fps=60,setsar=1,format=yuv420p,fade=t=in:st=0:d=0.4[v${i}]`);
  labels.push(`[c${i}][v${i}]`);
});
filters.push(`${labels.join('')}concat=n=${labels.length*2}:v=1:a=0[out]`);
const r=spawnSync('ffmpeg',['-y',...inputs,'-filter_complex',filters.join(';'),'-map','[out]','-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-preset','medium',outFile],{stdio:'inherit'});
console.log('wrote',outFile,r.status);
