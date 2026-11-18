import * as THREE from 'three';
import {bridgeHeightAt, bridgeProfile} from './bridge-profile.js';

const asphalt = [.22, .225, .22], sandstone = [.64, .54, .42], stoneEdge = [.35, .31, .26];
const stoneCap = [.75, .68, .56], stripe = [.88, .72, .42], gravel = [.52, .405, .25];

export function bridgeDecks(island, roads) {
  const positions = [], colors = [], indices = [], spans = [];
  function quad(a, b, c, d, color) {
    const base = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) colors.push(...color);
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const point = (row, offset, rise) => [row[0] + row[3] * offset, row[2] + rise, row[1] + row[4] * offset];
  for (const road of roads) {
    if (!road.bridge) continue;
    const laneEdge = road.width / 2, paved = road.class !== 'path', parapet = paved && road.kind !== 'ford';
    const radius = laneEdge + (paved ? 1.05 : 0), rows = bridgeProfile(island, road, 2 * radius, roads);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      spans.push({a, b, radius});
      const strip = (left, ly, right, ry, color) =>
        quad(point(a, left, ly), point(b, left, ly), point(a, right, ry), point(b, right, ry), color);
      strip(-radius, 0, radius, 0, paved ? asphalt : gravel);
      if (road.class === 'main' && Math.floor((a[5] + b[5]) / 2) % 6 < 2) strip(-.075, .014, .075, .014, stripe);
      for (const side of [-1, 1]) {
        const outer = side * radius, inner = side * (radius - .21), edge = side * laneEdge;
        strip(outer, -.42, outer, 0, stoneEdge);
        if (!paved) continue;
        strip(edge, .01, outer, .01, sandstone);
        if (!parapet || !a[6]) continue;
        strip(inner, .01, inner, .65, stoneEdge);
        strip(outer, .01, outer, .65, stoneEdge);
        strip(inner, .65, outer, .65, stoneCap);
        for (const end of [!rows[i - 2]?.[6] ? a : null, !b[6] ? b : null]) {
          if (end) quad(point(end, inner, .01), point(end, outer, .01), point(end, inner, .65), point(end, outer, .65), stoneEdge);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({vertexColors: true, side: THREE.DoubleSide});
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 bridgePosition;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nbridgePosition = position;');
    shader.fragmentShader = 'varying vec3 bridgePosition;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 aggregate = fract(floor(bridgePosition * 18.) * vec3(.1031, .1030, .0973));
      aggregate += dot(aggregate, aggregate.yzx + 33.33);
      float grain = fract((aggregate.x + aggregate.y) * aggregate.z) - .5;
      float detail = 1. - smoothstep(.025, .13, length(fwidth(bridgePosition)));
      diffuseColor.rgb *= 1. + .085 * grain * detail;
    `);
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return {mesh, spans, heightAt: bridgeHeightAt(island.sample, spans)};
}
