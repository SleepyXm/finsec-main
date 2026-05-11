import ws from 'k6/ws';
import { check } from 'k6';
import http from 'k6/http';

export const options = {
  vus: 50,
  duration: '5s',
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const TICKERS = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN'];

export default function () {
  // Login first
  const loginRes = http.post(
    'http://localhost:9000/api/auth/login',
    JSON.stringify({ email: 'dave123@gmail.com', password: 'Thisisatest_123' }),
    { headers: { 'Content-Type': 'application/json', }, }
  );

  check(loginRes, { 'login success': (r) => r.status === 200, });

  const accessToken = loginRes.cookies.access_token[0].value;

  const url = 'ws://localhost:9000/api/trade';

  const res = ws.connect(
    url,
    {
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
    },
    function (socket) {
      const tradeIds = [];

      socket.on('open', () => {
        check(socket, { connected: () => true });

        let count = 0;

        const interval = socket.setInterval(() => {
          if (count >= 1) {
            socket.clearInterval(interval);

            socket.setTimeout(() => {
                socket.close();
            }, 2000);
            return;
          }

          const action = count % 2 === 0 ? 'buy' : 'sell';
          const ticker = TICKERS[count % TICKERS.length];

          socket.send(
            JSON.stringify({
              ticker,
              action,
              price: parseFloat((100 + Math.random() * 50).toFixed(2)),
              quantity: 1,
            })
          );

          count++;
        }, 20);
      });

      socket.on('message', (data) => {
        const msg = JSON.parse(data);

        check(msg, {
          'confirm received': (m) => m.trade_id !== undefined,
          'has position_id': (m) =>
            m.status === 'error' || m.position_id !== undefined,
          'no error': (m) => m.status !== 'error',
          'flushed within 300ms': (m) => {
            const flushed = new Date(m.flushed_at).getTime();
            const queued = new Date(m.queued_at).getTime();
            return flushed - queued < 300;
          },
        });

        if (msg.position_id) {
          tradeIds.push(msg.position_id);
        }
      });

      socket.on('error', () => {
        check(null, { 'no socket error': () => false });
      });

      socket.setTimeout(() => {
        tradeIds.forEach((positionId) => {
          const res = http.del(
            `http://localhost:9000/api/trade/${positionId}`,
            JSON.stringify({
              exit_price: parseFloat((100 + Math.random() * 50).toFixed(2)),
            }),
            {
              headers: {
                'Content-Type': 'application/json',
                Cookie: `access_token=${accessToken}`,
              },
            }
          );

          check(res, {
            'trade closed': (r) => r.status === 200,
          });
        });

        socket.close();
      }, 4500);
    }
  );

  check(res, {
    'status 101': (r) => r && r.status === 101,
  });
}