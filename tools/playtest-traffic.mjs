import assert from 'node:assert/strict';

export async function playtestTraffic(page, origin) {
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (packet, ...rest) {
      if (packet?.type === 'init' && packet.island?.bridgeSpans) window.trafficInit = structuredClone(packet);
      return send.call(this, packet, ...rest);
    };
  });
  await page.goto(origin + '?net=local&view=street');
  await page.waitForFunction(() => window.trafficInit && window.__cozy?.street?.session?.ready, null, {timeout: 120000});
  const result = await page.evaluate(async () => {
    const {island, session} = window.__cozy.street;
    const worker = new Worker('./src/resident-worker.js', {type: 'module'});
    const send = packet => new Promise((resolve, reject) => {
      worker.onerror = e => reject(Error(e.message));
      worker.onmessage = ({data}) => data.type === 'error' ? reject(Error(data.message)) : resolve(data);
      worker.postMessage(packet);
    });
    const drivers = new Set(), crossStreet = new Set(), returning = new Set(), returned = new Set();
    const waits = new Map(), shifted = new Set();
    let previous = [], longestWait = 0, peakDrivers = 0;
    try {
      await send(window.trafficInit);
      for (let second = 0; second < 360; second++) {
        const {positions} = await send({type: 'step', steps: 2, actors: [], routes: [], layout: session.layout});
        let onRoad = 0;
        positions.forEach((p, i) => {
          const prev = previous[i], home = island.homesById.get(p.homeLotId);
          if (p.driving) {
            drivers.add(i);onRoad++;
            if(p.gear>=2&&p.engineLoad>0)shifted.add(i);
            if (p.destination === p.homeLotId) returning.add(i);
            else {
              const destination = island.homesById.get(p.destination);
              if (home && destination && destination.road !== home.road) crossStreet.add(i);
            }
          } else if (returning.has(i) && p.action === 'idle' && home && Math.hypot(p.x-home.inside.x, p.z-home.inside.z) < .5) {
            returned.add(i);returning.delete(i);
          }
          const stopped = p.driving && prev?.driving && p.destination === prev.destination && Math.hypot(p.x-prev.x, p.z-prev.z) < .01;
          const seconds = stopped ? (waits.get(i) || 0) + 1 : 0;
          waits.set(i, seconds);longestWait = Math.max(longestWait, seconds);
        });
        peakDrivers = Math.max(peakDrivers, onRoad);previous = positions;
      }
      return {population: previous.length, benches: island.streetBenches.size, drivers: drivers.size,
        crossStreet: crossStreet.size, returned: returned.size, peakDrivers, longestWait, shifted: shifted.size};
    } finally { worker.terminate(); }
  });
  assert.equal(result.population, 459);
  assert.ok(result.shifted>=50,'resident trips accelerated in second gear: '+result.shifted);
  assert.ok(result.benches > 0 && result.crossStreet >= 50 && result.returned >= 50 && result.longestWait < 60, JSON.stringify(result));
  console.log('PASS six minutes of Harbor Town traffic', result);
}
