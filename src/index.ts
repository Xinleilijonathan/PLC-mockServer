import { loadConfig } from './config';
import { Simulator } from './simulator';
import { startWsServer } from './transport/wsAdapter';
import { startAdsServer } from './transport/adsAdapter';

async function main() {
  try {
    const cfgPath = process.env.PLC_CONFIG ?? 'config/example.yaml';
    const cfg = loadConfig(cfgPath);

    console.log(`[Main] Starting PLC Simulator with ${cfg.server.protocol.toUpperCase()} protocol`);
    console.log(`[Main] Configuration: ${cfgPath}`);
    console.log(`[Main] Modules: ${cfg.modules.length}, Total sensors: ${cfg.modules.reduce((acc, m) => acc + m.sensors.length, 0)}`);

    const sim = new Simulator(cfg);
    sim.start();

    if (cfg.server.protocol === 'ws') {
      startWsServer(sim, cfg.server.port);
    } else if (cfg.server.protocol === 'ads') {
      console.log('[Main] Starting ADS protocol server...');
      const adsAdapter = await startAdsServer(sim, cfg.server.port, cfg.server.ads as Record<string, unknown> | undefined);
      
      // Set the ADS adapter reference in simulator for API access
      sim.setAdsAdapter(adsAdapter);
      
      console.log('[Main] ADS server started successfully');
    } else {
      throw new Error(`Unsupported protocol: ${cfg.server.protocol}`);
    }

    console.log(`[Main] PLC Simulator is running on port ${cfg.server.port}`);

    // Graceful shutdown handling
    process.on('SIGINT', async () => {
      console.log('\n[Main] Received SIGINT, shutting down gracefully...');
      
      try {
        sim.stop();
        
        if (cfg.server.protocol === 'ads') {
          const adsAdapter = sim.getAdsAdapter();
          if (adsAdapter) {
            await adsAdapter.stop();
          }
        }
        
        console.log('[Main] Shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('[Main] Error during shutdown:', error);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('[Main] Failed to start PLC Simulator:', error);
    process.exit(1);
  }
}

// Start the application
main().catch(error => {
  console.error('[Main] Unhandled error:', error);
  process.exit(1);
});
