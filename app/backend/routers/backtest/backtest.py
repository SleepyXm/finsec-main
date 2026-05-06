import uuid
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from helpers.redis import redis_client
from routers.storage.retrieveparquet import get_candles
from utils.auth import get_current_user
from schemas import TradeAction, CloseTradeRequest
import uuid
from datetime import datetime, timezone

backtest_router = APIRouter()

BACKTEST_SESSION_TTL = 60 * 60 * 3  # 3 hours


class BacktestRequest(BaseModel):
    ticker: str
    interval: str
    date_from: datetime
    date_to: datetime
    starting_balance: float = 100_000.0


class BacktestCandle(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float


@backtest_router.post("/backtest/run")
async def run_backtest(
    req: BacktestRequest,
    current_user=Depends(get_current_user),
):
    # Slice parquet data for the requested range
    try:
        df = get_candles(
            ticker=req.ticker.upper(),
            interval=req.interval,
            start=req.date_from,
            end=req.date_to,
        )
    except FileNotFoundError:
        raise HTTPException(404, f"No data found for {req.ticker} at {req.interval}")

    if df.empty:
        raise HTTPException(400, "No candles found in the requested date range")

    # Build the candle sequence — open then close for each candle
    candles = []
    for row in df.itertuples():
        close = float(row.close)
        multiplier = 1.0008 if close < 10000 else 1.00008
        candles.append({
            "time":      int(row.timestamp.timestamp()),
            "open":      float(row.open),
            "high":      float(row.high),
            "low":       float(row.low),
            "close":     close,
            "buy_price": round(close * multiplier, 2),
        })

    # Create session
    session_id = str(uuid.uuid4())
    session = {
        "session_id":        session_id,
        "user_id":           str(current_user.id),
        "ticker":            req.ticker.upper(),
        "interval":          req.interval,
        "date_from":         req.date_from.isoformat(),
        "date_to":           req.date_to.isoformat(),
        "starting_balance":  req.starting_balance,
        "candle_count":      len(candles),
        "created_at":        datetime.utcnow().isoformat(),
    }

    # Store session + candles in Redis
    session_key = f"backtest:session:{session_id}"

    await redis_client.setex(session_key, BACKTEST_SESSION_TTL, json.dumps(session))

    return {
        "session_id":       session_id,
        "ticker":           req.ticker.upper(),
        "interval":         req.interval,
        "candle_count":     len(candles),
        "starting_balance": req.starting_balance,
        "candles":          candles,
    }


@backtest_router.get("/backtest/session/{session_id}")
async def get_backtest_session(
    session_id: str,
    current_user=Depends(get_current_user),
):
    session_key = f"backtest:session:{session_id}"
    cached = await redis_client.get(session_key)
    if not cached:
        raise HTTPException(404, "Backtest session not found or expired")

    session = json.loads(cached)
    if session["user_id"] != str(current_user.id):
        raise HTTPException(403, "Not your session")

    return session


@backtest_router.delete("/backtest/session/{session_id}")
async def delete_backtest_session(
    session_id: str,
    current_user=Depends(get_current_user),
):
    session_key = f"backtest:session:{session_id}"
    cached = await redis_client.get(session_key)
    if not cached:
        raise HTTPException(404, "Session not found")

    session = json.loads(cached)
    if session["user_id"] != str(current_user.id):
        raise HTTPException(403, "Not your session")

    await redis_client.delete(session_key)
    await redis_client.delete(f"backtest:candles:{session_id}")

    return {"message": "Session deleted"}