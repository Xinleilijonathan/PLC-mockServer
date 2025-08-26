import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { z } from 'zod';
import { AppConfig } from './types';

const SensorSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['sinusoidal','noisy_sinusoidal','square_wave']),
  amplitude: z.number(),
  frequency: z.number().positive(),
  phase: z.number(),
  dcOffset: z.number(),
  noiseStd: z.number().nonnegative().optional(),
  unit: z.string().optional(),
});

const ModuleSchema = z.object({
  id: z.number().int().positive(),
  updateMs: z.number().int().positive().optional(),
  sensors: z.array(SensorSchema).length(3, 'Each module must have exactly 3 sensors'),
});

const ADSConfigSchema = z.object({
  localAdsPort: z.number().int().positive().optional(),
  localAmsNetId: z.string().optional(),
  routerTcpPort: z.number().int().positive().optional(),
  routerAddress: z.string().optional(),
  localTcpPort: z.number().int().nonnegative().optional(),
  localAddress: z.string().optional(),
  timeoutDelay: z.number().int().positive().optional(),
  autoReconnect: z.boolean().optional(),
  reconnectInterval: z.number().int().positive().optional(),
  hideConsoleWarnings: z.boolean().optional(),
});

const ConfigSchema = z.object({
  server: z.object({
    protocol: z.enum(['ws','ads']),
    port: z.number().int().positive(),
    updateMs: z.number().int().positive().optional(),
    ads: ADSConfigSchema.optional(),
  }),
  modules: z.array(ModuleSchema).min(1),
});

export function loadConfig(file = 'config/example.yaml'): AppConfig {
  const raw = fs.readFileSync(path.resolve(file), 'utf8');
  const data = file.endsWith('.yaml') || file.endsWith('.yml') ? YAML.parse(raw) : JSON.parse(raw);
  const parsed = ConfigSchema.parse(data);
  return parsed as AppConfig;
}
