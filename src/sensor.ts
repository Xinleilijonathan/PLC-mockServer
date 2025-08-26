import { SensorConfig } from './types';

abstract class Sensor {
  constructor(public cfg: SensorConfig) {}
  abstract valueAt(tSec: number): number;
}

class Sinusoidal extends Sensor {
  valueAt(t: number) {
    const { amplitude: A, frequency: f, phase: p, dcOffset: C } = this.cfg;
    return C + A * Math.sin(2 * Math.PI * f * t + p);
  }
}

class NoisySinusoidal extends Sinusoidal {
  valueAt(t: number) {
    const base = super.valueAt(t);
    const s = this.cfg.noiseStd ?? 0;
    return base + (s ? gaussian() * s : 0);
  }
}

class SquareWave extends Sensor {
  valueAt(t: number) {
    const { amplitude: A, frequency: f, phase: p, dcOffset: C } = this.cfg;
    // Convert phase to time offset to ensure independent phase control for different modules/sensors
    const period = 1 / f;
    const phaseTime = (p / (2 * Math.PI * f));
    const x = ((t + phaseTime) % period);
    const high = x < period / 2;
    return C + (high ? A : -A);
  }
}

function gaussian() {
  // Box–Muller transform
  let u = 0, v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function makeSensor(cfg: SensorConfig): Sensor {
  switch (cfg.type) {
    case 'sinusoidal': return new Sinusoidal(cfg);
    case 'noisy_sinusoidal': return new NoisySinusoidal(cfg);
    case 'square_wave': return new SquareWave(cfg);
  }
}
