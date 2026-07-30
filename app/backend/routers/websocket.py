from fastapi import APIRouter
import redis.asyncio as redis
from redis.asyncio import ConnectionPool
import pandas as pd
import yfinance as yf
import numpy as np
from .storage.retrieveparquet import load_parquet
from .utils.stock_utils import df_to_chart, asset_exists, download_asset_worker
from .storage.parquet import download_and_save, is_worker_active, mark_worker_active, INTERVAL_CONFIG
import random, math, json, os, asyncio

websocket_router = APIRouter()

_pool = ConnectionPool.from_url(
    os.getenv("REDIS_URL", "redis://localhost:6379"),
    max_connections=200,
    decode_responses=True,
)
r = redis.Redis(connection_pool=_pool)

fetch_tasks: dict[tuple[str, str, str], asyncio.Task] = {}
_chart_locks: dict[str, asyncio.Lock] = {}

subscriptions = {}

_background_tasks: set[asyncio.Task] = set()

# Store last candle bounds per ticker in Redis or just in-memory dict
_last_bounds: dict[str, dict] = {}

PAGE_SIZE = 500
PAGE_CACHE_TTL = 7 * 24 * 60 * 60

# ── Chart cache ──────────────────────────────────────────────────────────────

def build_chart(ticker: str, interval: str, live_period: str):
    df = load_parquet(ticker, interval)
    print(f"[parquet] last: {df['timestamp'].iloc[-1]}")
    try:
        t = yf.Ticker(ticker)
        df_live = t.history(period=live_period, interval=interval)
        if not df_live.empty:
            print(f"[yfinance] first: {df_live.index[0]}, last: {df_live.index[-1]}")
            df_live.columns = [c.lower() for c in df_live.columns]
            df_live.index.name = "timestamp"
            df_live = df_live.reset_index()
            df_live["timestamp"] = pd.to_datetime(df_live["timestamp"])
            df = (
                pd.concat([df, df_live])
                .drop_duplicates(subset=["timestamp"])
                .sort_values("timestamp")
                .reset_index(drop=True)
            )
    except Exception as e:
        print(f"[chart stitch] {ticker} {interval}: {e}")
    chart_data = df_to_chart(df)
    return chart_data  # return the list, not json string


async def write_all_pages_bg(
    ticker: str,
    interval: str,
    df,
    total_pages: int,
    flat_payload: str,
):
    import traceback
    print(f"[write_all_pages_bg] starting {ticker} {interval} pages={total_pages}")
    try:
        rows = await asyncio.to_thread(df_to_chart, df)
        total_rows = len(rows)
        print(f"[write_all_pages_bg] df_to_chart done, {total_rows} rows")

        async with r.pipeline(transaction=False) as pipe:
            # The flat key and metadata are already available. Do not rewrite
            # them here because a live tick may have updated page 1 while the
            # older pages were being serialised.
            pipe.set(
                f"chart:{ticker}:{interval}:page:1",
                flat_payload,
                ex=PAGE_CACHE_TTL,
                nx=True,
            )

            for page_num in range(2, total_pages + 1):
                end   = total_rows - (page_num - 1) * PAGE_SIZE
                start = max(0, end - PAGE_SIZE)
                pipe.set(
                    f"chart:{ticker}:{interval}:page:{page_num}",
                    json.dumps({
                        "type":        "historical",
                        "page":        page_num,
                        "total_pages": total_pages,
                        "total_rows":  total_rows,
                        "data":        rows[start:end],
                    }),
                    ex=PAGE_CACHE_TTL,
                )

            await pipe.execute()
        print(f"[write_all_pages_bg] pipeline done")

    except Exception as e:
        print(f"[write_all_pages_bg] ERROR:\n{traceback.format_exc()}")

async def build_and_cache_chart(ticker: str, interval: str) -> tuple[str, int]:
    cache_key = f"chart:{ticker}:{interval}"

    cached = await r.get(cache_key)
    if cached:
        tp = await r.get(f"{cache_key}:meta:tp")
        return cached, int(tp) if tp else 1

    if cache_key not in _chart_locks:
        _chart_locks[cache_key] = asyncio.Lock()

    async with _chart_locks[cache_key]:
        cached = await r.get(cache_key)
        if cached:
            tp = await r.get(f"{cache_key}:meta:tp")
            return cached, int(tp) if tp else 1

        df = await asyncio.to_thread(load_parquet, ticker, interval)

        # page 1 only — tail of parquet, no yfinance, no full processing
        page1_rows = df_to_chart(df.iloc[-PAGE_SIZE:])
        total_rows  = len(df)
        total_pages = max(1, math.ceil(total_rows / PAGE_SIZE))

        flat_payload = json.dumps({
            "type":        "historical",
            "page":        1,
            "total_pages": total_pages,
            "total_rows":  total_rows,
            "data":        page1_rows,
        })

        await r.set(cache_key, flat_payload, ex=600)
        await r.set(f"{cache_key}:meta:tp", str(total_pages), ex=600)

    # everything else — background
    asyncio.create_task(write_all_pages_bg(ticker, interval, df, total_pages, flat_payload))

    return flat_payload, total_pages


def page_candle(candle: dict) -> dict:
    return {
        "time": int(candle["time"]),
        "open": round(float(candle["open"]), 2),
        "high": round(float(candle["high"]), 2),
        "low": round(float(candle["low"]), 2),
        "close": round(float(candle["close"]), 2),
    }


async def append_candle_to_page_one(ticker: str, interval: str, candle: dict):
    """
    Keep page 1 as the newest page.

    Updating the current candle and appending to a non-full page are O(1).
    When page 1 is full, every existing page moves back by one and a fresh
    page 1 is created. That domino rollover happens only once per 500 candles.
    """
    cache_key = f"chart:{ticker}:{interval}"
    page_one_key = f"{cache_key}:page:1"

    if cache_key not in _chart_locks:
        _chart_locks[cache_key] = asyncio.Lock()

    async with _chart_locks[cache_key]:
        page_one_raw = await r.get(page_one_key)
        if not page_one_raw:
            # The flat key is page 1 and is written before the background page
            # fan-out completes, so it is a safe fallback during that brief race.
            page_one_raw = await r.get(cache_key)
        if not page_one_raw:
            return

        page_one = json.loads(page_one_raw)
        rows = page_one.get("data", [])
        next_candle = page_candle(candle)
        total_pages = int(page_one.get("total_pages", 1))
        total_rows = int(page_one.get("total_rows", len(rows)))

        if rows and next_candle["time"] == rows[-1]["time"]:
            rows[-1] = next_candle
            page_one["data"] = rows
            payload = json.dumps(page_one)
            async with r.pipeline(transaction=False) as pipe:
                pipe.set(cache_key, payload, ex=600)
                pipe.set(page_one_key, payload, ex=PAGE_CACHE_TTL)
                await pipe.execute()
            return

        if rows and next_candle["time"] < rows[-1]["time"]:
            return

        total_rows += 1

        if len(rows) < PAGE_SIZE:
            rows.append(next_candle)
            page_one.update({
                "page": 1,
                "total_pages": total_pages,
                "total_rows": total_rows,
                "data": rows,
            })
            payload = json.dumps(page_one)
            async with r.pipeline(transaction=False) as pipe:
                pipe.set(cache_key, payload, ex=600)
                pipe.set(page_one_key, payload, ex=PAGE_CACHE_TTL)
                pipe.set(f"{cache_key}:meta:tp", str(total_pages), ex=600)
                await pipe.execute()
            return

        # Page 1 is full. Read the old pages once, then write them back in
        # reverse order with their page numbers incremented. The reverse write
        # prevents any destination from being overwritten before it is copied.
        page_keys = [f"{cache_key}:page:{page}" for page in range(1, total_pages + 1)]
        old_pages = await r.mget(page_keys)
        if any(old_page is None for old_page in old_pages):
            # Initial page fan-out is still running. The next live tick will
            # retry after all domino sources are present.
            return
        new_total_pages = total_pages + 1

        async with r.pipeline(transaction=True) as pipe:
            for old_page_number in range(total_pages, 0, -1):
                old_payload = old_pages[old_page_number - 1]
                if not old_payload:
                    continue
                moved_page = json.loads(old_payload)
                moved_page["page"] = old_page_number + 1
                moved_page["total_pages"] = new_total_pages
                moved_page["total_rows"] = total_rows
                pipe.set(
                    f"{cache_key}:page:{old_page_number + 1}",
                    json.dumps(moved_page),
                    ex=PAGE_CACHE_TTL,
                )

            new_page_one = json.dumps({
                "type": "historical",
                "page": 1,
                "total_pages": new_total_pages,
                "total_rows": total_rows,
                "data": [next_candle],
            })
            pipe.set(cache_key, new_page_one, ex=600)
            pipe.set(page_one_key, new_page_one, ex=PAGE_CACHE_TTL)
            pipe.set(f"{cache_key}:meta:tp", str(new_total_pages), ex=600)
            await pipe.execute()


_fetch_state: dict[str, dict] = {}
REAL_FETCH_EVERY = 4  # every ~30s at 2.2s sleep

def fetch_latest(provider: str, ticker: str, interval: str) -> dict | None:
    key = f"{provider}:{ticker}:{interval}"
    state = _fetch_state.get(key, {"tick": 0, "real_candle": None})

    state["tick"] += 1
    needs_real = state["real_candle"] is None or state["tick"] % REAL_FETCH_EVERY == 0

    if needs_real:
        t = yf.Ticker(ticker)
        df = t.history(period="2d", interval=interval)
        if df.empty:
            return None
        df.columns = [c.lower() for c in df.columns]
        row = df.iloc[-1]
        close = float(row["close"])
        multiplier = 1.0008 if close < 10_000 else 1.00008
        candle = {
            "provider": provider,
            "ticker": ticker,
            "time": int(df.index[-1].timestamp()),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": round(close, 2),
            "buy_price": round(close * multiplier, 2),
            "volume": int(row["volume"]),
            "source": "real",
        }
        state["real_candle"] = candle
        # reset sim state on real fetch so velocity doesnt carry stale momentum
        _sim_state.pop(key, None)
        _fetch_state[key] = state
        return candle

    _fetch_state[key] = state
    return simulate_next(provider, ticker, state["real_candle"], interval)

async def publish_candle(provider: str, ticker: str, interval: str, candle: dict):
    channel = f"price:{provider}:{ticker}:{interval}"
    last_key = f"last:price:{provider}:{ticker}:{interval}"
    payload = json.dumps(candle)
    await r.publish(channel, payload)
    await r.set(last_key, payload, ex=300)
    if candle.get("source") == "real":
        await append_candle_to_page_one(ticker, interval, candle)


async def broadcast_stock_data(provider: str, ticker: str, interval: str):
    channel = f"price:{provider}:{ticker}:{interval}"
    sleep_s = 1
    while True:
        try:
            candle = await asyncio.to_thread(fetch_latest, provider, ticker, interval)
            if candle is None:
                await r.publish(channel, json.dumps({
                    "error": "no data",
                    "provider": provider,
                    "ticker": ticker,
                    "terminal": True,
                }))
                return
            await publish_candle(provider, ticker, interval, candle)
        except Exception as e:
            await r.publish(channel, json.dumps({
                "error": str(e),
                "provider": provider,
                "ticker": ticker,
                "terminal": True,
            }))
            return
        await asyncio.sleep(sleep_s)


_sim_state: dict[str, dict] = {}

def simulate_next(provider: str, ticker: str, real_candle: dict, interval: str) -> dict:
    key = f"{provider}:{ticker}:{interval}"
    state = _sim_state.get(key, {})

    # natural range from the real candle
    candle_range = real_candle["high"] - real_candle["low"]
    step = candle_range * 0.08  # max move per tick, 8% of candle range

    last_close = state.get("last_close", real_candle["close"])
    velocity = state.get("velocity", 0.0)

    # bias velocity toward momentum, decay old velocity
    velocity = velocity * 0.8

    # reversal pressure if we're drifting outside the real candle range
    if last_close > real_candle["high"]:
        velocity -= step * 0.5
    elif last_close < real_candle["low"]:
        velocity += step * 0.5

    # nudge — directional, within step size
    nudge = random.uniform(-step, step)
    velocity = max(-step, min(step, velocity + nudge * 0.2))

    new_close = round(last_close + velocity, 2)

    # soft clamp — can breach range but gets pushed back
    new_high = round(max(real_candle["high"], new_close), 2)
    new_low = round(min(real_candle["low"], new_close), 2)

    multiplier = 1.0008 if new_close < 10_000 else 1.00008

    _sim_state[key] = {
        "last_close": new_close,
        "velocity": velocity,
    }

    return {
        "provider": provider,
        "ticker": ticker,
        "time": real_candle["time"],
        "open": real_candle["open"],
        "high": new_high,
        "low": new_low,
        "close": new_close,
        "buy_price": round(new_close * multiplier, 2),
        "volume": real_candle["volume"],
        "source": "simulated",
    }
