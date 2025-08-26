import { AppConfig, Reading } from './types';
import { ModuleRunner } from './module';
import { SQLiteHistoryService } from './history';

export class Simulator {
  private timers: NodeJS.Timeout[] = [];
  private lastSnapshot: Map<string, Reading> = new Map();
  private subscribers: Array<(r: Reading[]) => void> = [];
  private historyService?: SQLiteHistoryService;

  constructor(private cfg: AppConfig, enableHistory: boolean = true) {
    if (enableHistory) {
      this.historyService = new SQLiteHistoryService();
      console.log('[Simulator] Historical data storage enabled');
    }
  }

  start() {
    this.stop();
    for (const m of this.cfg.modules) {
      const runner = new ModuleRunner(m);
      const period = m.updateMs ?? this.cfg.server.updateMs ?? 200;
      const timer = setInterval(async () => {
        const readings = runner.tick();
        readings.forEach(r => this.lastSnapshot.set(r.name, r)); // atomic replacement
        
        // Save to history if enabled
        if (this.historyService) {
          try {
            await this.historyService.saveReadings(readings);
          } catch (error) {
            console.error('[Simulator] Failed to save readings to history:', error);
          }
        }
        
        this.subscribers.forEach(fn => fn(readings));            // batch broadcast
      }, period);
      this.timers.push(timer);
    }
  }

  stop() {
    this.timers.forEach(timer => clearInterval(timer));
    this.timers = [];
  }

  onBatch(cb: (r: Reading[]) => void) {
    this.subscribers.push(cb);
  }

  snapshot(): Record<string, Omit<Reading,'name'>> {
    const out: Record<string, Omit<Reading,'name'>> = {};
    for (const [k, v] of this.lastSnapshot) {
      const result: Omit<Reading,'name'> = { 
        value: v.value, 
        ts: v.ts, 
        moduleId: v.moduleId 
      };
      if (v.unit !== undefined) {
        result.unit = v.unit;
      }
      out[k] = result;
    }
    return out;
  }

  // Get access to history service for API endpoints
  getHistoryService(): SQLiteHistoryService | undefined {
    return this.historyService;
  }

  // Get access to ADS adapter for API endpoints (will be set externally)
  private adsAdapter?: any;
  
  setAdsAdapter(adapter: any) {
    this.adsAdapter = adapter;
  }

  getAdsAdapter(): any {
    return this.adsAdapter;
  }

  // Cleanup old historical data (older than specified days)
  async cleanupHistory(days: number = 30): Promise<number> {
    if (!this.historyService) {
      throw new Error('History service not enabled');
    }
    
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    return this.historyService.cleanup(cutoffTime);
  }

  // Get historical data statistics
  async getHistoryStats() {
    if (!this.historyService) {
      throw new Error('History service not enabled');
    }
    
    return this.historyService.getStats();
  }
}
