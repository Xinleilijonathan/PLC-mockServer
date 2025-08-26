 import { Simulator } from '../simulator';
import { Reading } from '../types';

// Import the ads-server library
const { StandAloneServer } = require('ads-server');

interface ADSConfig {
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

interface ADSSymbol {
  name: string;
  type: string;
  size: number;
  value: number;
  unit?: string;
  moduleId: number;
}

export class ADSAdapter {
  private server: any;
  private symbols: Map<string, ADSSymbol> = new Map();
  private isConnected = false;

  constructor(private sim: Simulator, private port: number, private config: ADSConfig) {
    this.initializeServer();
    this.subscribeToSimulator();
  }

  private initializeServer() {
    const serverConfig = {
      localAdsPort: this.config.localAdsPort || 30012,
      localAmsNetId: this.config.localAmsNetId || '192.168.1.100.1.1',
      routerTcpPort: this.config.routerTcpPort || 48898,
      routerAddress: this.config.routerAddress || 'localhost',
      localTcpPort: this.config.localTcpPort || 0, // automatic
      localAddress: this.config.localAddress || 'localhost',
      timeoutDelay: this.config.timeoutDelay || 2000,
      autoReconnect: this.config.autoReconnect !== false,
      reconnectInterval: this.config.reconnectInterval || 2000,
      hideConsoleWarnings: this.config.hideConsoleWarnings || false
    };

    console.log('[ADS] Initializing StandAlone ADS Server with config:', {
      localAdsPort: serverConfig.localAdsPort,
      localAmsNetId: serverConfig.localAmsNetId,
      routerTcpPort: serverConfig.routerTcpPort
    });

    this.server = new StandAloneServer(serverConfig);
  }

  private subscribeToSimulator() {
    // Subscribe to simulator updates to write sensor values to ADS symbols
    this.sim.onBatch((readings: Reading[]) => {
      if (this.isConnected) {
        // Register new symbols if they don't exist
        readings.forEach(reading => {
          if (!this.symbols.has(reading.name)) {
            this.registerSensorAsSymbol(reading);
          }
        });
        
        this.updateSymbolValues(readings);
      }
    });
  }

  private updateSymbolValues(readings: Reading[]) {
    readings.forEach(reading => {
      const symbol = this.symbols.get(reading.name);
      if (symbol) {
        try {
          // Update the symbol value in ADS server
          symbol.value = reading.value;
          
          // Write to ADS symbol (the exact API depends on ads-server implementation)
          // This is a placeholder - need to check the actual API
          if (this.server.writeSymbol) {
            this.server.writeSymbol(reading.name, reading.value);
          }
        } catch (error) {
          console.error(`[ADS] Failed to update symbol ${reading.name}:`, error);
        }
      }
    });
  }

  private setupCommandHandlers() {
    // Handle read requests
    this.server.onReadReq(async (req: any, res: any) => {
      try {
        console.log(`[ADS] Read request - IndexGroup: 0x${req.indexGroup.toString(16)}, IndexOffset: 0x${req.indexOffset.toString(16)}, Length: ${req.length}`);
        
        // For simplicity, we'll use indexGroup as a hash of sensor name
        // In a real implementation, you'd have a proper symbol table
        const symbolName = this.findSymbolByIndex(req.indexGroup, req.indexOffset);
        
        if (symbolName) {
          const symbol = this.symbols.get(symbolName);
          if (symbol) {
            // Convert float to buffer (little endian)
            const buffer = Buffer.alloc(4);
            buffer.writeFloatLE(symbol.value, 0);
            
            console.log(`[ADS] Responding with value ${symbol.value} for symbol ${symbolName}`);
            await res({ data: buffer });
          } else {
            await res({ error: 0x701 }); // ADS_E_SRVICE_NOT_SUPPORTED
          }
        } else {
          await res({ error: 0x710 }); // ADS_E_SYMBOL_NOT_FOUND
        }
      } catch (error) {
        console.error('[ADS] Error handling read request:', error);
        await res({ error: 0x700 }); // ADS_E_GENERIC
      }
    });

    // Handle write requests
    this.server.onWriteReq(async (req: any, res: any) => {
      try {
        console.log(`[ADS] Write request - IndexGroup: 0x${req.indexGroup.toString(16)}, IndexOffset: 0x${req.indexOffset.toString(16)}`);
        
        const symbolName = this.findSymbolByIndex(req.indexGroup, req.indexOffset);
        
        if (symbolName) {
          const symbol = this.symbols.get(symbolName);
          if (symbol) {
            // Read float from buffer (little endian)
            const newValue = req.data.readFloatLE(0);
            symbol.value = newValue;
            
            console.log(`[ADS] Updated symbol ${symbolName} to value ${newValue}`);
            await res({});
          } else {
            await res({ error: 0x701 }); // ADS_E_SRVICE_NOT_SUPPORTED
          }
        } else {
          await res({ error: 0x710 }); // ADS_E_SYMBOL_NOT_FOUND
        }
      } catch (error) {
        console.error('[ADS] Error handling write request:', error);
        await res({ error: 0x700 }); // ADS_E_GENERIC
      }
    });

    // Handle device info requests
    this.server.onReadDeviceInfo(async (req: any, res: any) => {
      console.log('[ADS] Device info request');
      await res({
        majorVersion: 1,
        minorVersion: 0,
        versionBuild: 0,
        deviceName: 'PLC-Simulator'
      });
    });

    console.log('[ADS] Command handlers set up');
  }

  private symbolIndexMap: Map<string, {indexGroup: number, indexOffset: number}> = new Map();

  private findSymbolByIndex(indexGroup: number, indexOffset: number): string | null {
    // Find symbol by exact IndexGroup/IndexOffset match
    for (const [name, indices] of this.symbolIndexMap) {
      if (indices.indexGroup === indexGroup && indices.indexOffset === indexOffset) {
        return name;
      }
    }
    return null;
  }

  private assignIndexToSymbol(symbolName: string): {indexGroup: number, indexOffset: number} {
    // Generate consistent IndexGroup/IndexOffset for each symbol
    // Using a simple hash for IndexGroup and incremental IndexOffset
    let hash = 0;
    for (let i = 0; i < symbolName.length; i++) {
      hash = ((hash << 5) - hash + symbolName.charCodeAt(i)) & 0xffffffff;
    }
    
    const indexGroup = Math.abs(hash) % 65536; // Keep it within 16-bit range
    const indexOffset = this.symbolIndexMap.size * 4; // 4 bytes per REAL
    
    const indices = { indexGroup, indexOffset };
    this.symbolIndexMap.set(symbolName, indices);
    
    console.log(`[ADS] Assigned symbol ${symbolName} -> IndexGroup: 0x${indexGroup.toString(16)}, IndexOffset: 0x${indexOffset.toString(16)}`);
    
    return indices;
  }

  public registerSensorAsSymbol(reading: Reading) {
    const symbolName = reading.name;
    
    if (!this.symbols.has(symbolName)) {
      const symbol: ADSSymbol = {
        name: symbolName,
        type: 'REAL', // 32-bit floating point
        size: 4,
        value: reading.value,
        moduleId: reading.moduleId
      };
      
      // Conditionally add unit if defined
      if (reading.unit !== undefined) {
        symbol.unit = reading.unit;
      }

      // Assign IndexGroup/IndexOffset to the symbol
      const indices = this.assignIndexToSymbol(symbolName);
      
      this.symbols.set(symbolName, symbol);

      console.log(`[ADS] Registered symbol: ${symbolName} (${symbol.type}, ${symbol.unit || 'no unit'}) at IndexGroup: 0x${indices.indexGroup.toString(16)}, IndexOffset: 0x${indices.indexOffset.toString(16)}`);
    }
  }

  public async start(): Promise<void> {
    try {
      console.log('[ADS] Starting ADS Server...');
      
      // Start listening for ADS connections
      await this.server.listen();
      this.isConnected = true;

      console.log(`[ADS] Server connected successfully on port ${this.port}`);
      console.log(`[ADS] Local AMS Net ID: ${this.config.localAmsNetId || '192.168.1.100.1.1'}`);
      console.log(`[ADS] Local ADS Port: ${this.config.localAdsPort || 30012}`);

      // Register all current sensors as symbols
      const currentSnapshot = this.sim.snapshot();
      Object.entries(currentSnapshot).forEach(([name, data]) => {
        const reading: Reading = {
          name,
          value: data.value,
          ts: data.ts,
          moduleId: data.moduleId
        };
        
        // Conditionally add unit if defined
        if (data.unit !== undefined) {
          reading.unit = data.unit;
        }
        this.registerSensorAsSymbol(reading);
      });

      console.log(`[ADS] Registered ${this.symbols.size} sensor symbols`);

      // Set up ADS command handlers
      this.setupCommandHandlers();

      // Set up event handlers
      this.server.on('error', (error: Error) => {
        console.error('[ADS] Server error:', error.message);
        this.isConnected = false;
      });

      this.server.on('close', () => {
        console.log('[ADS] Server closed');
        this.isConnected = false;
      });

    } catch (error) {
      console.error('[ADS] Failed to start ADS server:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.server && this.isConnected) {
      try {
        await this.server.close();
        console.log('[ADS] ADS Server stopped');
      } catch (error) {
        console.error('[ADS] Error stopping ADS server:', error);
      }
    }
  }

  public getStats() {
    return {
      isConnected: this.isConnected,
      symbolCount: this.symbols.size,
      symbols: Array.from(this.symbols.values()).map(s => {
        const indices = this.symbolIndexMap.get(s.name);
        return {
          name: s.name,
          type: s.type,
          value: s.value,
          unit: s.unit,
          moduleId: s.moduleId,
          indexGroup: indices ? `0x${indices.indexGroup.toString(16)}` : 'unknown',
          indexOffset: indices ? `0x${indices.indexOffset.toString(16)}` : 'unknown'
        };
      }),
      config: {
        localAdsPort: this.config.localAdsPort || 30012,
        localAmsNetId: this.config.localAmsNetId || '192.168.1.100.1.1'
      }
    };
  }
}

export async function startAdsServer(sim: Simulator, port: number, adsCfg: Record<string, unknown> | undefined) {
  try {
    console.log('[ADS] Initializing ADS adapter...');
    
    const adsConfig: ADSConfig = {
      localAdsPort: (adsCfg?.localAdsPort as number) || 30012,
      localAmsNetId: (adsCfg?.localAmsNetId as string) || '192.168.1.100.1.1',
      routerTcpPort: (adsCfg?.routerTcpPort as number) || 48898,
      routerAddress: (adsCfg?.routerAddress as string) || 'localhost',
      hideConsoleWarnings: (adsCfg?.hideConsoleWarnings as boolean) || false,
      autoReconnect: (adsCfg?.autoReconnect as boolean) !== false
    };

    const adsAdapter = new ADSAdapter(sim, port, adsConfig);
    await adsAdapter.start();

    return adsAdapter;
  } catch (error) {
    console.error('[ADS] Failed to start ADS server:', error);
    throw error;
  }
}
