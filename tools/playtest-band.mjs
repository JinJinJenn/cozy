import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

async function monitor(page){
  await page.evaluate(()=>{
    const st=window.__cozy.street,{ctx}=st.music;
    window.bandAudio={notes:[],outputPeak:0,pressed:[],input:[]};
    const keys=document.getElementById('piano-keys');
    for(const type of ['pointerdown','touchstart','click','keydown'])keys.addEventListener(type,e=>{
      const key=e.target.closest('button');
      if(key)window.bandAudio.input.push([type,e.pointerType||'',e.detail,key.getAttribute('aria-label')]);
    },true);
    const bass=st.art.g.getObjectByName('bass keys'),melody=st.art.g.getObjectByName('melody keys');
    const create=ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource=()=>{
      const source=create(),start=source.start.bind(source);
      source.start=(...args)=>{window.bandAudio.notes.push(Math.round(57+12*Math.log2(source.playbackRate.value)));return start(...args);};
      return source;
    };
    const sample=()=>{
      for(const [mesh,key] of [[bass,0],[bass,4],[bass,7],[melody,13]]){
        if(mesh.instanceMatrix.array[key*16+13]<(key===13?.88:.83)&&!window.bandAudio.pressed.includes(mesh.name+key))
          window.bandAudio.pressed.push(mesh.name+key);
      }
      requestAnimationFrame(sample);
    };
    sample();
  });
  await page.evaluate(async()=>{
    const {ctx,master}=window.__cozy.street.music;
    const source=`class Peak extends AudioWorkletProcessor {
      process(inputs){const channel=inputs[0]?.[0];if(channel&&!this.detected){
        for(const sample of channel)if(Math.abs(sample)>.0005){this.detected=true;this.port.postMessage(Math.abs(sample));break;}
      }return true;}
    }registerProcessor('stage-output',Peak);`;
    const url=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));
    try{await ctx.audioWorklet.addModule(url);}finally{URL.revokeObjectURL(url);}
    const probe=new AudioWorkletNode(ctx,'stage-output',{numberOfOutputs:0});
    probe.port.onmessage=e=>window.bandAudio.outputPeak=e.data;
    master.connect(probe);window.stageProbe=probe;
  });
}

export async function playBand({host,guest,profile,ready,wait}){
  const travel=async page=>{
    await page.bringToFront();
    await page.locator('#directions-open').click();await page.locator('#join-band').click();
  };
  const part=page=>page.evaluate(()=>{const s=window.__cozy.street.session;return s.actors.get(s.id).part;});
  for(const page of [host,guest]){
    await travel(page);await page.locator('#piano-mode').waitFor();
    await page.locator('#piano-mode').click();await page.locator('#piano-keys').waitFor();
  }
  assert.equal(await part(host),'melody');assert.equal(await part(guest),'bass');
  await Promise.all([host,guest].map(p=>wait(p,()=>window.__cozy.street.music.ctx?.state==='running'&&!!window.__cozy.street.music.sample)));
  await Promise.all([host,guest].map(monitor));
  // Simultaneous button presses must survive the next signed snapshot.
  await guest.keyboard.down('a');await guest.keyboard.down('d');await guest.keyboard.down('g');
  for(const k of ['a','d','g'])await guest.keyboard.up(k);
  await wait(host,()=>[48,52,55].every(n=>window.bandAudio.notes.includes(n)));
  await wait(host,()=>[0,4,7].every(k=>window.bandAudio.pressed.includes('bass keys'+k)));
  assert.deepEqual(await guest.evaluate(()=>window.bandAudio.notes.slice(0,3)),[48,52,55]);
  const visitor=await profile();
  try{
    await visitor.goto(host.url());await ready(visitor);
    const authority=await host.evaluate(()=>window.__cozy.street.session.pub);
    await wait(visitor,pub=>{
      const s=window.__cozy.street.session;
      return s.connected&&s.pub===pub&&[...s.actors.values()].filter(a=>a.activity==='piano').length===2;
    },authority);
    await travel(visitor);await wait(visitor,()=>window.__cozy.street.session.actors.get(window.__cozy.street.session.id).feedback?.includes('listen here'));
    await wait(visitor,()=>window.__cozy.street.music.ctx?.state==='running'&&!!window.__cozy.street.music.sample);
    await monitor(visitor);
    // A listener can receive music while street presentation is suspended.
    await visitor.evaluate(()=>{const st=window.__cozy.street;st.render=()=>{};});
    await host.locator('#piano-octave').selectOption('12');
    await host.getByRole('button',{name:'Play C♯5',exact:true}).click();
    await wait(visitor,()=>window.bandAudio.notes.includes(73)&&window.bandAudio.outputPeak>.0005);
    await visitor.evaluate(()=>{delete window.__cozy.street.render;});
    await wait(guest,()=>window.bandAudio.notes.includes(73));
    await wait(guest,()=>window.bandAudio.pressed.includes('melody keys13'));
    assert.ok(!(await visitor.evaluate(()=>window.bandAudio.notes)).includes(48));
    await host.getByRole('button',{name:'Play C5',exact:true}).press('Enter');
    await wait(visitor,()=>window.bandAudio.notes.filter(n=>n===72).length===1);
    await Promise.all([host.keyboard.press('j'),guest.keyboard.press('f')]);
    await wait(visitor,()=>[83,53].every(n=>window.bandAudio.notes.includes(n)));
    const touch=await host.context().newCDPSession(host);
    try{
      await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
      const box=await host.getByRole('button',{name:'Play G5',exact:true}).boundingBox();
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height*.83}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await wait(visitor,()=>window.bandAudio.notes.includes(79));
      // Consecutive taps on the same key must both sound exactly once.
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height*.83}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await wait(visitor,()=>window.bandAudio.notes.filter(n=>n===79).length>=2);
    }finally{await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});await touch.detach();}
    await visitor.locator('#piano-sound').click();assert.ok(await visitor.evaluate(()=>window.__cozy.street.music.muted));
    await guest.keyboard.press('w');await wait(host,()=>window.bandAudio.notes.includes(49));
    assert.equal(await visitor.evaluate(()=>window.bandAudio.notes.filter(n=>n===79).length),2);
    await visitor.locator('#piano-sound').click();
    await host.bringToFront();
    await host.setViewportSize({width:1280,height:720});
    await wait(host,()=>Math.abs(window.__cozy.camera.aspect-innerWidth/innerHeight)<.01&&
      window.__cozy.street.openRoof===window.__cozy.street.club.id);
    const point=await host.evaluate(async()=>{
      const c=window.__cozy,st=c.street,b=st.club,{toWorld,floorAt}=await import('./src/street-world.js');
      const p=toWorld(b,-1.7,-1.68);
      const focusY=floorAt(st.island,st.plots,p.x,p.z,st.session.layout)+1.48;
      const {keyShape}=await import('./src/piano.js'),{Vector3}=await import('three');
      const rect=st.controls.domElement.getBoundingClientRect();
      const blockers=new Set();
      // A seated performer or listener may obscure a key from one direction.
      // Choose a genuinely exposed key and then use native clicks on that pixel.
      for(const [sx,z,height] of [[-.4,2.65,3.95],[-1.7,-.9,7.5],[-3.6,-2.5,5.5]]){
        const eye=toWorld(b,sx,z);
        st.cameraFocus={...p};await c.setCamera([eye.x,b.y+height,eye.z],[p.x,focusY,p.z]);
        const camera=st.camera.clone();camera.position.lerp(st.controls.target,1-st.cameraFraction());camera.updateMatrixWorld();
        for(const [key,shape] of keyShape.entries()){
          const world=toWorld(b,-1.7+shape.x,shape.z+(shape.black?0:.16));
          const v=new Vector3(world.x,b.y+(shape.black?.925:.87),world.z).project(camera);
          const x=Math.round(rect.left+(1+v.x)*rect.width/2),y=Math.round(rect.top+(1-v.y)*rect.height/2);
          const element=document.elementFromPoint(x,y);
          if(element!==st.controls.domElement){blockers.add(element?.id||element?.tagName||'offscreen');continue;}
          const ray=st.pointerRay({clientX:x,clientY:y}),hit=st.pickAction(ray,true,st.floorPoint(ray,st.camera.far));
          if(hit?.command?.type==='strike-key'&&hit.command.key===key)return {x,y,key,label:hit.label};
          blockers.add(hit?.followLabel||hit?.label||'ground');
        }
      }
      throw Error('Stage key hit test saw '+[...blockers].join(', '));
    });
    const pitch=60+point.key;
    const before=await visitor.evaluate(n=>window.bandAudio.notes.filter(x=>x===n).length,pitch);
    await host.mouse.click(point.x,point.y,{button:'right'});
    await host.getByRole('button',{name:point.label,exact:true}).and(host.locator('#world-action')).click();
    await wait(visitor,([n,total])=>window.bandAudio.notes.filter(x=>x===n).length===total,[pitch,before+1]);
    assert.ok(await host.evaluate(()=>!!window.__cozy.street.cameraFocus));
    await host.mouse.click(point.x,point.y);
    await wait(visitor,([n,total])=>window.bandAudio.notes.filter(x=>x===n).length===total,[pitch,before+2]);
    if(process.env.COZY_BAND_SHOT)await host.screenshot({path:process.env.COZY_BAND_SHOT,type:'jpeg',quality:90});
    await host.locator('#piano-mode').click();await host.locator('#piano-keys').waitFor({state:'hidden'});
    await wait(guest,()=>[...window.__cozy.street.session.actors.values()].some(a=>a.part==='melody'&&!a.piano));
    await guest.locator('#use-place').click();await guest.locator('#piano-controls').waitFor({state:'hidden'});
    await travel(visitor);await visitor.locator('#piano-controls').waitFor();assert.equal(await part(visitor),'bass');
    console.log('PASS live melody and bass over WebRTC, a three-note chord, both octaves, spectator audio output, stage key clicks with both buttons, return to the tune and reuse of a vacated bench.');
  }catch(error){
    await mkdir('test-results/street-failure',{recursive:true});
    await host.screenshot({path:'test-results/street-failure/stage.jpg',type:'jpeg',timeout:8000}).catch(()=>{});
    for(const p of [host,guest,visitor])console.error(JSON.stringify(await p.evaluate(()=>{
      const st=window.__cozy.street,s=st.session,a=s.actors.get(s.id),music=st.music;
      return {owner:s.owner,route:s.privateRoutes?.active,connected:s.connected,time:s.time,frame:s.verifiedSeq,
        location:s.near(a)?.kind,ctx:music.ctx?.state,audioTime:music.ctx?.currentTime,muted:music.muted,
        heard:[...music.heard],stage:[...s.actors.values()].filter(a=>a.part).map(a=>({part:a.part,seq:a.piano?.seq})),audio:window.bandAudio};
    }).catch(()=>null)));
    throw error;
  }finally{await visitor.context().close();}
}
