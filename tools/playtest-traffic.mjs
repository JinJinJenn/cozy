import assert from 'node:assert/strict';

export async function playtestTraffic(page, origin) {
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (packet, ...rest) {
      if (packet?.type === 'init' && packet.island?.bridgeSpans) window.trafficInit = structuredClone(packet);
      return send.call(this, packet, ...rest);
    };
  });
  for(const [seed,population] of [['petalwood',459],['clover-618',344]]){
    await replayTown(page,origin,seed,population);
  }
}

async function replayTown(page,origin,seed,population){
  await page.goto(origin+'?net=local&view=street&preset=harborTown&seed='+seed);
  await page.waitForFunction(()=>window.trafficInit&&window.__cozy?.ready,null,{timeout:120000});
  const result = await page.evaluate(async () => {
    const {island,session}=window.__cozy.street;
    const {defaultLayout}=await import('./src/street-world.js');
    const {roadsOf,project,carriagewayAt}=await import('./src/street-road-index.js');
    const roadCells=roadsOf(island).cells,layout=session?.layout||defaultLayout();
    const worker = new Worker('./src/resident-worker.js', {type: 'module'});
    const send = packet => new Promise((resolve, reject) => {
      worker.onerror = e => reject(Error(e.message));
      worker.onmessage = ({data}) => data.type === 'error' ? reject(Error(data.message)) : resolve(data);
      worker.postMessage(packet);
    });
    const drivers = new Set(), crossStreet = new Set(), returning = new Set(), returned = new Set();
    const waits = new Map(), shifted = new Set(), runs = [];
    let walked = 0, inLane = 0, onPavement = 0, longestLaneWalk = 0;
    let previous = [], longestWait = 0, peakDrivers = 0, stoppedDriver;
    try {
      await send(window.trafficInit);
      for (let tick = 0; tick < 720; tick++) {
        const {positions} = await send({type: 'step', steps: 1, actors: [], routes: [], layout});
        let onRoad = 0;
        positions.forEach((p, i) => {
          const prev = previous[i], home = island.homesById.get(p.homeLotId);
          let parallelLane = 0;
          if (prev && !p.asleep && !p.driving && !prev.driving) {
            const dx = p.x-prev.x, dz = p.z-prev.z, d = Math.hypot(dx,dz);
            // Exclude boarding, discontinuous poses and stationary jitter.
            if (d > .002 && d < 2.5) {
              walked += d;
              const x = (p.x+prev.x)/2, z = (p.z+prev.z)/2;
              const road = carriagewayAt(island,x,z);
              if (road && project(road,{x,z}).distance < road.r-.3) {
                if (Math.abs(dx*road.dx+dz*road.dz) > .9*d) parallelLane = d;
              } else {
                const lines = roadCells.get(Math.floor(x/32)+','+Math.floor(z/32)) || [];
                if (lines.some(line => {
                  if (!line.drivable || Math.abs(dx*line.dx+dz*line.dz) <= .9*d) return false;
                  const edge = project(line,{x,z}).distance-line.r;
                  return edge >= 0 && edge <= (line.bridge ? 1.05 : 1.99);
                })) onPavement += d;
              }
            }
          }
          inLane += parallelLane;
          runs[i] = parallelLane ? (runs[i] || 0) + parallelLane : 0;
          longestLaneWalk = Math.max(longestLaneWalk,runs[i]);
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
          const seconds = stopped ? (waits.get(i) || 0) + .5 : 0;
          waits.set(i,seconds);
          if(seconds>longestWait){
            longestWait=seconds;
            if(seconds>30)stoppedDriver={id:p.id,x:p.x,z:p.z,destination:p.destination,heading:p.heading,
              nearby:positions.filter(q=>q.id!==p.id&&Math.hypot(q.x-p.x,q.z-p.z)<12)
                .map(q=>({id:q.id,x:q.x,z:q.z,driving:q.driving,heading:q.heading}))};
          }
        });
        peakDrivers = Math.max(peakDrivers, onRoad);previous = positions;
      }
      return {population: previous.length, benches: island.streetBenches.size, drivers: drivers.size,
        walked:Math.round(walked), onPavement:Math.round(onPavement), parallelLane:Math.round(inLane),
        longestLaneWalk:Math.round(longestLaneWalk), crossStreet: crossStreet.size, returned: returned.size, peakDrivers, longestWait, shifted: shifted.size, ...(stoppedDriver?{stoppedDriver}:{})};
    } finally { worker.terminate(); }
  });
  assert.equal(result.population,population);
  assert.equal(result.returned,result.drivers,'all resident drivers returned by the end of the Harbor Town replay: '+JSON.stringify(result));
  assert.ok(result.shifted>=50,'resident trips accelerated in second gear: '+result.shifted);
  assert.ok(result.benches > 0 && result.crossStreet >= 50 && result.returned >= 50 && result.longestWait < 60, JSON.stringify(result));
  assert.ok(result.walked > population*250 && result.onPavement > .5*result.walked, 'residents travelled on the rendered pavement: '+JSON.stringify(result));
  assert.ok(result.parallelLane < .01*result.walked && result.longestLaneWalk < 24, 'street crossings and short access legs: '+JSON.stringify(result));
  console.log('PASS six minutes of Harbor Town traffic',seed,result);
}
