import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { Simulator } from '../simulator';
import { QueryParams } from '../types';

export function startWsServer(sim: Simulator, port: number) {
  const app = express();

  // Parse JSON bodies
  app.use(express.json());
  
  // Static files (optional Dashboard)
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Basic endpoints
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/metrics', (_req, res) => res.json(sim.snapshot())); // pull once

  // Historical data endpoints
  app.get('/history/stats', async (_req, res) => {
    try {
      const historyService = sim.getHistoryService();
      if (!historyService) {
        return res.status(404).json({ error: 'Historical data not enabled' });
      }
      
      const stats = await sim.getHistoryStats();
      res.json(stats);
    } catch (error) {
      console.error('Failed to get history stats:', error);
      res.status(500).json({ error: 'Failed to get history statistics' });
    }
  });

  app.get('/history/query', async (req, res) => {
    try {
      const historyService = sim.getHistoryService();
      if (!historyService) {
        return res.status(404).json({ error: 'Historical data not enabled' });
      }

      // Parse query parameters
      const params: QueryParams = {};
      
      if (req.query.name && typeof req.query.name === 'string') {
        params.name = req.query.name;
      }
      
      if (req.query.moduleId) {
        const moduleId = parseInt(req.query.moduleId as string);
        if (!isNaN(moduleId)) params.moduleId = moduleId;
      }
      
      if (req.query.from) {
        const from = parseInt(req.query.from as string);
        if (!isNaN(from)) params.from = from;
      }
      
      if (req.query.to) {
        const to = parseInt(req.query.to as string);
        if (!isNaN(to)) params.to = to;
      }
      
      if (req.query.limit) {
        const limit = parseInt(req.query.limit as string);
        if (!isNaN(limit) && limit > 0) params.limit = Math.min(limit, 10000); // Cap at 10k
      }
      
      if (req.query.offset) {
        const offset = parseInt(req.query.offset as string);
        if (!isNaN(offset) && offset >= 0) params.offset = offset;
      }

      const readings = await historyService.queryReadings(params);
      res.json({
        data: readings,
        count: readings.length,
        params: params
      });
    } catch (error) {
      console.error('Failed to query history:', error);
      res.status(500).json({ error: 'Failed to query historical data' });
    }
  });

  app.get('/history/export.csv', async (req, res) => {
    try {
      const historyService = sim.getHistoryService();
      if (!historyService) {
        return res.status(404).json({ error: 'Historical data not enabled' });
      }

      // Parse query parameters (same as query endpoint)
      const params: QueryParams = {};
      
      if (req.query.name && typeof req.query.name === 'string') {
        params.name = req.query.name;
      }
      
      if (req.query.moduleId) {
        const moduleId = parseInt(req.query.moduleId as string);
        if (!isNaN(moduleId)) params.moduleId = moduleId;
      }
      
      if (req.query.from) {
        const from = parseInt(req.query.from as string);
        if (!isNaN(from)) params.from = from;
      }
      
      if (req.query.to) {
        const to = parseInt(req.query.to as string);
        if (!isNaN(to)) params.to = to;
      }
      
      // Limit export to reasonable size
      params.limit = Math.min(parseInt(req.query.limit as string) || 50000, 50000);

      const csvData = await historyService.exportData(params, 'csv');
      
      // Set headers for CSV download
      const filename = `sensor_data_${Date.now()}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvData);
    } catch (error) {
      console.error('Failed to export history:', error);
      res.status(500).json({ error: 'Failed to export historical data' });
    }
  });

  app.get('/history/export.json', async (req, res) => {
    try {
      const historyService = sim.getHistoryService();
      if (!historyService) {
        return res.status(404).json({ error: 'Historical data not enabled' });
      }

      // Parse query parameters (same as query endpoint)
      const params: QueryParams = {};
      
      if (req.query.name && typeof req.query.name === 'string') {
        params.name = req.query.name;
      }
      
      if (req.query.moduleId) {
        const moduleId = parseInt(req.query.moduleId as string);
        if (!isNaN(moduleId)) params.moduleId = moduleId;
      }
      
      if (req.query.from) {
        const from = parseInt(req.query.from as string);
        if (!isNaN(from)) params.from = from;
      }
      
      if (req.query.to) {
        const to = parseInt(req.query.to as string);
        if (!isNaN(to)) params.to = to;
      }
      
      // Limit export to reasonable size
      params.limit = Math.min(parseInt(req.query.limit as string) || 10000, 10000);

      const jsonData = await historyService.exportData(params, 'json');
      
      // Set headers for JSON download
      const filename = `sensor_data_${Date.now()}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(jsonData);
    } catch (error) {
      console.error('Failed to export history:', error);
      res.status(500).json({ error: 'Failed to export historical data' });
    }
  });

  app.post('/history/cleanup', async (req, res) => {
    try {
      const historyService = sim.getHistoryService();
      if (!historyService) {
        return res.status(404).json({ error: 'Historical data not enabled' });
      }

      const days = req.body.days || 30;
      if (typeof days !== 'number' || days < 1) {
        return res.status(400).json({ error: 'Invalid days parameter' });
      }

      const deletedCount = await sim.cleanupHistory(days);
      res.json({ 
        message: `Cleaned up historical data older than ${days} days`,
        deletedCount: deletedCount 
      });
    } catch (error) {
      console.error('Failed to cleanup history:', error);
      res.status(500).json({ error: 'Failed to cleanup historical data' });
    }
  });

  // ADS protocol endpoints
  app.get('/ads/status', async (_req, res) => {
    try {
      const adsAdapter = sim.getAdsAdapter();
      if (!adsAdapter) {
        return res.status(404).json({ error: 'ADS protocol not enabled' });
      }

      const stats = adsAdapter.getStats();
      res.json(stats);
    } catch (error) {
      console.error('Failed to get ADS status:', error);
      res.status(500).json({ error: 'Failed to get ADS status' });
    }
  });

  app.get('/ads/symbols', async (_req, res) => {
    try {
      const adsAdapter = sim.getAdsAdapter();
      if (!adsAdapter) {
        return res.status(404).json({ error: 'ADS protocol not enabled' });
      }

      const stats = adsAdapter.getStats();
      res.json({
        symbolCount: stats.symbolCount,
        symbols: stats.symbols
      });
    } catch (error) {
      console.error('Failed to get ADS symbols:', error);
      res.status(500).json({ error: 'Failed to get ADS symbols' });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/stream' });

  wss.on('connection', ws => {
    ws.send(JSON.stringify({ type: 'snapshot', data: sim.snapshot() }));
    const send = (batch: any) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'batch', data: batch }));
    };
    sim.onBatch(send);
  });

  server.listen(port, () => console.log(`[ws] listening on :${port}`));
  return server;
}
