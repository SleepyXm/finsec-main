from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from routers.storage.retrieveparquet import get_candles


backtest_router = APIRouter()


class CandleRequest(BaseModel):
    ticker: str
    interval: str
    date_from: datetime
    date_to: datetime


INTERNAL_SECRET = "dasdddddddddddddddasdadsadasdsadsa"


@backtest_router.post("/internal/backtest/candles")
async def build_candles(req: CandleRequest, request: Request):
    if request.headers.get("X-Internal-Secret") != INTERNAL_SECRET:
        raise HTTPException(403)

    df = get_candles(req.ticker, req.interval, req.date_from, req.date_to)

    candles = []
    for row in df.itertuples():
        close = float(row.close)
        multiplier = 1.0008 if close < 10000 else 1.00008
        candles.append({
            "time": int(row.timestamp.timestamp()),
            "open": float(row.open),
            "high": float(row.high),
            "low": float(row.low),
            "close": close,
            "buy_price": round(close * multiplier, 2),
        })

    return candles
