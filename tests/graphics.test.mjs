import test from 'node:test';
import assert from 'node:assert/strict';
import {graphicsSettings} from '../src/graphics.js';

test('auto scales on sustained slow frames and manual Low persists its pixel budget',()=>{
  const select={},output={},panel={querySelector:s=>s==='select'?select:output},saved=new Map();
  const original=Object.fromEntries(['document','localStorage','innerWidth','innerHeight','devicePixelRatio'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  Object.assign(globalThis,{document:{visibilityState:'visible',createElement:()=>panel,body:{appendChild(){}}},
    localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},innerWidth:3840,innerHeight:2160,devicePixelRatio:2});
  try{
    const canvas={},renderer={shadowMap:{},setPixelRatio(r){this.ratio=r;},setSize(w,h){canvas.width=Math.floor(w*this.ratio);canvas.height=Math.floor(h*this.ratio);}};
    const graphics=graphicsSettings(renderer,canvas),initial=graphics.info().ratio;
    // Frames slower than 250 ms still need adaptation, rather than being
    // discarded as if the application were healthy or merely backgrounded.
    for(let t=300;t<50000;t+=300)graphics.frame(t);
    assert.ok(graphics.info().ratio<initial*.60);assert.equal(graphics.info().shadows,false);
    select.value='high';select.onchange();assert.equal(graphics.info().shadows,true);
    assert.ok(canvas.width*canvas.height<=4200000);
    select.value='low';select.onchange();assert.equal(saved.get('cozy.graphics'),'low');
    assert.equal(graphics.info().shadows,false);assert.ok(canvas.width*canvas.height<=1000000);
  }finally{for(const [key,descriptor] of Object.entries(original)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
