export type SensorType = 'sinusoidal' | 'noisy_sinusoidal' | 'square_wave';

export interface SensorConfig {
  name: string;
  type: SensorType;
  amplitude: number;
  frequency: number; // Hz
  phase: number;     // radians
  dcOffset: number;
  noiseStd?: number; // for noisy_sinusoidal
  unit?: string;
}

export interface ModuleConfig {
  id: number;
  sensors: SensorConfig[]; // exactly 3
  updateMs?: number;       // override server.updateMs
}

export interface ADSServerConfig {
  localAdsPort?: number;
  localAmsNetId?: string;
  routerTcpPort?: number;
  routerAddress?: string;
  localTcpPort?: number;
  localAddress?: string;
  timeoutDelay?: number;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  hideConsoleWarnings?: boolean;
}

export interface AppConfig {
  server: {
    protocol: 'ws' | 'ads';
    port: number;
    updateMs?: number;
    ads?: ADSServerConfig;
  };
  modules: ModuleConfig[];
}

export type Reading = {
  name: string;
  value: number;
  ts: number;       // epoch ms
  unit?: string;
  moduleId: number;
};

// Historical data query parameters
export interface QueryParams {
  name?: string;
  moduleId?: number;
  from?: number;    // timestamp in ms
  to?: number;      // timestamp in ms
  limit?: number;
  offset?: number;
}

// Historical data response
export interface HistoricalReading extends Reading {
  id: number;       // database primary key
}

// Export format options
export type ExportFormat = 'csv' | 'json';

// Historical storage interface
export interface HistoryService {
  saveReading(reading: Reading): Promise<void>;
  saveReadings(readings: Reading[]): Promise<void>;
  queryReadings(params: QueryParams): Promise<HistoricalReading[]>;
  exportData(params: QueryParams, format: ExportFormat): Promise<string>;
  cleanup(olderThanMs: number): Promise<number>; // returns deleted count
}
