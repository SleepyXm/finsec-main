import ws from 'k6/ws';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const historicalLatency = new Trend('historical_latency');

const tickers = [
  'NQ=F',
  'MNQ=F',
  '^FTSE',
  'GC=F',
  'BTC-USD',
];

const intervals = ['5m', '15m', '1h'];

export const options = {
  scenarios: {
    trading_day: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 200 },
        { duration: '30s', target: 600 },
        { duration: '45s', target: 1200 },
        { duration: '15s', target: 0 },
      ],
      gracefulStop: '10s',
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

export default function () {
  const ticker = tickers[Math.floor(Math.random() * tickers.length)];
  const interval = intervals[Math.floor(Math.random() * intervals.length)];

  const url = `ws://localhost:9000/api/ws/stockdata?ticker_symbol=${ticker}&interval=${interval}`;

  const start = Date.now();

  ws.connect(url, {}, function (socket) {
    let gotHistorical = false;

    socket.on('open', () => {
      check(socket, { connected: () => true });
    });

    socket.on('message', (data) => {
      const msg = JSON.parse(data);

      if (msg.type === 'historical' && !gotHistorical) {
        historicalLatency.add(Date.now() - start);
        gotHistorical = true;
      }

      check(msg, {
        'valid message': (m) =>
          m.type === 'historical' ||
          m.type === 'downloading' ||
          (m.ticker && typeof m.time === 'number'),
      });
    });

    // keep session stable long enough for streaming to exist
    socket.setTimeout(() => {
      socket.close();
    }, 8000);
  });
}