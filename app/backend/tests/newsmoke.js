import ws from 'k6/ws';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const payloadBytes  = new Trend('payload_bytes', false);
const chartMessages = new Counter('chart_messages');
const priceMessages = new Counter('price_messages');

export const options = {
  scenarios: {
    egress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10000 },  // ramp to 10K
        { duration: '60s', target: 10000 },  // hold — this is where you measure
        { duration: '10s', target: 0 },      // drain
      ],
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export default function () {
  const url = 'ws://localhost:9000/api/ws/stockdata?ticker_symbol=NQ=F&interval=1m';

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      check(socket, { 'connected': () => true });
    });

    socket.on('binaryMessage', (data) => {
      payloadBytes.add(data.byteLength);

      if (data.byteLength > 10000) chartMessages.add(1);
      else priceMessages.add(1);

      check(data, { 'received binary frame': (d) => d.byteLength > 0 });
    });

    socket.on('message', (data) => {
      check(null, { 'unexpected text frame': () => false });
    });

    socket.on('error', () => {
      check(null, { 'no socket error': () => false });
    });
  });

  check(res, { 'status 101': (r) => r && r.status === 101 });
}