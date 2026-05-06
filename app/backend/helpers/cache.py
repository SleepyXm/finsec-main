"""
cache.py — Stock data cache layer (Week 1)

Problem this solves:
  load_stock_data() calls yf.download() on every invocation.  The WebSocket
  broadcaster was doing this every second per ticker, which hammers Yahoo
  Finance and blocks the event loop (yfinance is synchronous).

Solution:
  get_or_fetch_candles() wraps load_stock_data() with a Redis cache.
  On a cache hit  → instant return from Redis (< 1 ms).
  On a cache miss → yfinance fetch runs in a thread-pool executor so it
                    doesn't block the async event loop, then the result is
                    stored in Redis with a TTL tuned to each interval.

TTL rationale:
  A 1-minute candle only changes every ~60 s, so caching it for 20 s is safe.
  A daily candle changes once per trading day, so 30 min is fine.
  Shorter TTLs keep the data fresh; longer TTLs reduce API pressure.

Redis key format:  stock:data:{ticker}:{interval}:{period}
Stored value:      JSON list of candle dicts (time, open, high, low, close, buy_price)
"""

import json
import asyncio
import pandas as pd
from helpers.redis import redis_client
from routers.utils.stock_utils import load_stock_data

# How long each interval's data stays cached before the next yfinance fetch
CACHE_TTL: dict[str, int] = {
    "1m":  20,      # 20 seconds
    "5m":  60,      # 1 minute
    "15m": 180,     # 3 minutes
    "30m": 300,     # 5 minutes
    "1h":  600,     # 10 minutes
    "1d":  1800,    # 30 minutes
    "1wk": 10800,   # 3 hours
    "1mo": 21600,   # 6 hours
}


async def get_or_fetch_candles(ticker: str, interval: str, period: str) -> list[dict]:
    """
    Return candles from Redis cache, falling back to yfinance on a cache miss.

    The returned list is always in chronological order (oldest → newest).
    Each candle dict contains: time, open, high, low, close, buy_price.
    """
    cache_key = f"stock:data:{ticker}:{interval}:{period}"

    # Fast path — data already in Redis
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # Slow path — run the blocking yfinance download in a thread pool so the
    # event loop can continue serving other requests while we wait for the HTTP call
    loop = asyncio.get_running_loop()
    data, mapping = await loop.run_in_executor(None, load_stock_data, ticker, interval, period)

    candles = _serialize_candles(data, mapping)
    ttl = CACHE_TTL.get(interval, 60)
    await redis_client.setex(cache_key, ttl, json.dumps(candles))

    return candles


def _serialize_candles(data, mapping) -> list[dict]:
    """
    Convert a yfinance DataFrame into a plain list of dicts that can be
    JSON-serialised and stored in Redis or sent directly to the frontend.

    buy_price is included here so the WebSocket can forward it without
    recalculating the multiplier on every tick.
    """

    if isinstance(data.columns, pd.MultiIndex):
        data.columns = [
            "_".join(filter(None, [str(c) for c in col])).strip()
            for col in data.columns
        ]
        # Re-derive mapping keys to match the new flattened names
        # (only needed if mapping values are plain "Open"/"High"/etc.)
        mapping = {k: next(c for c in data.columns if c.startswith(v))
                   for k, v in mapping.items()}
        
    open_col  = mapping["open_col"]
    high_col  = mapping["high_col"]
    low_col   = mapping["low_col"]
    close_col = mapping["close_col"]

    return [
        {
            "time":      int(idx.timestamp()),
            "open":      float(row[open_col]),
            "high":      float(row[high_col]),
            "low":       float(row[low_col]),
            "close":     float(row[close_col]),
            "buy_price": float(row["Buy_Price"]),  # pre-computed spread ask price
        }
        for idx, row in data.iterrows()
    ]
