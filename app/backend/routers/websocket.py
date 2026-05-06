from fastapi import APIRouter
import asyncio
import redis.asyncio as redis
from redis.asyncio import ConnectionPool
import json, os
import pandas as pd
import yfinance as yf
from .storage.retrieveparquet import load_parquet
from .utils.stock_utils import df_to_chart, asset_exists, download_asset_worker
from .storage.parquet import download_and_save, is_worker_active, mark_worker_active, INTERVAL_CONFIG

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


# ── Chart cache ──────────────────────────────────────────────────────────────

def build_chart(ticker: str, interval: str, live_period: str) -> str:
    df = load_parquet(ticker, interval)
    try:
        t = yf.Ticker(ticker)
        df_live = t.history(period=live_period, interval=interval)
        if not df_live.empty:
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
    return json.dumps({"type": "historical", "data": chart_data})


async def build_and_cache_chart(ticker: str, interval: str) -> str:
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
        json_str = await asyncio.to_thread(build_chart, ticker, interval, live_period)
        await r.set(cache_key, json_str, ex=60)
        return json_str


def fetch_latest(ticker: str, interval: str) -> dict | None:
    t = yf.Ticker(ticker)
    df = t.history(period="1d", interval=interval)
    if df.empty:
        return None
    df.columns = [c.lower() for c in df.columns]
    row = df.iloc[-1]
    close = float(row["close"])
    multiplier = 1.0008 if close < 10_000 else 1.00008
    return {
        "ticker": ticker,
        "time": int(df.index[-1].timestamp()),
        "open": float(row["open"]),
        "high": float(row["high"]),
        "low": float(row["low"]),
        "close": round(close, 2),
        "buy_price": round(close * multiplier, 2),
    }


async def broadcast_stock_data(ticker: str, interval: str):
    channel = f"price:{ticker}:{interval}"
    last_key = f"last:price:{ticker}:{interval}"
    sleep_s = 1.2
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


# ── Internal REST endpoints (called by Go) ───────────────────────────────────

from fastapi import APIRouter as _APIRouter

price_router = _APIRouter()


@price_router.post("/internal/broadcast/start")
async def start_broadcast(ticker: str, interval: str = "1m"):
    key = f"{ticker}_{interval}"
    if key not in fetch_tasks or fetch_tasks[key].done():
        fetch_tasks[key] = asyncio.create_task(broadcast_stock_data(ticker, interval))
        return {"status": "started", "key": key}
    return {"status": "already_running", "key": key}


@price_router.delete("/internal/broadcast/stop")
async def stop_broadcast(ticker: str, interval: str = "1m"):
    key = f"{ticker}_{interval}"
    if key in fetch_tasks:
        fetch_tasks[key].cancel()
        del fetch_tasks[key]
        return {"status": "stopped"}
    return {"status": "not_running"}


@price_router.get("/internal/broadcast/status")
async def broadcast_status():
    return {
        k: ("running" if not t.done() else "dead")
        for k, t in fetch_tasks.items()
    }


@price_router.post("/internal/chart/cache")
async def prime_chart_cache(ticker: str, interval: str = "1m"):
    """
    Go calls this when a client connects and the chart key is missing from Redis.
    Python builds the chart, stores it, and Go reads it straight from Redis.
    """
    if not asset_exists(ticker, interval):
        if not await is_worker_active(ticker):
            await mark_worker_active(ticker)
            asyncio.create_task(download_asset_worker(ticker))
        return {"status": "downloading"}

    await build_and_cache_chart(ticker, interval)
    return {"status": "cached", "key": f"chart:{ticker}:{interval}"}