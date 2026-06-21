import ws from 'k6/ws';
import { check } from 'k6';



const stages = [
  { duration: '10s', target: 1000  },  // stage 1 — trickle
  { duration: '40s', target: 10000 },  // stage 2 — sustained
];

export const options = {
  scenarios: {
    trading_day: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages,
      gracefulRampDown: '0s',
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
  const url = 'ws://localhost:9000/api/ws/stockdata?ticker_symbol=NQ=F&interval=5m';
  
  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      check(socket, { 'connected': () => true }); // once on open, fine
    });

    socket.on('message', (data) => {
      
      const msg = JSON.parse(data);
      check(msg, {
        'has data': (m) => {
          if (m.type === 'historical') return Array.isArray(m.data) && m.data.length > 0;
          if (m.type === 'chart') return typeof m.total_pages === 'number' && m.data !== undefined;
          if (m.type === 'downloading') return true;
          return (
            m.ticker !== undefined &&
            typeof m.time === 'number' && m.time > 0 &&
            typeof m.open === 'number' &&
            typeof m.high === 'number' &&
            typeof m.low === 'number' &&
            typeof m.close === 'number' &&
            typeof m.buy_price === 'number'
          );
        },
      });
    });
  });

  check(res, { 'status 101': (r) => r && r.status === 101 }); // once per VU after connect
}