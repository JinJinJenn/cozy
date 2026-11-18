import assert from 'node:assert/strict';

async function monitor(page){
  await page.evaluate(()=>{
    const st=window.__cozy.street,{ctx,master}=st.music;
    const analyser=ctx.createAnalyser();analyser.fftSize=1024;master.connect(analyser);
    const data=new Float32Array(analyser.fftSize);
    window.bandAudio={notes:[],peak:0,pressed:[]};
    const bass=st.art.g.getObjectByName('bass keys'),melody=st.art.g.getObjectByName('melody keys');
    const create=ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource=()=>{
      const source=create(),start=source.start.bind(source);
      source.start=(...args)=>{window.bandAudio.notes.push(Math.round(57+12*Math.log2(source.playbackRate.value)));return start(...args);};
      return source;
    };
    const sample=()=>{
      analyser.getFloatTimeDomainData(data);
      for(const x of data)window.bandAudio.peak=Math.max(window.bandAudio.peak,Math.abs(x));
      for(const [mesh,key] of [[bass,0],[bass,4],[bass,7],[melody,13]]){
        if(mesh.instanceMatrix.array[key*16+13]<(key===13?.88:.83)&&!window.bandAudio.pressed.includes(mesh.name+key))
          window.bandAudio.pressed.push(mesh.name+key);
      }
      requestAnimationFrame(sample);
    };
    sample();
  });
}

export async function playBand({host,guest,profile,ready,wait}){
  const travel=async page=>{
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
    await wait(visitor,()=>window.__cozy.street.session.connected);
    await travel(visitor);await wait(visitor,()=>window.__cozy.street.session.actors.get(window.__cozy.street.session.id).feedback?.includes('listen here'));
    await wait(visitor,()=>window.__cozy.street.music.ctx?.state==='running'&&!!window.__cozy.street.music.sample);
    await monitor(visitor);
    await host.locator('#piano-octave').selectOption('12');
    await host.getByRole('button',{name:'Play C♯5',exact:true}).click();
    await wait(visitor,()=>window.bandAudio.notes.includes(73)&&window.bandAudio.peak>.0005);
    await wait(guest,()=>window.bandAudio.notes.includes(73));
    await wait(guest,()=>window.bandAudio.pressed.includes('melody keys13'));
    assert.ok(!(await visitor.evaluate(()=>window.bandAudio.notes)).includes(48));
    await Promise.all([host.keyboard.press('j'),guest.keyboard.press('f')]);
    await wait(visitor,()=>[83,53].every(n=>window.bandAudio.notes.includes(n)));
    const touch=await host.context().newCDPSession(host);
    try{
      await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
      const box=await host.getByRole('button',{name:'Play G5',exact:true}).boundingBox();
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height*.83}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await wait(visitor,()=>window.bandAudio.notes.includes(79));
    }finally{await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});await touch.detach();}
    await visitor.locator('#piano-sound').click();assert.ok(await visitor.evaluate(()=>window.__cozy.street.music.muted));
    await guest.keyboard.press('w');await wait(host,()=>window.bandAudio.notes.includes(49));
    assert.equal(await visitor.evaluate(()=>window.bandAudio.notes.filter(n=>n===79).length),1);
    await visitor.locator('#piano-sound').click();
    if(process.env.COZY_BAND_SHOT)await host.setViewportSize({width:1280,height:720});
    const point=await host.evaluate(async()=>{
      const c=window.__cozy,st=c.street,b=st.club,{toWorld}=await import('./src/street-world.js');
      const p=toWorld(b,-1.7,-1.68),eye=toWorld(b,-.4,2.65);
      st.cameraFocus={...p};await c.setCamera([eye.x,b.y+3.95,eye.z],[p.x,b.y+.85,p.z]);
      const {keyShape}=await import('./src/piano.js'),{Vector3}=await import('three');
      const camera=st.camera.clone();camera.position.lerp(st.controls.target,1-st.cameraFraction());camera.updateMatrixWorld();
      const rect=st.controls.domElement.getBoundingClientRect();
      for(const key of [12,16,19,21,24,7,11]){
        const shape=keyShape[key],world=toWorld(b,-1.7+shape.x,-1.68),v=new Vector3(world.x,b.y+.87,world.z).project(camera);
        const x=Math.round(rect.left+(1+v.x)*rect.width/2),y=Math.round(rect.top+(1-v.y)*rect.height/2);
        const ray=st.pointerRay({clientX:x,clientY:y}),hit=st.pickAction(ray,true,st.floorPoint(ray,st.camera.far));
        if(document.elementFromPoint(x,y)===st.controls.domElement&&hit?.command?.type==='strike-key'&&hit.command.key===key)return {x,y,key,label:hit.label};
      }
      throw Error('No visible world key under pointer');
    });
    await host.mouse.click(point.x,point.y,{button:'right'});
    await host.getByRole('button',{name:point.label,exact:true}).and(host.locator('#world-action')).click();
    await wait(visitor,n=>window.bandAudio.notes.includes(n),60+point.key);
    const seen=await visitor.evaluate(()=>window.bandAudio.notes.length);
    await host.mouse.click(point.x,point.y);
    await wait(visitor,n=>window.bandAudio.notes.length>n,seen);
    if(process.env.COZY_BAND_SHOT)await host.screenshot({path:process.env.COZY_BAND_SHOT,type:'jpeg',quality:90});
    await host.locator('#piano-mode').click();await host.locator('#piano-keys').waitFor({state:'hidden'});
    await wait(guest,()=>[...window.__cozy.street.session.actors.values()].some(a=>a.part==='melody'&&!a.piano));
    await guest.locator('#use-place').click();await guest.locator('#piano-controls').waitFor({state:'hidden'});
    await travel(visitor);await visitor.locator('#piano-controls').waitFor();assert.equal(await part(visitor),'bass');
    console.log('PASS live melody and bass over WebRTC, a three-note chord, both octaves, spectator audio output, stage key clicks with both buttons, return to the tune and reuse of a vacated bench.');
  }finally{await visitor.context().close();}
}
