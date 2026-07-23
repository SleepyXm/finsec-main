from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from routers.utils.stock_utils import (
    INTERVALS,
    PERIODS,
    asset_exists,
    download_asset_worker,
    normalize_ticker,
    fetch_and_cache_live_intraday,   # ← new
)
from routers.storage.parquet import mark_worker_active, is_worker_active
from helpers.cache import get_or_fetch_candles
from routers.websocket import build_and_cache_chart
import json
from helpers.redis import redis_client

stock_router = APIRouter()


@stock_router.get("/stockdata")
async def get_stock_data(
    background_tasks: BackgroundTasks,
    ticker_symbol: str,
    interval: str  = Query("5m"),
    period: str    = Query("1mo"),
):
    if interval not in INTERVALS or period not in PERIODS:
        raise HTTPException(status_code=400, detail="Invalid interval or period")

    try:
        ticker = normalize_ticker(ticker_symbol)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    if not asset_exists(ticker, interval) and not await is_worker_active(ticker):
        await mark_worker_active(ticker)
        background_tasks.add_task(download_asset_worker, ticker)

    try:
        candles = await get_or_fetch_candles(ticker, interval, period)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")

    return candles


@stock_router.get("/stockdata/intraday")
async def get_intraday_data(
    background_tasks: BackgroundTasks,          # ← added
    ticker_symbol: str,
    interval: str = Query("1m"),
):
    if interval not in INTERVALS:
        raise HTTPException(status_code=400, detail="Invalid interval")

    try:
        ticker = normalize_ticker(ticker_symbol)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    exists = asset_exists(ticker, interval)

    # Seed parquet for any ticker we've never seen before
    if not exists and not await is_worker_active(ticker):
        await mark_worker_active(ticker)
        background_tasks.add_task(download_asset_worker, ticker)

    # --- primary path: parquet-backed chart cache ----------------------------
    chart: list[dict] = []

    if exists:
        try:
            cached_json, _ = await build_and_cache_chart(ticker, interval)
            chart = json.loads(cached_json).get("data", [])
        except FileNotFoundError:
            pass  # parquet vanished between check and read; fall through
        except Exception as error:
            raise HTTPException(
                status_code=503,
                detail="Intraday data is temporarily unavailable",
            ) from error

    # --- fallback: live yfinance fetch, Redis-cached for 60 s ----------------
    if not chart:
        chart = await fetch_and_cache_live_intraday(ticker, interval)
        if not chart:
            raise HTTPException(
                status_code=404,
                detail="No intraday data available for this ticker yet — "
                       "download has been queued, please retry shortly.",
            )

    # Merge any tick that arrived after the last cache flush
    try:
        latest_json = await redis_client.get(f"last:price:{ticker}:{interval}")
        if latest_json:
            chart = merge_latest_candle(chart, json.loads(latest_json))
    except Exception:
        pass

    return chart


def merge_latest_candle(chart: list[dict], latest: dict) -> list[dict]:
    if not chart or not isinstance(latest, dict):
        return chart
    latest_time = latest.get("time")
    if not isinstance(latest_time, int) or not isinstance(latest.get("close"), (int, float)):
        return chart
    last_time = chart[-1].get("time")
    if latest_time == last_time:
        chart[-1] = latest
    elif isinstance(last_time, int) and latest_time > last_time:
        chart.append(latest)
    return chart