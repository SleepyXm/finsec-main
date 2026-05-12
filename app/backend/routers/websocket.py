from fastapi import APIRouter
import asyncio
import redis.asyncio as redis
from redis.asyncio import ConnectionPool
import json, os
import pandas as pd
import yfinance as yf
import numpy as np
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

# Store last candle bounds per ticker in Redis or just in-memory dict
_last_bounds: dict[str, dict] = {}

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
        await r.set(cache_key, json_str, ex=600)
        return json_str


def fetch_latest(ticker: str, interval: str) -> dict | None:
    t = yf.Ticker(ticker)
    df = t.history(period="2d", interval=interval)
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
        "volume": int(row["volume"]),
    }


#async def broadcast_stock_data(ticker: str, interval: str):
#    channel = f"price:{ticker}:{interval}"
#    last_key = f"last:price:{ticker}:{interval}"
#    sleep_s = 4
#    fill_interval = 0.6  # 10 fills per tick window
#    num_fills = int(sleep_s / fill_interval) - 1
#
#    while True:
#        try:
#            candle = await asyncio.to_thread(fetch_latest, ticker, interval)
#            if candle is None:
#                await r.publish(channel, json.dumps({"error": "no data"}))
#                await asyncio.sleep(sleep_s)
#                continue
#
#            payload = json.dumps(candle)
#            await r.publish(channel, payload)
#            await r.set(last_key, payload, ex=300)
#
#            low, high, close = candle["low"], candle["high"], candle["close"]
#            _last_bounds[ticker] = {"low": low, "high": high, "last": close}
#
#            # Fill the gap until next tick
#            fills = np.random.uniform(low=low, high=high, size=num_fills)
#            for fill_price in fills:
#                multiplier = 1.0008 if close < 10_000 else 1.00008
#                fill_payload = json.dumps({
#                    "ticker": ticker,
#                    "time": candle["time"],
#                    "close": round(float(fill_price), 2),
#                    "buy_price": round(close * multiplier, 2),
#                    "synthetic": True
#                })
#                await r.publish(channel, fill_payload)
#                await asyncio.sleep(fill_interval)
#
#        except Exception as e:
#            await r.publish(channel, json.dumps({"error": str(e)}))
#            await asyncio.sleep(sleep_s)




async def broadcast_stock_data(ticker: str, interval: str):
    channel = f"price:{ticker}:{interval}"
    last_key = f"last:price:{ticker}:{interval}"
    sleep_s = 2.2
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
