import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

// -----------------------------------------------------------------------
// Config — override via -e on the command line, e.g.
//   k6 run -e VU_COUNT=500 -e TEST_DURATION=30 load-test.js
// -----------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:9000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:9000';
const CORPUS_FILE = __ENV.CORPUS_FILE || './corpus.json';
const TEST_DURATION_S = parseInt(__ENV.TEST_DURATION || '30', 10); // seconds each conn stays open
const TRADE_INTERVAL_MS = parseInt(__ENV.TRADE_INTERVAL_MS || '1000', 10); // 1 trade/sec/user by default
const RAMP_WINDOW_S = parseInt(__ENV.RAMP_WINDOW_S || '10', 10); // stagger logins over this window instead of firing all at once

const TICKERS = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN'];

// -----------------------------------------------------------------------
// Users are already seeded (corpus.json) — load them instead of
// registering new accounts. We still log in fresh per VU rather than
// reusing the cached session.Cookie: those tokens are short-lived
// (Max-Age=900s in the corpus) and may well have expired between
// seeding and whenever this test actually runs.
//
// Assumes corpus.json is a single JSON array at the top level, shaped like:
//   [{ "id": "...", "seed": { "email": "...", "password": "...", ... }, ... }, ...]
// -----------------------------------------------------------------------
const users = new SharedArray('seeded-users', function () {
  const corpus = JSON.parse(open(CORPUS_FILE));
  return corpus.map((u) => ({
    email: u.seed.email,
    password: u.seed.password,
  }));
});

// Defaults to using every seeded user as one VU. Cap with VU_COUNT if you
// want to run a subset of the corpus.
const VU_COUNT = Math.min(
  parseInt(__ENV.VU_COUNT || String(users.length), 10),
  users.length
);

export const options = {
  // per-vu-iterations: each VU runs the default function exactly once.
  // Since each iteration blocks for TEST_DURATION_S (the socket stays open
  // and sends on an interval), VU count == concurrent users == target rps
  // when TRADE_INTERVAL_MS is 1000.
  scenarios: {
    trade_load: {
      executor: 'per-vu-iterations',
      vus: VU_COUNT,
      iterations: 1,
      maxDuration: `${TEST_DURATION_S + 15}s`,
    },

    // Alternative if you want k6 to enforce the aggregate rate strictly
    // (handles cases where logins/connects are slow and vus drift from
    // actually hitting N iterations/sec). Swap the executor above for this:
    //
    // trade_load: {
    //   executor: 'constant-arrival-rate',
    //   rate: VU_COUNT,
    //   timeUnit: '1s',
    //   duration: `${TEST_DURATION_S}s`,
    //   preAllocatedVUs: VU_COUNT,
    //   maxVUs: VU_COUNT * 2,
    // },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export function setup() {
  console.log(
    `loaded ${users.length} seeded users from ${CORPUS_FILE}, running with VU_COUNT=${VU_COUNT}`
  );
}

// -----------------------------------------------------------------------
// Default function — one per VU. Logs in as a deterministic seeded user,
// opens a single websocket, fires a trade every TRADE_INTERVAL_MS, and
// closes out any open position when the test window ends.
// -----------------------------------------------------------------------
export default function () {
  // Stagger login start times across RAMP_WINDOW_S so VU_COUNT VUs don't
  // all hit the login endpoint in the same instant — that's what was
  // causing the mass login failures / connection pileup.
  sleep(Math.random() * RAMP_WINDOW_S);

  const user = users[(exec.vu.idInTest - 1) % users.length];

  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (!check(loginRes, { 'login success': (r) => r.status === 200 })) {
    console.error(`login failed for ${user.email}: ${loginRes.status} ${loginRes.body}`);
    return;
  }
  const accessToken = loginRes.cookies.access_token[0].value;

  const openPositionIds = [];

  const res = ws.connect(
    `${WS_URL}/api/trade`,
    { headers: { Cookie: `access_token=${accessToken}` } },
    function (socket) {
      let tradeCount = 0;

      socket.on('open', () => {
        check(socket, { connected: () => true });

        // k6's ws Socket has no clearInterval — the interval naturally
        // stops once the socket closes below, so there's no handle to track.
        socket.setInterval(() => {
          const action = tradeCount % 2 === 0 ? 'buy' : 'sell';
          const ticker = TICKERS[tradeCount % TICKERS.length];
          socket.send(
            JSON.stringify({
              ticker,
              action,
              price: parseFloat((100 + Math.random() * 50).toFixed(2)),
              quantity: 1,
            })
          );
          tradeCount++;
        }, TRADE_INTERVAL_MS);

        // stop sending TEST_DURATION_S after open, then close
        socket.setTimeout(() => {
          socket.close();
        }, TEST_DURATION_S * 1000);
      });

      socket.on('message', (data) => {
        const msg = JSON.parse(data);
        check(msg, {
          'confirm received': (m) => m.trade_id !== undefined,
          'has position_id': (m) => m.status === 'error' || m.position_id !== undefined,
          'no error': (m) => m.status !== 'error',
          'flushed within 300ms': (m) => {
            const flushed = new Date(m.flushed_at).getTime();
            const queued = new Date(m.queued_at).getTime();
            return flushed - queued < 300;
          },
        });
        if (msg.status === 'open' && msg.position_id) {
          openPositionIds.push(msg.position_id);
        }
      });

      socket.on('error', (e) => {
        check(null, { 'no socket error': () => false });
        console.error(`ws error for ${user.email}: ${JSON.stringify(e)}`);
      });
    }
  );

  check(res, { 'status 101': (r) => r && r.status === 101 });

  // Clean up any positions this user opened during the run.
  openPositionIds.forEach((positionId) => {
    const closeRes = http.del(
      `${BASE_URL}/api/trade/${positionId}`,
      JSON.stringify({ exit_price: parseFloat((100 + Math.random() * 50).toFixed(2)) }),
      {
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${accessToken}`,
        },
      }
    );
    check(closeRes, { 'trade closed': (r) => r.status === 200 });
  });
}