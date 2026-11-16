// Headless two-tab e2e. Usage: node test/e2e.mjs [broadcast|nostr|torrent|all]   (default: broadcast)
//  broadcast : BroadcastChannel loopback, no network needed (always runs in CI-ish sandboxes)
//  nostr/torrent : real Trystero over public signalling + WebRTC; needs internet. If peers never
//                  find each other the run is reported as UNREACHABLE (not a pass) and exits 2.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..'); // cozy root, so the page can reach packages/net
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/trontstack/craftmine/package.json');
const { chromium } = require('playwright');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' };

// own tiny static server (localhost only), rooted at cozy/, restricted to packages/net
const server = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(root, p);
    if (!file.startsWith(path.join(root, 'packages', 'net'))) { res.writeHead(403).end('no'); return; }
    if (!(await stat(file)).isFile()) { res.writeHead(404).end('nf'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/packages/net/test/e2e.html`;

const arg = process.argv[2] || 'broadcast';
const modes = arg === 'all' ? ['broadcast', 'nostr', 'torrent'] : [arg];
const exe = process.env.CHROME_EXE || 'C:/Users/trent/AppData/Local/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-win64/chrome-headless-shell.exe';
const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--mute-audio'] });

let failed = 0, unreachable = 0;
const check = (ok, msg) => { console.log((ok ? '  PASS ' : '  FAIL ') + msg); if (!ok) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(mode) {
  const real = mode !== 'broadcast';
  const waitMs = real ? 45000 : 8000;
  console.log(`\n== transport: ${mode} ==`);
  const ctx = await browser.newContext(); // one context = shared origin for BroadcastChannel
  const seed = 'e2e-' + Math.random().toString(36).slice(2, 8); // unique room, no collisions on public relays
  const q = who => `${base}?seed=${seed}&preset=meadowCove&transport=${mode}&who=${who}`;
  const a = await ctx.newPage(), b = await ctx.newPage();
  for (const [n, pg] of [['a', a], ['b', b]]) pg.on('pageerror', e => console.log(`  [${n}] pageerror`, e.message));
  await a.goto(q('a')); await b.goto(q('b'));
  const joined = await Promise.all([a, b].map(pg => pg.evaluate(() => window.__ready)));
  check(joined.every(Boolean), 'both sessions joined');
  const peers = pg => pg.evaluate(() => window.__t.net.getLatestRaw().length);
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs && !((await peers(a)) && (await peers(b)))) await sleep(250);
  if (!((await peers(a)) && (await peers(b)))) {
    const errs = await a.evaluate(() => window.__t.log.errors);
    console.log(`  UNREACHABLE: no peer discovered within ${waitMs}ms (errors: ${JSON.stringify(errs)})`);
    unreachable++; await ctx.close(); return;
  }
  check(true, `peers discovered in ${Date.now() - t0}ms`);

  // each side sees the other's position updates: sample twice, expect motion in the scripted direction
  const read = pg => pg.evaluate(() => ({ raw: window.__t.net.getLatestRaw()[0], interp: window.__t.net.getPeerStates()[0], id: window.__t.net.selfId, base: window.__t.base }));
  const [a1, b1] = [await read(a), await read(b)];
  await sleep(1500);
  const [a2, b2] = [await read(a), await read(b)];
  check(a1.raw.id === b1.id && b1.raw.id === a1.id, 'peer ids match the other tab self id');
  // a walks +x from (10,4,20); b walks -z from (-30,4,50)
  check(Math.abs(b2.raw.p[0] - 10) < 60 && b2.raw.p[0] > a1.base[0] - 1, `b sees a.x advancing (${b1.raw.p[0].toFixed(1)} -> ${b2.raw.p[0].toFixed(1)})`);
  check(b2.raw.p[0] - b1.raw.p[0] > 2, 'b sees a moving +x by >2m in 1.5s');
  check(Math.abs(b2.raw.p[2] - 20) < 0.01 && Math.abs(b2.raw.p[1] - 4) < 0.01, 'a.y and a.z unchanged as scripted');
  check(a1.raw.p[2] - a2.raw.p[2] > 2, 'a sees b moving -z by >2m in 1.5s');
  check(Math.abs(a2.raw.p[0] + 30) < 0.01, 'b.x unchanged as scripted');
  check(b2.interp && b2.interp.p[0] > b1.interp.p[0] && b2.interp.p[0] <= b2.raw.p[0] + 1e-6, 'interpolated pose advances and lags the raw pose');
  const names = await a.evaluate(() => window.__t.net.getPeerStates()[0].name);
  check(names === 'player-b', 'peer name carried');
  const sent = await a.evaluate(() => window.__t.net.stats.sent);
  const dur = await a.evaluate(() => performance.now() / 1000);
  check(sent / dur < 12, `send rate about 10Hz (${(sent / dur).toFixed(1)}/s)`);

  // leave: close b, a should see peerleave
  await b.close();
  const t1 = Date.now(); let left = 0;
  while (Date.now() - t1 < (real ? 20000 : 6000)) { left = await a.evaluate(() => window.__t.log.leaves.length); if (left) break; await sleep(250); }
  check(left === 1, `a got peerleave after b closed (${Date.now() - t1}ms)`);
  check((await peers(a)) === 0, 'a has no peers left');
  await ctx.close();
}

try { for (const m of modes) await run(m); }
catch (e) { console.log('ERROR', e); failed++; }
await browser.close(); server.close();
console.log(`\nresult: ${failed ? 'FAILED' : 'ok'}  failures=${failed} unreachable=${unreachable}`);
process.exit(failed ? 1 : unreachable ? 2 : 0);
