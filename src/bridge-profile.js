// Follow the actual adjoining street on either bank, including its bends.
function approachPoints(roads, end, inside) {
  const dx = end[0] - inside[0], dz = end[1] - inside[1];
  let best = -Infinity, points = [];
  for (const other of roads) {
    if (other.bridge || other.pts.length < 2) continue;
    for (const reverse of [false, true]) {
      const p = reverse ? other.pts.at(-1) : other.pts[0];
      if (Math.hypot(p[0] - end[0], p[1] - end[1]) > .15) continue;
      const q = reverse ? other.pts.at(-2) : other.pts[1];
      const vx = q[0] - p[0], vz = q[1] - p[1];
      const score = (dx * vx + dz * vz) / (Math.hypot(vx, vz) || 1);
      if (score > best) { best = score; points = reverse ? other.pts.slice().reverse() : other.pts; }
    }
  }
  const approach = [];
  let remaining = 24;
  for (let i = 1; i < points.length && remaining > .01; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!length) continue;
    const t = Math.min(1, remaining / length);
    approach.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    remaining -= length * t;
  }
  return approach;
}

// Cross-sections use [x, z, deck height, right x, right z, distance, on bridge].
export function bridgeProfile(island, road, width = road.width, roads = []) {
  const rows = [], radius = width / 2;
  if (road.pts.length < 2) return rows;
  const first = approachPoints(roads, road.pts[0], road.pts[1]).reverse();
  const last = approachPoints(roads, road.pts.at(-1), road.pts.at(-2));
  const points = [...first, ...road.pts, ...last];
  const normals = points.slice(1).map(([x, z], i) => {
    const dx = x - points[i][0], dz = z - points[i][1], length = Math.hypot(dx, dz) || 1;
    return [dz / length, -dx / length];
  });
  // Intersect the offset edges at each original bend. Interpolating these
  // cross-sections keeps the inner kerb in order on short, tight corners.
  const offsets = points.map((_, i) => {
    const a = normals[i - 1] ?? normals[0], b = normals[i] ?? a;
    const divisor = Math.max(.5, 1 + a[0] * b[0] + a[1] * b[1]);
    const nx = (a[0] + b[0]) / divisor, nz = (a[1] + b[1]) / divisor;
    let scale = 1;
    // Some generated fords turn twice inside a single lane width. Limit the
    // reach of the miter so the inner wall cannot extend past the next joint.
    for (const neighbor of [points[i - 1], points[i + 1]]) {
      if (!neighbor) continue;
      const dx = neighbor[0] - points[i][0], dz = neighbor[1] - points[i][1];
      const projection = radius * Math.abs(dx * nx + dz * nz);
      if (projection > 0) scale = Math.min(scale, .48 * (dx * dx + dz * dz) / projection);
    }
    return [nx * scale, nz * scale];
  });
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const [x, z] = points[i - 1], [endX, endZ] = points[i];
    const dx = endX - x, dz = endZ - z, length = Math.hypot(dx, dz);
    if (!length) continue;
    const count = Math.ceil(length);
    for (let j = 0; j < count; j++) {
      const t = j / count;
      const onBridge = i > first.length && i < first.length + road.pts.length;
      const rightX = (1 - t) * offsets[i - 1][0] + t * offsets[i][0];
      const rightZ = (1 - t) * offsets[i - 1][1] + t * offsets[i][1];
      rows.push([x + dx * t, z + dz * t, 0, rightX, rightZ, distance + length * t, onBridge]);
    }
    distance += length;
  }
  if (!rows.length) return rows;
  const tip = points.at(-1);
  rows.push([tip[0], tip[1], 0, ...offsets.at(-1), distance, false]);
  const samples = Math.max(2, Math.ceil(width / .35));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row[6] && !rows[i - 1]?.[6]) {
      row[2] = island.sample(row[0], row[1]) + .025;
      continue;
    }
    let height = -Infinity;
    for (let j = 0; j <= samples; j++) {
      const offset = -radius + width * j / samples;
      const x = row[0] + offset * row[3], z = row[1] + offset * row[4];
      height = Math.max(height, island.sample(x, z) + .045, island.waterAt(x, z) + .30);
    }
    row[2] = height;
  }
  // Carry each high point toward both banks so the wheel contact surface
  // climbs onto the deck instead of stepping up where the water begins.
  const maxGrade = .12;
  for (let i = 1; i < rows.length; i++) {
    rows[i][2] = Math.max(rows[i][2], rows[i - 1][2] - maxGrade * (rows[i][5] - rows[i - 1][5]));
  }
  for (let i = rows.length - 2; i >= 0; i--) {
    rows[i][2] = Math.max(rows[i][2], rows[i + 1][2] - maxGrade * (rows[i + 1][5] - rows[i][5]));
  }
  // On mountainous islands the adjoining street can be steeper than the
  // bridge grade. Return to that street's actual surface at the two tips.
  const start = rows.find(row => row[6])?.[5] ?? 0;
  const endIndex = rows.findLastIndex(row => row[6]);
  const end = rows[Math.min(rows.length - 1, endIndex + 1)][5];
  const excessAt = row => Math.max(0, row[2] - island.sample(row[0], row[1]) - .025);
  const firstExcess = excessAt(rows[0]), lastExcess = excessAt(rows.at(-1));
  for (const row of rows) {
    const s = row[5];
    let t = 1;
    if (s < start) t = Math.min(1, s / Math.min(12, start));
    if (s > end) t = Math.min(1, (distance - s) / Math.min(12, distance - end));
    if (t < 1) {
      const ground = island.sample(row[0], row[1]) + .025;
      const excess = s < start ? firstExcess : lastExcess;
      row[2] = Math.max(ground, row[2] - excess * (1 - t * t * (3 - 2 * t)));
    }
  }
  return rows;
}

// Index the same two triangles the renderer submits. Wheels and pedestrians
// use this surface on both the main thread and the resident worker.
export function bridgeHeightAt(terrain, spans) {
  if (!spans.length) return (x, z, ground = terrain) => ground(x, z);
  const cells = new Map(), cellSize = 16;
  function add(p, q, r) {
    const ux = q[0] - p[0], uz = q[1] - p[1], vx = r[0] - p[0], vz = r[1] - p[1];
    const det = ux * vz - uz * vx;
    if (Math.abs(det) < 1e-8) return;
    const triangle = {p, ux, uz, vx, vz, inv: 1 / det, dyU: q[2] - p[2], dyV: r[2] - p[2]};
    const column = v => Math.floor(v / cellSize);
    for (let x = column(Math.min(p[0], q[0], r[0])); x <= column(Math.max(p[0], q[0], r[0])); x++) {
      for (let z = column(Math.min(p[1], q[1], r[1])); z <= column(Math.max(p[1], q[1], r[1])); z++) {
        const key = x + ',' + z;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(triangle);
      }
    }
  }
  for (const {a, b, radius} of spans) {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (!len) continue;
    const edge = (row, side) => [row[0] + side * radius * (row[3] ?? dz / len),
      row[1] + side * radius * (row[4] ?? -dx / len), row[2]];
    const al = edge(a, -1), ar = edge(a, 1), bl = edge(b, -1), br = edge(b, 1);
    add(al, bl, ar); add(ar, bl, br);
  }
  return (x, z, ground = terrain) => {
    let y = ground(x, z);
    const list = cells.get(Math.floor(x / cellSize) + ',' + Math.floor(z / cellSize));
    if (!list) return y;
    for (const t of list) {
      const dx = x - t.p[0], dz = z - t.p[1];
      const u = (dx * t.vz - dz * t.vx) * t.inv, v = (dz * t.ux - dx * t.uz) * t.inv;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) y = Math.max(y, t.p[2] + u * t.dyU + v * t.dyV);
    }
    return y;
  };
}
