import WebSocket from 'ws';

const url = process.env.PLC_WS ?? 'ws://localhost:8080/stream';
const ws = new WebSocket(url);

ws.on('open', () => console.log('Connected to', url));
ws.on('message', (buf) => {
  const msg = JSON.parse(buf.toString());
  if (msg.type === 'batch') {
    const line = msg.data.map((r: any) => `${r.name}=${r.value.toFixed(3)}`).join('  ');
    console.log(new Date(msg.data[0].ts).toISOString(), line);
  } else if (msg.type === 'snapshot') {
    console.log('Initial snapshot received with', Object.keys(msg.data).length, 'sensors');
  }
});

ws.on('close', () => console.log('Connection closed'));
ws.on('error', (err) => console.error('WebSocket error:', err.message));
