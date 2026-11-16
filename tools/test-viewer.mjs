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
  const origin = 'http://cozy.test/cozy/';
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
  await page.goto(origin + '?shot=1&preset=harborTown&seed=petalwood&view=town');
  await ready();
  const initial = await info();
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
    assert.ok(i.roads > 0 && i.plots > 0 && i.residents.length === 8);
    console.log(preset, i.roads, 'road pieces,', i.plots, 'plots,', i.residents.length, 'residents');
  }
  await page.evaluate(async () => {
    const c = window.__cozy;
    await Promise.all([c.load('meadowCove', 'cozy-1'), c.load('harborTown', 'petalwood', 'town')]);
  });
  assert.equal(await page.evaluate(() => window.__cozy.island.presetId), 'harborTown');

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
} finally {
  await browser.close();
}
