"""
portfolio.py — Live P&L endpoints (Week 4)

Two endpoints:
  GET  /api/portfolio/pnl      — HTTP snapshot of all open positions with live P&L
  WS   /api/ws/portfolio       — WebSocket stream that pushes an updated snapshot every 2 s

P&L is calculated using price:latest:{ticker} keys written by the price publisher
(services/price_publisher.py) every second.  No yfinance calls happen here — we just
read Redis — so latency is sub-millisecond per position.

If a ticker has no active WebSocket subscriber (so no publisher is running), the endpoint
falls back to get_or_fetch_candles(), which hits the stock data cache or yfinance.
"""

import json
import asyncio
from fastapi import APIRouter, WebSocket, Depends
from helpers.redis import redis_client
from helpers.cache import get_or_fetch_candles
from utils.auth import get_current_user
from models.user.user import User

portfolio_router = APIRouter()


async def _compute_pnl(user_id: str) -> dict:
    """
    Core P&L calculation shared by both the REST and WebSocket endpoints.

    For each open trade:
      - Reads the current price from price:latest:{ticker} (set by publisher, TTL 10 s)
      - Falls back to the stock data cache / yfinance if the key has expired
      - live_pnl = (current_price - entry_price) * direction
          direction = +1 for a long (buy), -1 for a short (sell)
    """
    raw = await redis_client.hgetall(f"trades:active:{user_id}")
    if not raw:
        return {"trades": [], "total_pnl": 0.0}

    trades = []
    total_pnl = 0.0

    for trade_json in raw.values():
        trade = json.loads(trade_json)
        ticker = trade["ticker"]

        # Try the fast path: price maintained by the running publisher
        price_json = await redis_client.get(f"price:latest:{ticker}")

        if price_json:
            current_close = json.loads(price_json)["close"]
        else:
            # No publisher active for this ticker — hit the cache/yfinance fallback.
            # get_or_fetch_candles caches the result so repeated calls are cheap.
            try:
                candles = await get_or_fetch_candles(ticker, "1m", "1d")
                current_close = candles[-1]["close"] if candles else trade["entry_price"]
            except Exception:
                current_close = trade["entry_price"]

        direction = 1 if trade["action"] == "buy" else -1
        live_pnl = round((current_close - trade["entry_price"]) * direction, 4)
        total_pnl += live_pnl

        trades.append({
            **trade,
            "current_price": round(current_close, 4),
            "live_pnl": live_pnl,
        })

    return {"trades": trades, "total_pnl": round(total_pnl, 4)}


# ---------------------------------------------------------------------------
# REST endpoint — single P&L snapshot
# ---------------------------------------------------------------------------

@portfolio_router.get("/portfolio/pnl")
async def get_portfolio_pnl(current_user: User = Depends(get_current_user)):
    """Returns a snapshot of all open positions with their current live P&L."""
    return await _compute_pnl(str(current_user.id))


# ---------------------------------------------------------------------------
# WebSocket endpoint — streaming P&L
# ---------------------------------------------------------------------------

@portfolio_router.websocket("/ws/portfolio")
async def websocket_portfolio(
    websocket: WebSocket,
    current_user: User = Depends(get_current_user),
):
    """
    Pushes a fresh P&L snapshot every 2 seconds.

    All price data comes from Redis (price:latest:{ticker}), so this loop
    makes zero yfinance calls as long as there is an active stock WebSocket
    open for each position's ticker.
    """
    await websocket.accept()
    user_id = str(current_user.id)

    try:
        while True:
            snapshot = await _compute_pnl(user_id)
            await websocket.send_json(snapshot)
            await asyncio.sleep(2)
    except Exception:
        # Client disconnected or send failed — exit cleanly
        pass
