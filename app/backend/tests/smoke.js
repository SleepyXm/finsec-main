import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  vus: 100,
  duration: '30s',
};

export default function () {
  const url = 'ws://localhost:9000/api/ws/stockdata?ticker_symbol=NQ=F&interval=1m';
  
  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      check(socket, { 'connected': () => true });
    });

    socket.on('message', (data) => {
      const msg = JSON.parse(data);
      check(msg, {
        'has data': (m) => m.type === 'historical' || m.time !== undefined || m.type === 'downloading',
      });
    });

    socket.setTimeout(() => socket.close(), 10000);
  });

  check(res, { 'status 101': (r) => r && r.status === 101 });
}