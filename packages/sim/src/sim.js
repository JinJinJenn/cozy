// Node entry point retains the synchronous snapshot digest used by replay tools.
import { createHash } from 'node:crypto';
import { sortedStringify } from '../../objects/index.js';
import { Simulation } from './simulation.js';

export { DEFAULTS } from './simulation.js';
export class Sim extends Simulation {
  hash() { return createHash('sha256').update(sortedStringify(this.toJSON())).digest('hex'); }
}
