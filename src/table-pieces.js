import * as THREE from 'three';
import {boardX,squareSize} from './table-game.js';

// Three draws for the pieces. Only the occupied home with an active board allocates them.
export class TablePieces {
  constructor(parent, table) {
    this.frame = new THREE.Group();
    this.frame.position.set(table.x, .936, table.z);
    this.frame.rotation.y = (table.turn || 0) * Math.PI / 2;
    parent.add(this.frame);
    const batch = (geometry, color, capacity) => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({color}), capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.frame.add(mesh);
      return mesh;
    };
    this.buoys = batch(new THREE.CylinderGeometry(.032,.075,.108,12), '#c14f36', 5);
    this.caps = batch(new THREE.CylinderGeometry(.028,.034,.037,12), '#fff2d3', 5);
    this.rings = batch(new THREE.TorusGeometry(.055,.022,8,18).rotateX(-Math.PI/2), '#166978', 4);
    this.matrix = new THREE.Matrix4();
  }
  update(round, time) {
    const moves = round?.moves || '';
    const drop = moves ? Math.max(0,1-Math.max(0,time-round.at)/.42) : 0;
    if (moves === this.moves && drop === this.drop) return;
    this.moves = moves;
    this.drop = drop;
    this.buoys.count = this.caps.count = this.rings.count = 0;
    for (let turn=0; turn<moves.length; turn++) {
      const cell = Number(moves[turn]), x = boardX+(cell%3-1)*squareSize, z = (Math.floor(cell/3)-1)*squareSize;
      const y = turn === moves.length-1 ? .20*drop*drop : 0;
      const set = (mesh, height) => mesh.setMatrixAt(mesh.count++, this.matrix.makeTranslation(x,y+height,z));
      if (turn % 2) set(this.rings,.024);
      else { set(this.buoys,.054); set(this.caps,.126); }
    }
    for (const mesh of this.frame.children) mesh.instanceMatrix.needsUpdate = true;
  }
}
