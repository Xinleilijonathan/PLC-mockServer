# Modular PLC Sensor Simulator

This project implements a **mock PLC server** as described in the requirements document.  
It is designed to simulate configurable modules, each with exactly three sensors, producing real-time waveforms that can be consumed via HTTP and WebSocket APIs.

---

## Requirements Coverage

- **Configurable number of modules (N)** via YAML/JSON config
- **Exactly 3 sensors per module**
- **Sensor waveforms implemented**:
  - Sinusoidal
  - Noisy sinusoidal
  - Square wave
- **Configurable parameters**:
  - Amplitude
  - Frequency
  - Phase
  - DC offset
  - Noise standard deviation (for noisy sinusoidal)
  - Units
- **Thread-safe real-time updates** with timestamps
- **Central scheduler** broadcasting batched updates
- **Configurable update rates per module** (default + override)
- **Transport support**:
  - WebSocket (default)
  - REST/HTTP
  - **ADS Protocol (Automation Device Specification)**
- **Historical data storage**:
  - SQLite database with automatic schema creation
  - Real-time data persistence
  - Query API with flexible filtering
  - CSV/JSON export functionality
  - Data cleanup and statistics
- **Deliverables included**:
  - Full source code
  - Example configs (1, 2, and 5 modules)
  - Demo client
  - Simple dashboard
  - README
  - Time log

---

## Project Structure

```

src/
types.ts         # Type definitions
config.ts        # Config loader + validation
sensor.ts        # Sensor algorithms
module.ts        # Module runner
simulator.ts     # Scheduler and orchestrator
index.ts         # Application entry point
demo-client.ts   # WebSocket demo client
transport/
wsAdapter.ts   # WebSocket + REST API
adsAdapter.ts  # ADS adapter placeholder

config/
example.yaml     # 1 module, 3 sensors
two-modules.yaml # 2 modules, 6 sensors
five-modules.yaml# 5 modules, 15 sensors

public/
index.html       # Real-time dashboard

````

---

## Installation & Run

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build & run compiled version
npm run build
npm start
````

---

## Configuration

Example (`config/example.yaml`):

```yaml
server:
  protocol: ws
  port: 8080
  updateMs: 200

modules:
  - id: 1
    updateMs: 150
    sensors:
      - name: Module1_Sensor1
        type: sinusoidal
        amplitude: 5
        frequency: 0.1
        phase: 0
        dcOffset: 10
        unit: "psi"
      - name: Module1_Sensor2
        type: noisy_sinusoidal
        amplitude: 3
        frequency: 0.2
        phase: 1.57
        dcOffset: 20
        noiseStd: 0.3
        unit: "°C"
      - name: Module1_Sensor3
        type: square_wave
        amplitude: 2
        frequency: 0.05
        phase: 0
        dcOffset: 5
        unit: "V"
```

Run with multiple configs:

```bash
PLC_CONFIG=config/two-modules.yaml npm run dev
PLC_CONFIG=config/five-modules.yaml npm run dev

# ADS Protocol Mode (PowerShell)
$env:PLC_CONFIG="config/ads-example.yaml"; npm run dev

# ADS Protocol Mode (Linux/macOS)
PLC_CONFIG=config/ads-example.yaml npm run dev
```

---

## API

### REST Endpoints

* `GET /health` → `{ "ok": true }`
* `GET /metrics` → Latest snapshot of all sensors:

  ```json
  {
    "Module1_Sensor1": { "value": 14.99, "ts": 1693053800000, "unit": "psi", "moduleId": 1 },
    "Module1_Sensor2": { "value": 19.02, "ts": 1693053800000, "unit": "°C", "moduleId": 1 },
    "Module1_Sensor3": { "value": 7.00, "ts": 1693053800000, "unit": "V", "moduleId": 1 }
  }
  ```

### Historical Data Endpoints

* `GET /history/stats` → Statistics about stored historical data:

  ```json
  {
    "totalReadings": 1205,
    "oldestReading": 1693053800000,
    "newestReading": 1693057400000,
    "uniqueSensors": 3
  }
  ```

* `GET /history/query` → Query historical sensor data with optional filters:
  - **Parameters**: `name`, `moduleId`, `from`, `to`, `limit`, `offset`
  - **Example**: `/history/query?name=Module1_Sensor1&limit=100&from=1693053800000`

  ```json
  {
    "data": [
      {"id": 1205, "name": "Module1_Sensor1", "value": 14.99, "ts": 1693057400000, "unit": "psi", "moduleId": 1},
      {"id": 1204, "name": "Module1_Sensor1", "value": 14.87, "ts": 1693057399800, "unit": "psi", "moduleId": 1}
    ],
    "count": 2,
    "params": {"name": "Module1_Sensor1", "limit": 100}
  }
  ```

* `GET /history/export.csv` → Export historical data as CSV file
  - **Parameters**: Same as query endpoint
  - **Example**: `/history/export.csv?name=Module1_Sensor1&from=1693053800000`

* `GET /history/export.json` → Export historical data as JSON file
  - **Parameters**: Same as query endpoint

* `POST /history/cleanup` → Cleanup old historical data
  - **Body**: `{"days": 30}` (delete data older than 30 days)

### ADS Protocol Endpoints

* `GET /ads/status` → ADS server status and configuration:

  ```json
  {
    "isConnected": true,
    "symbolCount": 3,
    "symbols": [
      {"name": "PLC.Module1.Pressure", "type": "REAL", "value": 14.99, "unit": "bar", "moduleId": 1},
      {"name": "PLC.Module1.Temperature", "type": "REAL", "value": 19.02, "unit": "°C", "moduleId": 1},
      {"name": "PLC.Module1.Voltage", "type": "REAL", "value": 7.00, "unit": "V", "moduleId": 1}
    ],
    "config": {
      "localAdsPort": 30012,
      "localAmsNetId": "192.168.1.100.1.1"
    }
  }
  ```

* `GET /ads/symbols` → List all available ADS symbols

**ADS Server Configuration:**
- **Protocol**: ADS (Automation Device Specification)
- **TCP Port**: 48898 (standard ADS port)
- **AMS Net ID**: 192.168.1.100.1.1
- **ADS Port**: 30012
- **Server Type**: StandAlone (no TwinCAT installation required)

**Supported ADS Commands:**
- `ADS Read`: Read sensor values by IndexGroup/IndexOffset
- `ADS Write`: Write sensor values (updates simulation)
- `ADS Device Info`: Get simulator device information
- Real-time data updates according to waveform algorithms

### WebSocket

* Connect to: `ws://localhost:8080/stream`
* On connect → receive **snapshot** of current values
* On update → receive **batch** messages:

  ```json
  {
    "type": "batch",
    "data": [
      { "name": "Module1_Sensor1", "value": 14.9, "ts": 1693053800000, "unit": "psi", "moduleId": 1 },
      { "name": "Module1_Sensor2", "value": 19.0, "ts": 1693053800000, "unit": "°C", "moduleId": 1 },
      { "name": "Module1_Sensor3", "value": 7.0,  "ts": 1693053800000, "unit": "V",   "moduleId": 1 }
    ]
  }
  ```

---

## Demo

### WebSocket Client

```bash
npm run demo
```

### Historical Data Demo

```bash
npm run demo:history
```

### ADS Protocol Demo

```bash
npm run demo:ads
```

Example output:

```
Connected to ws://localhost:8080/stream
Initial snapshot received with 3 sensors
2025-08-26T17:30:26.287Z Module1_Sensor1=14.998  Module1_Sensor2=17.297  Module1_Sensor3=7.000
...
```

### Dashboard

Open in browser:

```
http://localhost:8080/
```

A live HTML dashboard displays sensor data in real time.

---

## Extensibility

* **ADS protocol** → Implement in `adsAdapter.ts`
* **New sensors** → Add new class in `sensor.ts` and update factory
* **Historical storage** → Add DB writer in `Simulator.onBatch`
* **Export** → Provide `GET /export.csv` for batch download

---

## Docker Containerization

The project includes complete Docker support with multi-configuration options and production-ready setup.

### Quick Start

```bash
# Build and run with default configuration
docker-compose up --build

# Run with different configurations
PLC_CONFIG=config/two-modules.yaml docker-compose up

# Run multiple instances with different configs
docker-compose --profile multi-config up
```

### Docker Files

- **Dockerfile**: Multi-stage build with security best practices
- **docker-compose.yml**: Environment-based configuration with profiles
- **nginx.conf**: Production reverse proxy with rate limiting
- **env.example**: Environment variable template

### Environment Configuration

Create a `.env` file from `env.example`:

```bash
cp env.example .env
```

Available environment variables:

```bash
# Application
NODE_ENV=production
PLC_CONFIG=config/example.yaml

# Ports
PLC_PORT=8080
NGINX_PORT=80

```

### Docker Compose Profiles

**Default**: Basic PLC simulator
```bash
docker-compose up
```

**Production**: With Nginx reverse proxy
```bash
docker-compose --profile production up
```

**Multi-config**: Run multiple instances
```bash
docker-compose --profile multi-config up
# Runs on ports 8080, 8081, 8082 with different configs
```

### Manual Docker Commands

```bash
# Build image
docker build -t plc-simulator .

# Run single container
docker run -d \
  --name plc-simulator \
  -p 8080:8080 \
  -e PLC_CONFIG=config/example.yaml \
  plc-simulator

# Run with custom config volume
docker run -d \
  --name plc-simulator \
  -p 8080:8080 \
  -v $(pwd)/config:/app/config:ro \
  -e PLC_CONFIG=config/two-modules.yaml \
  plc-simulator
```

### Health Checks

All containers include health checks:

```bash
# Check container health
docker ps
docker inspect plc-simulator | grep Health -A 10
```

### Production Deployment

For production use with Nginx:

```bash
# Start with production profile
docker-compose --profile production up -d

# Access via Nginx (port 80)
curl http://localhost/health
curl http://localhost/metrics

# WebSocket through Nginx
# ws://localhost/stream
```

---

## Time Log

Approximate breakdown of the ~3 hours spent:

- Requirement review & design planning: **0.4h**  
- Project setup & scaffolding (TypeScript, deps, structure): **0.3h**  
- Sensor & module implementation (3 sensor types, module runner): **0.7h**  
- Simulator & transport (scheduler, REST + WebSocket): **0.6h**  
- Config system (YAML/JSON, validation): **0.3h**  
- Demo client & dashboard: **0.5h**  
- Documentation (README, time log): **0.2h**  

**Total: ~3.0h**

---

## License

MIT License © 2025 Xinlei Li

```
