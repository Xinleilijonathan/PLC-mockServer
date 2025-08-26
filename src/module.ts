import { ModuleConfig, Reading } from './types';
import { makeSensor } from './sensor';

export class ModuleRunner {
  readonly sensors = this.cfg.sensors.map(s => ({ cfg: s, impl: makeSensor(s) }));
  private t0 = Date.now();
  constructor(public cfg: ModuleConfig) {}

  tick(): Reading[] {
    const now = Date.now();
    const tSec = (now - this.t0) / 1000;
    return this.sensors.map(s => {
      const reading: Reading = {
        name: s.cfg.name,
        value: s.impl.valueAt(tSec),
        ts: now,
        moduleId: this.cfg.id,
      };
      if (s.cfg.unit !== undefined) {
        reading.unit = s.cfg.unit;
      }
      return reading;
    });
  }
}
