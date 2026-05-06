import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 250,
  duration: '30s',
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

const BASE_URL = 'http://localhost:9000';
const TOKEN = 'your_jwt_token_here';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`,
};

export default function () {
  const openRes = http.post(`${BASE_URL}/api/trade`, JSON.stringify({
    ticker: 'MNQ=F',
    action: 'buy',
    quantity: 1,
    price: 21000.00,
  }), { headers });

  check(openRes, {
    'position opened': (r) => r.status === 200,
    'has position_id': (r) => JSON.parse(r.body).data?.position_id !== undefined,
  });

  const positionID = JSON.parse(openRes.body)?.data?.position_id;

  if (positionID) {
    const closeRes = http.del(`${BASE_URL}/api/trade/${positionID}`, JSON.stringify({
      exit_price: 21050.00,
      realised_pnl: 50.00,
    }), { headers });

    check(closeRes, {
      'position closed': (r) => r.status === 200,
      'pnl recorded': (r) => JSON.parse(r.body)?.data?.realised_pnl !== undefined,
    });
  }
}