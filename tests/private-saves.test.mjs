import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultLayout,readLayout} from '../src/street-world.js';
import {exportBackup,installBackup,keepPrint,loadOwner,parcelCredential,printCollection,project,readBackup,savedParcel,savedStreets,selectSave,writeRecovered} from '../src/private-saves.js';

test('encrypted recovery retains the verified owner, multiple revisions and the original save',async()=>{
  const values=new Map();let full=false;
  const prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return values.size;},
    key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,
    setItem:(k,v)=>{if(full)throw Error('Full');values.set(k,v);}}});
  try{
    const original=await loadOwner(),layout={...defaultLayout(),revision:4,lights:false,homeTV:{l93:2}},coffee={resident1:3};
    const file=await exportBackup(original.identity,layout,coffee,'test passphrase');
    assert.ok(!file.includes(original.identity.jwk.d));assert.ok(!file.includes(original.identity.pub));assert.ok(!file.includes('homeTV'));
    const file2=await exportBackup(original.identity,layout,coffee,'test passphrase');
    assert.notEqual(JSON.parse(file).salt,JSON.parse(file2).salt);assert.notEqual(JSON.parse(file).iv,JSON.parse(file2).iv);
    await assert.rejects(readBackup(file,'wrong'),/passphrase/);
    const changed=JSON.parse(file);changed.data=(changed.data[0]==='A'?'B':'A')+changed.data.slice(1);
    await assert.rejects(readBackup(JSON.stringify(changed),'test passphrase'),/unlock/);
    const restored=await readBackup(file,'test passphrase');assert.equal(restored.identity.pub,original.identity.pub);
    assert.equal(restored.parcel,undefined);
    const property=await parcelCredential('l93');assert.notEqual(property.pub,original.identity.pub);
    const withAddress=await exportBackup(original.identity,layout,coffee,'backup',null,savedParcel(),true);
    const imported=await readBackup(withAddress,'backup');
    assert.equal(restored.askToEnter,false);assert.equal(imported.askToEnter,true);
    assert.equal(restored.layout.homeTV.l93,2);assert.equal(restored.coffee.resident1,3);
    const other=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
    const mixed={...original.identity,jwk:await crypto.subtle.exportKey('jwk',other.privateKey)};
    await assert.rejects(readBackup(await exportBackup(mixed,layout,coffee,'test'),'test'),/match/);
    const first=installBackup(imported),second=installBackup(restored);
    assert.notEqual(first,second);assert.equal(savedStreets().length,3);
    selectSave(first);const selected=await loadOwner();assert.equal(selected.slot,first);
    assert.equal((await parcelCredential('l1')).pub,property.pub);assert.equal(savedParcel().home,'l93');
    assert.ok(writeRecovered(selected,{...layout,revision:5},coffee));assert.equal((await loadOwner()).recovered.layout.revision,5);
    full=true;assert.equal(writeRecovered(selected,{...layout,revision:6},coffee),false);
    assert.throws(()=>installBackup(restored),/storage/);full=false;assert.equal((await loadOwner()).recovered.layout.revision,5);
    selectSave(second);assert.equal((await loadOwner()).recovered.layout.revision,4);
    selectSave('');assert.equal((await loadOwner()).identity.pub,original.identity.pub);
    assert.equal(printCollection(''),0);assert.equal(keepPrint('','bed'),false);
    assert.ok(keepPrint('','easel-2'));assert.equal(printCollection(''),2);
    const decorated={...layout,wallPrints:{'frontage-r34-12-l':4}};
    assert.equal(readLayout({...layout,wallPrints:{l1:5}}),null);
    assert.equal(readLayout({...layout,wallPrints:{wrong:2}}),null);
    const galleryFile=await exportBackup(original.identity,decorated,coffee,'art',null,null,false,printCollection(''));
    const gallerySlot=installBackup(await readBackup(galleryFile,'art'));
    assert.equal(printCollection(gallerySlot),2);assert.equal(printCollection(first),0);
    assert.ok(keepPrint(gallerySlot,'easel-1'));assert.equal(printCollection(gallerySlot),3);assert.equal(printCollection(''),2);
    selectSave(gallerySlot);assert.deepEqual((await loadOwner()).recovered.layout.wallPrints,decorated.wallPrints);
    selectSave('');
    assert.deepEqual(JSON.parse(values.get(project+'.identity')),original.identity);
    values.set(project+'.identity','damaged');await assert.rejects(loadOwner(),/could not be read/);
    assert.equal(values.get(project+'.identity'),'damaged');
  }finally{if(prior)Object.defineProperty(globalThis,'localStorage',prior);else delete globalThis.localStorage;}
});
