import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict
import asyncio
from helpers.redis import redis_client

BASE_DIR = Path("data/history")

#INTERVAL_CONFIG = {
#    "1m":  {"period": "7d",  "capped": True},
#    "5m":  {"period": "60d",  "capped": True},
#    "15m": {"period": "60d", "capped": False},
#    "30m": {"period": "60d", "capped": False},
#    "1h":  {"period": "2y", "capped": False},
#    "1d":  {"period": "max", "capped": False},
#}


INTERVAL_CONFIG = {
    "1m":  {"period": "3d",  "capped": False},
    "5m":  {"period": "1wk",  "capped": False},
    "15m": {"period": "1mo", "capped": False},
    "30m": {"period": "1mo", "capped": False},
    "1h":  {"period": "3mo", "capped": False},
    "1d":  {"period": "max", "capped": False},
}

historical_cache: dict[str, pd.DataFrame] = {}

def load_parquet(ticker: str, interval: str) -> pd.DataFrame:
    cache_key = f"{ticker}_{interval}"
    if cache_key in historical_cache:
        return historical_cache[cache_key]
    
    path = BASE_DIR / ticker / interval / "data.parquet"
    if not path.exists():
        raise FileNotFoundError(f"No data found for {ticker} at {interval}. Has it been downloaded?")
    
    df = pd.read_parquet(path)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    historical_cache[cache_key] = df
    return df


def get_candles(
    ticker: str,
    interval: str,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    last_n: Optional[int] = None,
) -> pd.DataFrame:
    df = load_parquet(ticker, interval)
    if start:
        start_ts = pd.Timestamp(start, tz="UTC") if pd.Timestamp(start).tzinfo is None else pd.Timestamp(start).tz_convert("UTC")
        df = df[df["timestamp"] >= start_ts]
    if end:
        end_ts = pd.Timestamp(end, tz="UTC") if pd.Timestamp(end).tzinfo is None else pd.Timestamp(end).tz_convert("UTC")
        df = df[df["timestamp"] <= end_ts]
    if last_n:
        df = df.tail(last_n).reset_index(drop=True)
    return df


def get_latest_candle(ticker: str, interval: str) -> pd.Series:
    df = load_parquet(ticker, interval)
    return df.iloc[-1]


def get_available_tickers() -> list[str]:
    if not BASE_DIR.exists():
        return []
    return [p.name for p in BASE_DIR.iterdir() if p.is_dir()]


def get_available_intervals(ticker: str) -> list[str]:
    ticker_dir = BASE_DIR / ticker
    if not ticker_dir.exists():
        raise FileNotFoundError(f"No data found for {ticker}")
    return [p.name for p in ticker_dir.iterdir() if p.is_dir()]


def get_data_info(ticker: str, interval: str) -> dict:
    df = load_parquet(ticker, interval)
    return {
        "ticker": ticker,
        "interval": interval,
        "rows": len(df),
        "from": df["timestamp"].iloc[0],
        "to": df["timestamp"].iloc[-1],
        "capped": INTERVAL_CONFIG[interval]["capped"],
        "columns": list(df.columns),
    }


def prompt_ticker() -> str:
    available = get_available_tickers()
    if available:
        print(f"Available tickers: {', '.join(available)}")
    return input("Enter ticker: ").strip().upper()


def prompt_interval(ticker: str) -> str:
    try:
        available = get_available_intervals(ticker)
        print(f"Available intervals for {ticker}: {', '.join(available)}")
    except FileNotFoundError:
        print(f"Available intervals: {', '.join(INTERVAL_CONFIG.keys())}")
    return input("Enter interval: ").strip().lower()

def invalidate_cache(ticker: str, interval: str):
    historical_cache.pop(f"{ticker}_{interval}", None)
    asyncio.create_task(redis_client.delete(f"chart:{ticker}:{interval}"))


if __name__ == "__main__":
    ticker = prompt_ticker()
    interval = prompt_interval(ticker)

    try:
        info = get_data_info(ticker, interval)
        print(f"\n--- {ticker} | {interval} ---")
        print(f"Rows   : {info['rows']}")
        print(f"From   : {info['from']}")
        print(f"To     : {info['to']}")
        print(f"Capped : {info['capped']}")

        df = get_candles(ticker, interval, last_n=5)
        print(f"\nLast 5 candles:")
        print(df.to_string(index=False))

    except FileNotFoundError as e:
        print(f"Error: {e}")