import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { Trend, Rate } from 'k6/metrics';

// ── WHY THESE NUMBERS ────────────────────────────────────────────────
// Your old test only ever had a ramp-up immediately followed by a
// ramp-down (connect ramp == trade duration == 30s), so concurrency
// was a triangle that touched 1000 for an instant and never held it.
// That's why "1000 req/s" was only ever true as an average, never as
// a sustained rate.
//
// This version makes WS_CONNECT_RAMP_S < TEST_DURATION_S on purpose,
// so there's a real flat window where all VU_COUNT VUs are connected
// and trading at the same time. With the defaults below:
//   t=0–30s   : ramp up, VUs connecting (staggered)
//   t=30–90s  : PLATEAU — all 1000 VUs connected, each sending 1/sec
//               => 1000 req/s sustained for 60 real seconds, not a peak
//   t=90–120s : ramp down, VUs finishing and disconnecting
//
// TRADE_INTERVAL_MS=1000 is deliberate: 1000 VUs × 1 send/sec = 1000/s
// during the plateau. If you want to test 2000/s sustained, drop this
// to 500ms — but know that your last run at 500ms already pushed
// position_write_ms p99 from 158ms to 752ms and failed its threshold,
// so that's a different, harder test. This script does not lower or
// hide that threshold — if your backend can't hold 1000/s, this will
// fail loudly, same as before.
//
// Do not trust any human or LLM's summary of whether this hit 1000/s.
// Verify it yourself from the raw output — see the bottom of this file.
// ─────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:9000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:9000';
const CORPUS_FILE = __ENV.CORPUS_FILE || './corpus.json';

// Length of the per-VU trading window. Must be > WS_CONNECT_RAMP_S to
// produce a real plateau (see comment block above). Default gives a
// 60s flat measurement window.
const TEST_DURATION_S = parseInt(__ENV.TEST_DURATION || '90', 10);

// 1 send/sec/VU. With VU_COUNT=1000 this targets exactly 1000 req/s
// during the plateau. Change deliberately, not by accident.
const TRADE_INTERVAL_MS = parseInt(__ENV.TRADE_INTERVAL_MS || '1000', 10);

const NUM_TRADES = parseInt(
  __ENV.NUM_TRADES || String(Math.floor((TEST_DURATION_S * 1000) / TRADE_INTERVAL_MS)),
  10
);

const SAFETY_TIMEOUT_MS = NUM_TRADES * TRADE_INTERVAL_MS + 10000;

const positionWriteMs = new Trend('position_write_ms', true);
const positionDeleteMs = new Trend('position_delete_ms', true);

const positionWriteOk = new Rate('position_write_ok');
const positionDeleteOk = new Rate('position_delete_ok');

const safetyTimeoutHit = new Rate('safety_timeout_hit');

// Connect ramp MUST stay shorter than TEST_DURATION_S or you're back
// to a pure triangle with no plateau. Default 30s.
const WS_CONNECT_RAMP_S = parseInt(__ENV.WS_CONNECT_RAMP || '30', 10);

const MAX_DURATION_S =
  WS_CONNECT_RAMP_S +
  TEST_DURATION_S +
  parseInt(__ENV.CLEANUP_WINDOW || '45', 10);

const SETUP_TIMEOUT = __ENV.SETUP_TIMEOUT || '10m';

const TICKERS = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN'];

const users = new SharedArray('seeded-users', function () {
  const corpus = JSON.parse(open(CORPUS_FILE));
  return corpus.map((u) => ({
    email: u.seed.email,
    password: u.seed.password,
  }));
});

const VU_COUNT = Math.min(
  parseInt(__ENV.VU_COUNT || String(users.length), 10),
  users.length
);

export const options = {
  setupTimeout: SETUP_TIMEOUT,

  scenarios: {
    trade_load: {
      executor: 'per-vu-iterations',
      vus: VU_COUNT,
      iterations: 1,
      maxDuration: `${MAX_DURATION_S}s`,
      gracefulStop: '50s',
    },
  },

  summaryTrendStats: [
    'avg',
    'min',
    'med',
    'max',
    'p(90)',
    'p(95)',
    'p(99)',
    'p(99.9)',
  ],

  // Left intact on purpose. If your backend can't hold 1000/s, these
  // should fail. Don't loosen them to make the run look clean.
  thresholds: {
    position_write_ms: ['p(99)<300'],
    position_delete_ms: ['p(99)<1000'],
    position_write_ok: ['rate>0.99'],
    position_delete_ok: ['rate>0.99'],
    safety_timeout_hit: ['rate<0.01'],
  },
};

export function setup() {
  console.log(
    `loaded ${users.length} seeded users from ${CORPUS_FILE}, logging in VU_COUNT=${VU_COUNT}`
  );

  const sessions = [];

  for (let i = 0; i < VU_COUNT; i++) {
    const user = users[i];

    const loginRes = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({
        email: user.email,
        password: user.password,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
        tags: { name: 'Login' },
      }
    );

    const cookie =
      loginRes.cookies.access_token && loginRes.cookies.access_token[0];

    const loginOk = loginRes.status === 200 && cookie && cookie.value;

    if (!loginOk) {
      throw new Error(
        `login failed for ${user.email}: ${loginRes.status} ${loginRes.body}`
      );
    }

    sessions.push({
      email: user.email,
      accessToken: cookie.value,
    });
  }

  console.log(`completed ${sessions.length} logins; starting websocket phase`);

  return {
    sessions,
  };
}

export default function (data) {
  const vuIndex = exec.vu.idInTest - 1;
  const user = data.sessions[vuIndex % data.sessions.length];
  const accessToken = user.accessToken;

  const connectDelay = (vuIndex / VU_COUNT) * WS_CONNECT_RAMP_S;
  sleep(connectDelay);

  const openPositionIds = [];

  const res = ws.connect(
    `${WS_URL}/api/trade`,
    {
      headers: {
        Cookie: `access_token=${accessToken}`,
      },
    },
    function (socket) {
      let sentCount = 0;
      let receivedCount = 0;
      let closed = false;

      const closeOnce = (reason) => {
        if (closed) return;
        closed = true;
        socket.close();
        if (reason === 'safety_timeout') {
          safetyTimeoutHit.add(true);
          console.warn(
            `${user.email}: closed on safety timeout, sent=${sentCount} received=${receivedCount}`
          );
        } else {
          safetyTimeoutHit.add(false);
        }
      };

      socket.on('open', () => {
        check(socket, { connected: () => true });

        socket.setInterval(() => {
          if (sentCount >= NUM_TRADES) return;

          const action = sentCount % 2 === 0 ? 'buy' : 'sell';
          const ticker = TICKERS[sentCount % TICKERS.length];

          socket.send(
            JSON.stringify({
              ticker,
              action,
              price: parseFloat((100 + Math.random() * 50).toFixed(2)),
              quantity: 1,
            })
          );

          sentCount++;
        }, TRADE_INTERVAL_MS);

        socket.setTimeout(() => closeOnce('safety_timeout'), SAFETY_TIMEOUT_MS);
      });

      socket.on('message', (data) => {
        const msg = JSON.parse(data);

        const flushed = new Date(msg.flushed_at).getTime();
        const queued = new Date(msg.queued_at).getTime();

        const hasValidTiming =
          Number.isFinite(flushed) &&
          Number.isFinite(queued) &&
          flushed >= queued;

        if (msg.position_id && hasValidTiming) {
          positionWriteMs.add(flushed - queued, {
            status: msg.status,
            ticker: msg.ticker || 'unknown',
          });
        }

        positionWriteOk.add(msg.status !== 'error');

        check(msg, {
          'confirm received': (m) => m.trade_id !== undefined,
          'has position_id': (m) =>
            m.status === 'error' || m.position_id !== undefined,
          'no error': (m) => m.status !== 'error',
          'flushed within 300ms': () =>
            hasValidTiming && flushed - queued < 300,
        });

        if (msg.status === 'open' && msg.position_id) {
          openPositionIds.push(msg.position_id);
        }

        receivedCount++;

        if (sentCount >= NUM_TRADES && receivedCount >= sentCount) {
          closeOnce('matched');
        }
      });

      socket.on('error', (e) => {
        check(null, { 'no socket error': () => false });
        console.error(`ws error for ${user.email}: ${JSON.stringify(e)}`);
      });
    }
  );

  check(res, {
    'status 101': (r) => r && r.status === 101,
  });

  openPositionIds.forEach((positionId) => {
    const closeRes = http.del(
      `${BASE_URL}/api/trade/${positionId}`,
      JSON.stringify({
        exit_price: parseFloat((100 + Math.random() * 50).toFixed(2)),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${accessToken}`,
        },
        tags: {
          name: 'PositionDelete', // fixes the high-cardinality WARN from last run
          endpoint: 'position_delete',
        },
      }
    );

    positionDeleteMs.add(closeRes.timings.duration, {
      status: String(closeRes.status),
    });

    positionDeleteOk.add(closeRes.status === 200);

    check(closeRes, {
      'trade closed': (r) => r.status === 200,
    });
  });
}

// ── VERIFICATION — run this yourself, trust nothing else ──────────────
// 1. Run with raw output:
//      k6 run --out json=results.json trade_load_sustained_1000rps.js
//
// 2. Count actual sends per real second, straight from timestamps:
//      jq -r 'select(.metric=="ws_msgs_sent" and .type=="Point") | .data.time' \
//        results.json | cut -c1-19 | sort | uniq -c
//    You should see counts near 0 for the first ~30s, settling near
//    1000 per line for ~60s in the middle, then falling back to 0.
//    That middle block is your real, verified, sustained rate.
//
// 3. Check write latency ONLY inside that plateau window (replace the
//    timestamps with the actual ones you saw in step 2):
//      jq -r 'select(.metric=="position_write_ms" and .type=="Point"
//        and .data.time >= "2026-06-20T12:34:30Z"
//        and .data.time <  "2026-06-20T12:35:30Z") | .data.value' \
//        results.json | sort -n | awk '
//          { a[NR]=$1 } END {
//            print "p99:", a[int(NR*0.99)]
//          }'
//    This is the system's real p99 under genuine sustained load —
//    no averaging across setup or ramp, no model interpretation.
// ────────────────────────────────────────────────────────────────────