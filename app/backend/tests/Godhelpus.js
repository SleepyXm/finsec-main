import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  vus: 200,
  duration: '30s',
  summaryTrendStats: [
    "avg",
    "min",
    "med",
    "max",
    "p(90)",
    "p(95)",
    "p(99)",
  ],
};



export default function () {
  const url = 'ws://localhost:9000/api/ws/stockdata?ticker_symbol=NQ=F&interval=5m';
  
  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      check(socket, { 'connected': () => true });
    });

    socket.on('message', (data) => {
      const msg = JSON.parse(data);
      check(msg, {
        'has data': (m) => {
          if (m.type === 'historical') return Array.isArray(m.data) && m.data.length > 0;
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

    socket.setTimeout(() => socket.close(), 10000);
  });

  check(res, { 'status 101': (r) => r && r.status === 101 });
}