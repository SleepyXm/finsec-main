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

fetch_tasks: dict[str, asyncio.Task] = {}
_chart_locks: dict[str, asyncio.Lock] = {}

subscriptions = {}

# Store last candle bounds per ticker in Redis or just in-memory dict
_last_bounds: dict[str, dict] = {}

PAGE_SIZE = 500

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


async def build_and_cache_chart(ticker: str, interval: str) -> str:
    # flat key — what Go reads on initial connect (preserves stitching)
    cache_key = f"chart:{ticker}:{interval}"
    cached = await r.get(cache_key)
    if cached:
        return cached

    if cache_key not in _chart_locks:
        _chart_locks[cache_key] = asyncio.Lock()

    async with _chart_locks[cache_key]:
        cached = await r.get(cache_key)
        if cached:
            return cached

        live_period = INTERVAL_CONFIG.get(interval, {}).get("period", "1d")
        rows = await asyncio.to_thread(build_chart, ticker, interval, live_period)
        total_rows = len(rows)
        total_pages = max(1, math.ceil(total_rows / PAGE_SIZE))

        # write flat key — most recent PAGE_SIZE rows, same as before
        # this is what Go serves on initial connect and what the live tick stitches onto
        last_page_rows = rows[-PAGE_SIZE:]
        flat_payload = json.dumps({"type": "historical", "page": 1, "total_pages": total_pages, "data": last_page_rows})
        await r.set(cache_key, flat_payload, ex=600)

        # write paginated keys — page 1 = most recent, page N = oldest
        # so loadPreviousPage(2) fetches the next older chunk
        for page_num in range(1, total_pages + 1):
            # page 1 → last PAGE_SIZE rows, page 2 → second-to-last, etc.
            end = total_rows - (page_num - 1) * PAGE_SIZE
            start = max(0, end - PAGE_SIZE)
            slice_data = rows[start:end]
            page_payload = json.dumps({
                "type": "historical",
                "page": page_num,
                "total_pages": total_pages,
                "total_rows": total_rows,
                "data": slice_data,
            })
            await r.set(f"chart:{ticker}:{interval}:page:{page_num}", page_payload, ex=600)

        return flat_payload


_fetch_state: dict[str, dict] = {}
REAL_FETCH_EVERY = 4  # every ~30s at 2.2s sleep

def fetch_latest(ticker: str, interval: str) -> dict | None:
    key = f"{ticker}:{interval}"
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
    return simulate_next(ticker, state["real_candle"],  interval)

async def broadcast_stock_data(ticker: str, interval: str):
    channel = f"price:{ticker}:{interval}"
    last_key = f"last:price:{ticker}:{interval}"
    sleep_s = 1
    while True:
        try:
            candle = await asyncio.to_thread(fetch_latest, ticker, interval)
            if candle is None:
                await r.publish(channel, json.dumps({"error": "no data"}))
            else:
                payload = json.dumps(candle)
                await r.publish(channel, payload)
                await r.set(last_key, payload, ex=300)
        except Exception as e:
            await r.publish(channel, json.dumps({"error": str(e)}))
        await asyncio.sleep(sleep_s)


_sim_state: dict[str, dict] = {}

def simulate_next(ticker: str, real_candle: dict, interval: str) -> dict:
    key = f"{ticker}:{interval}"
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