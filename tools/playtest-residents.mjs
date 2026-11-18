import assert from 'node:assert/strict';

// Pose actual seeded households side by side using the street's instanced renderer.
export async function testResidents(page){
  const result=await page.evaluate(async()=>{
    const THREE=await import('three');
    const {ResidentCrowd}=await import('./src/resident-crowd.js');
    const town=window.__cozy.street.town;
    const styles=town.crowd.styles,households=[],cuts=new Set(),outfits=new Set();
    for(const detail of [0,1,2,3]){
      const i=styles.findIndex(s=>s.faceDetail===detail&&!cuts.has(s.cut)&&!outfits.has(s.outfit));
      if(i<0)throw Error('Missing distinct resident for portrait '+detail);
      households.push(town.current[i]);cuts.add(styles[i].cut);outfits.add(styles[i].outfit);
    }
    const scene=new THREE.Scene();scene.background=new THREE.Color('#d2dfd5');
    scene.add(new THREE.HemisphereLight('#fff8e6','#b5ac98',1.7));
    const sun=new THREE.DirectionalLight('#fff0dc',2);sun.position.set(-3,5,5);scene.add(sun);
    const crowd=new ResidentCrowd(scene,households,window.__cozy.island.seed);
    const people=households.map((_,i)=>{
      const p=new THREE.Object3D();p.position.x=(i-1.5)*1.17;p.userData.heading=(i%2?1:-1)*.17;return p;
    });
    const camera=new THREE.OrthographicCamera(-2.34,2.34,1.18,-1.18,.1,20);
    camera.position.set(0,1.22,6);camera.lookAt(0,.99,0);camera.updateMatrixWorld();
    crowd.render(people,camera,0);
    for(let step=1;step<=12;step++){
      for(const p of people)p.position.z+=.025;
      crowd.render(people,camera,step*16);
    }
    const stages=people.map((p,i)=>+(p.userData.phase-crowd.styles[i].phaseOffset).toFixed(3));
    const details=crowd.costumes.map((parts,i)=>parts.some(p=>p.variant?.key==='faceDetail'&&p.variant.value===crowd.styles[i].faceDetail));
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(920,464);renderer.render(scene,camera);
    const sheet=document.createElement('figure');sheet.id='resident-portraits';
    Object.assign(sheet.style,{position:'fixed',top:0,left:0,zIndex:30,margin:0,width:'920px',background:'#d2dfd5',color:'#294640',font:'600 20px Georgia'});
    const print=new Image();print.width=920;print.height=464;print.src=renderer.domElement.toDataURL();await print.decode();sheet.append(print);
    const names=document.createElement('figcaption');names.style.cssText='display:flex;text-align:center;padding:0 0 16px';
    for(const h of households){const label=document.createElement('span');label.style.flex='1';label.textContent=h.name;names.append(label);}
    sheet.append(names);document.body.append(sheet);
    // Compare uploaded instances with Three's full hierarchy traversal across
    // walk, seat and drive poses. This also checks that hidden parts stay out.
    const submit=crowd.submit,expected=new THREE.Matrix4(),actual=new THREE.Matrix4();
    let checked=0;
    crowd.submit=function(sources,style){
      const offsets=new Map([...this.batches.values()].map(b=>[b,b.used]));
      submit.call(this,sources,style);
      (sources===this.carParts?this.car:this.rig).updateMatrixWorld(true);
      for(const {source,batch,pieces} of sources){
        let visible=true;
        for(let n=source;n;n=n.parent)if(!n.visible&&!n.userData.wardrobe){visible=false;break;}
        if(!visible)continue;
        let offset=offsets.get(batch);
        for(const {local} of pieces){
          expected.multiplyMatrices(source.matrixWorld,local);batch.mesh.getMatrixAt(offset++,actual);
          if(expected.elements.some((v,i)=>Math.abs(v-actual.elements[i])>.00001))throw Error('Resident pose matrix differs');
          checked++;
        }
        offsets.set(batch,offset);
      }
      for(const [batch,n] of offsets)if(n!==batch.used)throw Error('Incorrect visible resident part count');
    };
    people[0].userData.driving=true;people[1].scale.y=.73;people[2].userData.driving=true;
    crowd.render(people,camera,220);
    crowd.dispose();renderer.dispose();
    return {names:households.map(p=>p.name),stages,details,checked};
  });
  assert.equal(new Set(result.stages).size,4,'walking the same distance produced distinct gait phases');
  assert.deepEqual(result.details,[false,true,true,true]);
  assert.ok(result.checked>100);
  if(process.env.COZY_RESIDENT_SHOT)await page.locator('#resident-portraits').screenshot({path:process.env.COZY_RESIDENT_SHOT,type:'jpeg',quality:92});
  console.log('PASS four seeded households with distinct stride lengths and facial details:',result.names.join(', '));
}
