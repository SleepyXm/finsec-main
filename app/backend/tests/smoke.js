import ws from 'k6/ws';
import { check } from 'k6';
import { inflate } from './pako.min.js';

export const options = {
  scenarios: {
    trading_day: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 250 },   // trickle
        { duration: '20s', target: 1000 },  // market open rush
        { duration: '40s', target: 10000 },  // sustained
        { duration: '10s', target: 0 },    // close
      ],
    },
  },
  summaryTrendStats: [
    "avg",
    "min",
    "med",
    "max",
    "p(90)",
    "p(95)",
    "p(99)"
  ],
};

function decompress(buffer) {
  // Python wrote gzip frames, pako.inflate with windowBits 31 handles gzip
  return inflate(new Uint8Array(buffer), { to: 'string', windowBits: 31 });
}

function validateMsg(msg) {
  if (msg.type === 'historical')  return Array.isArray(msg.data) && msg.data.length > 0;
  if (msg.type === 'downloading') return true;
  return (
    msg.ticker !== undefined &&
    typeof msg.time     === 'number' && msg.time > 0 &&
    typeof msg.open     === 'number' &&
    typeof msg.high     === 'number' &&
    typeof msg.low      === 'number' &&
    typeof msg.close    === 'number' &&
    typeof msg.buy_price === 'number'
  );
}

export default function () {
  const url = 'ws://localhost:9000/api/ws/stockdata?ticker_symbol=NQ=F&interval=5m';

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      check(socket, { 'connected': () => true });
    });

    socket.on('binaryMessage', (data) => {
      let msg;
      try {
        msg = JSON.parse(decompress(data));
      } catch (e) {
        check(null, { 'decompression ok': () => false });
        return;
      }
      check(msg, { 'has data': validateMsg });
    });

    // keep the text handler as a safety net during rollout
    socket.on('message', (data) => {
      check(JSON.parse(data), { 'has data (text frame)': validateMsg });
    });

    socket.on('error', (e) => {
      check(null, { 'no socket error': () => false });
    });
  });

  check(res, { 'status 101': (r) => r && r.status === 101 });
}
