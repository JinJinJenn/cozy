// Exercise the real viewer at the Pages subpath. Local assets are fulfilled from
// disk so the module worker, browser and WebGL tests can also run offline.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(process.env.PLAYWRIGHT_FROM || import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROME_EXE || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const origin = 'https://cozy.test/cozy/';
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css':'text/css' };
  await page.context().route('**/*', async route => {
    const url = route.request().url();
    if (!url.startsWith(origin)) {
      errors.push('Unexpected URL ' + url);
      return route.abort();
    }
    const relative = new URL(url).pathname.slice('/cozy/'.length) || 'index.html';
    const file = path.resolve(root, relative);
    assert.ok(file.startsWith(root));
    await route.fulfill({ body: await readFile(file), contentType: types[path.extname(file)] });
  });
  const ready = () => page.waitForFunction(() => window.__cozy?.ready, null, { timeout: 120000 });
  const info = () => page.evaluate(() => window.__cozy.info());
  if(process.argv.includes('--traffic')){
    const {playtestTraffic}=await import('./playtest-traffic.mjs');
    await playtestTraffic(page,origin);assert.deepEqual(errors,[]);
    await browser.close();process.exit(0);
  }
  await page.goto(origin + '?shot=1&preset=harborTown&seed=petalwood&view=town');
  await ready();
  const initial = await info();
  if(process.argv.includes('--seed-shot')){
    await page.goto(origin+'?shot=1&preset=harborTown&seed=willow-bay&view=centre');
    await ready();
    const counts=await page.evaluate(async()=>{
      const c=window.__cozy;
      c.setView('centre',{dist:249,elev:.83});await c.flushChunks();c.render(4);
      return {square:c.island.plan.civic.square.id,lanes:c.island.plan.roads.filter(r=>r.id.startsWith('lane-')).length};
    });
    assert.ok(counts.square&&counts.lanes>0);assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(root,'docs/shots/2026-11-17/willow-bay.jpg'),quality:89});
    console.log('PASS new Harbor Town seed',counts);await browser.close();process.exit(0);
  }
  if(process.argv.includes('--centre-shot')){
    await page.goto(origin+'?net=local&view=street');
    await ready();await page.waitForFunction(()=>window.__cozy.street.session?.ready);
    await page.locator('#directions-open').click();
    await page.locator('#destination').selectOption('square');await page.locator('#go-place').click();
    const result=await page.evaluate(()=>{
      const c=window.__cozy,s=c.street.session,a=s.actors.get(s.id),b=c.island.townSquare;
      for(let i=0;i<8000&&a.walking;i++)s.tick(.04);
      return {distance:Math.hypot(a.x-b.entry.x,a.z-b.entry.z),feedback:a.feedback};
    });
    assert.ok(result.distance<.22,JSON.stringify(result));
    const dir=path.join(root,'docs/shots/2026-11-17');
    await page.evaluate(async()=>{
      const c=window.__cozy,s=c.street.session,a=s.actors.get(s.id),b=c.island.townSquare,h=c.island.plan.civic.hall;
      const dx=h.x-a.x,dz=h.z-a.z,length=Math.hypot(dx,dz),y=c.island.sample(a.x,a.z);
      await c.setCamera([a.x-dx/length*8-dz/length*2,y+4.2,a.z-dz/length*8+dx/length*2],
        [a.x+dx/length*5,y+2.8,a.z+dz/length*5]);c.render();
    });
    await page.screenshot({path:path.join(dir,'square-walk.jpg'),quality:89});
    await page.locator('#island-map').click();await page.locator('#centre-view').click();
    await page.evaluate(async()=>{const c=window.__cozy;document.body.classList.add('shot');await c.flushChunks();c.render(4);});
    await page.screenshot({path:path.join(dir,'town-square.jpg'),quality:90});
    await page.evaluate(async()=>{const c=window.__cozy;c.setView('centre',{dist:220,elev:1.05});await c.flushChunks();c.render(4);});
    await page.screenshot({path:path.join(dir,'civic-district.jpg'),quality:90});
    assert.deepEqual(errors,[]);console.log('PASS waterfront to town square, district and square cameras',result);
    await browser.close();process.exit(0);
  }
  if(process.argv.includes('--road-shot')){
    await page.goto(origin+'?shot=1&net=local&view=street');
    await ready();
    await page.waitForFunction(()=>window.__cozy.street.session?.ready);
    const destination={x:-86.1,z:266};
    const arrived=await page.evaluate(goal=>{
      const c=window.__cozy,s=c.street.session,a=s.actors.get(s.id);
      s.command({type:'walk',...goal});
      for(let i=0;i<1600&&a.walking;i++)s.tick(.04);
      c.render(2);return {x:a.x,z:a.z,feedback:a.feedback};
    },destination);
    assert.ok(Math.hypot(arrived.x-destination.x,arrived.z-destination.z)<.2,JSON.stringify(arrived));
    await page.evaluate(async()=>{
      const c=window.__cozy,t=c.controls.target;
      await c.setCamera([t.x+10,t.y+3.5,t.z+8],[t.x,t.y,t.z]);c.render(2);
    });
    const output=process.env.COZY_ROAD_SHOT||path.join(root,'docs/shots/2026-11-17/harbor-road.jpg');
    await page.screenshot({path:output,quality:89});
    assert.deepEqual(errors,[]);console.log('PASS walked from the café to the far side of Harbor Green',arrived);
    await browser.close();process.exit(0);
  }
  const capture = process.argv.includes('--shots');
  const out = path.join(root, 'docs/shots', new Date().toISOString().slice(0, 10));
  if (capture) await mkdir(out, { recursive: true });
  for (const [time, dist, elev, name] of [[2, 23, .39, 'residents'], [8, 178, .86, 'streets']]) {
    await page.evaluate(async ([t, dist, elev]) => {
      const c = window.__cozy;
      c.setView('town', { dist, elev });
      await c.flushChunks();
      c.render(t);
    }, [time, dist, elev]);
    if (capture) await page.screenshot({ path: path.join(out, 'harborTown-' + name + '.png') });
  }
  const walked = await info();
  assert.equal(walked.tick, 16);
  assert.ok(walked.residents.some((p, i) => Math.hypot(p.x - initial.residents[i].x, p.z - initial.residents[i].z) > 1));
  for (const preset of ['harborTown', 'meadowCove', 'pineHighlands', 'sandbarArchipelago']) {
    if (preset !== 'harborTown') {
      await page.evaluate(id => window.__cozy.load(id, 'cozy-1', 'town'), preset);
    }
    const i = await info();
    assert.ok(i.roads > 0 && i.plots > 0 && i.residents.length > 8);
    const expected=await page.evaluate(()=>{const {size,chunkSize}=window.__cozy.island;return (size/chunkSize)**2;});
    assert.equal(i.chunks,expected,preset+' entire surface resident');
    console.log(preset, i.roads, 'road pieces,', i.plots, 'plots,', i.residents.length, 'residents');
  }
  await page.evaluate(async () => {
    const c = window.__cozy;
    await Promise.all([c.load('meadowCove', 'cozy-1'), c.load('harborTown', 'petalwood', 'town')]);
  });
  assert.equal(await page.evaluate(() => window.__cozy.island.presetId), 'harborTown');
  assert.equal((await info()).chunks,initial.chunks,'overlapping loads retain exactly one complete island');

  await page.goto(origin + '?preset=harborTown&seed=cozy-1');
  await ready();
  await page.getByRole('button', { name: 'Town', exact: true }).click();
  assert.ok(await page.evaluate(() => window.__cozy.controls.getDistance() < 60));
  await page.locator('#mapo').click({ position: { x: 85, y: 115 } });
  assert.ok(await page.evaluate(() => window.__cozy.controls.target.x < 0));
  await page.selectOption('#preset', 'meadowCove');
  await ready();
  assert.equal(await page.evaluate(() => window.__cozy.island.presetId), 'meadowCove');
  await page.getByRole('button', { name: 'Re-roll' }).click();
  await ready();
  assert.notEqual(await page.evaluate(() => window.__cozy.island.seed), 'cozy-1');
  assert.deepEqual(errors, []);
  console.log('PASS four locales, resident movement, overlapping loads, Town camera, minimap, locale and Re-roll controls');
  let failures=0;
  await page.route('**/src/street-art.js',route=>{
    if(failures>=2)return route.fallback();
    failures++;return route.abort();
  });
  await page.goto(origin+'?shot=1&preset=harborTown&seed=petalwood');
  await page.getByRole('button',{name:'Try again'}).click({timeout:30000});
  await ready();
  assert.equal(failures,2);console.log('PASS interrupted module load retried once, offered recovery and opened the island');
} finally {
  await browser.close();
}
