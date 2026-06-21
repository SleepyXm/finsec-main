import ws from 'k6/ws';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const payloadBytes  = new Trend('payload_bytes', false);
const chartMessages = new Counter('chart_messages');
const priceMessages = new Counter('price_messages');

export const options = {
  scenarios: {
    trading_day: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 250 },
        { duration: '20s', target: 1000 },
        { duration: '40s', target: 10000 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export default function () {
  const url = 'ws://localhost:9000/api/ws/compressed/stockdata?ticker_symbol=NQ=F&interval=5m';

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      check(socket, { 'connected': () => true });
    });

    socket.on('binaryMessage', (data) => {
      payloadBytes.add(data.byteLength);
      if (data.byteLength > 10000) chartMessages.add(1);
      else priceMessages.add(1);
    });
  });

  check(res, { 'status 101': (r) => r && r.status === 101 });
}