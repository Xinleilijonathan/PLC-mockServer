import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { Reading, HistoricalReading, QueryParams, ExportFormat, HistoryService } from './types';

export class SQLiteHistoryService implements HistoryService {
  private db: sqlite3.Database;
  private isInitialized = false;

  constructor(private dbPath: string = 'data/history.db') {
    // Ensure data directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new sqlite3.Database(this.dbPath);
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS sensor_readings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          value REAL NOT NULL,
          ts INTEGER NOT NULL,
          unit TEXT,
          moduleId INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      this.db.run(createTableSQL, (err) => {
        if (err) {
          console.error('Failed to create sensor_readings table:', err);
          reject(err);
          return;
        }

        // Create indexes for better query performance
        const createIndexes = [
          'CREATE INDEX IF NOT EXISTS idx_sensor_name ON sensor_readings(name)',
          'CREATE INDEX IF NOT EXISTS idx_sensor_ts ON sensor_readings(ts)',
          'CREATE INDEX IF NOT EXISTS idx_sensor_module ON sensor_readings(moduleId)',
          'CREATE INDEX IF NOT EXISTS idx_sensor_name_ts ON sensor_readings(name, ts)'
        ];

        let completed = 0;
        createIndexes.forEach(indexSQL => {
          this.db.run(indexSQL, (err) => {
            if (err) console.warn('Failed to create index:', err);
            completed++;
            if (completed === createIndexes.length) {
              this.isInitialized = true;
              console.log('[History] SQLite database initialized successfully');
              resolve();
            }
          });
        });
      });
    });
  }

  async saveReading(reading: Reading): Promise<void> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO sensor_readings (name, value, ts, unit, moduleId)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        reading.name,
        reading.value,
        reading.ts,
        reading.unit || null,
        reading.moduleId
      ], function(err) {
        if (err) {
          console.error('Failed to save reading:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async saveReadings(readings: Reading[]): Promise<void> {
    await this.initialize();
    
    if (readings.length === 0) return;

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO sensor_readings (name, value, ts, unit, moduleId)
        VALUES (?, ?, ?, ?, ?)
      `;

      const stmt = this.db.prepare(sql);
      
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        readings.forEach(reading => {
          stmt.run([
            reading.name,
            reading.value,
            reading.ts,
            reading.unit || null,
            reading.moduleId
          ]);
        });
        
        this.db.run('COMMIT', (err) => {
          stmt.finalize();
          if (err) {
            console.error('Failed to save readings batch:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  async queryReadings(params: QueryParams): Promise<HistoricalReading[]> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM sensor_readings WHERE 1=1';
      const sqlParams: any[] = [];

      // Build WHERE clause
      if (params.name) {
        sql += ' AND name = ?';
        sqlParams.push(params.name);
      }
      
      if (params.moduleId !== undefined) {
        sql += ' AND moduleId = ?';
        sqlParams.push(params.moduleId);
      }
      
      if (params.from) {
        sql += ' AND ts >= ?';
        sqlParams.push(params.from);
      }
      
      if (params.to) {
        sql += ' AND ts <= ?';
        sqlParams.push(params.to);
      }

      // Order by timestamp (newest first)
      sql += ' ORDER BY ts DESC';

      // Add LIMIT and OFFSET
      if (params.limit) {
        sql += ' LIMIT ?';
        sqlParams.push(params.limit);
        
        if (params.offset) {
          sql += ' OFFSET ?';
          sqlParams.push(params.offset);
        }
      }

      this.db.all(sql, sqlParams, (err, rows: any[]) => {
        if (err) {
          console.error('Failed to query readings:', err);
          reject(err);
        } else {
          const readings: HistoricalReading[] = rows.map(row => ({
            id: row.id,
            name: row.name,
            value: row.value,
            ts: row.ts,
            unit: row.unit,
            moduleId: row.moduleId
          }));
          resolve(readings);
        }
      });
    });
  }

  async exportData(params: QueryParams, format: ExportFormat): Promise<string> {
    const readings = await this.queryReadings(params);
    
    if (format === 'json') {
      return JSON.stringify(readings, null, 2);
    }
    
    if (format === 'csv') {
      if (readings.length === 0) {
        return 'id,name,value,timestamp,unit,moduleId,datetime\n';
      }
      
      const headers = 'id,name,value,timestamp,unit,moduleId,datetime\n';
      const rows = readings.map(r => {
        const datetime = new Date(r.ts).toISOString();
        return `${r.id},"${r.name}",${r.value},${r.ts},"${r.unit || ''}",${r.moduleId},"${datetime}"`;
      }).join('\n');
      
      return headers + rows;
    }
    
    throw new Error(`Unsupported export format: ${format}`);
  }

  async cleanup(olderThanMs: number): Promise<number> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM sensor_readings WHERE ts < ?';
      
      this.db.run(sql, [olderThanMs], function(err) {
        if (err) {
          console.error('Failed to cleanup old readings:', err);
          reject(err);
        } else {
          console.log(`[History] Cleaned up ${this.changes} old readings`);
          resolve(this.changes);
        }
      });
    });
  }

  // Get statistics about stored data
  async getStats(): Promise<{
    totalReadings: number;
    oldestReading: number | null;
    newestReading: number | null;
    uniqueSensors: number;
  }> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as totalReadings,
          MIN(ts) as oldestReading,
          MAX(ts) as newestReading,
          COUNT(DISTINCT name) as uniqueSensors
        FROM sensor_readings
      `;
      
      this.db.get(sql, (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            totalReadings: row.totalReadings,
            oldestReading: row.oldestReading,
            newestReading: row.newestReading,
            uniqueSensors: row.uniqueSensors
          });
        }
      });
    });
  }

  // Close database connection
  close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        }
        resolve();
      });
    });
  }
}
