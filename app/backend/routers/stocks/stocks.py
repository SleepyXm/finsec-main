from fastapi import APIRouter, HTTPException, Query, Depends, BackgroundTasks
from pydantic import BaseModel
from routers.utils.stock_utils import load_stock_data, INTERVALS, PERIODS, asset_exists, df_to_chart, download_asset_worker
from routers.storage.parquet import mark_worker_active, is_worker_active
from routers.storage.retrieveparquet import get_candles
from helpers.cache import get_or_fetch_candles
import pandas as pd
import yfinance as yf

stock_router = APIRouter()




INTERVALS = {"1m", "5m", "15m", "30m", "1h", "1d"}
PERIODS = {"1d", "5d", "1mo", "3mo"}


@stock_router.get("/stockdata")
async def get_stock_data(
    background_tasks: BackgroundTasks,
    ticker_symbol: str,
    interval: str = Query("5m"),
    period: str = Query("1mo")
):
    if interval not in INTERVALS or period not in PERIODS:
        raise HTTPException(status_code=400, detail="Invalid interval or period")

    ticker = ticker_symbol.upper()

    # Trigger parquet download in background if not already happening
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
    ticker_symbol: str,
    interval: str = Query("5m"),
    period: str = Query("1d")
):
    if interval not in INTERVALS:
        raise HTTPException(status_code=400, detail="Invalid interval")
    if period not in PERIODS:
        raise HTTPException(status_code=400, detail="Invalid period")
    
    try:
        data, column_mapping = load_stock_data(ticker_symbol, interval, period)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")
    
    open_col = column_mapping["open_col"]
    high_col = column_mapping["high_col"]
    low_col = column_mapping["low_col"]
    close_col = column_mapping["close_col"]
    
    chart_data = [
        {
            "time": int(idx.timestamp()),
            "open": row[open_col],
            "high": row[high_col],
            "low": row[low_col],
            "close": row[close_col],
        }
        for idx, row in data.iterrows()
    ]
    
    return chart_data