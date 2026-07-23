import pandas as pd
import yfinance as yf
import numpy as np
import re
import json
import asyncio
from ..storage.parquet import BASE_DIR, download_and_save, INTERVAL_CONFIG
from ..storage.retrieveparquet import load_parquet
from helpers.redis import redis_client

INTERVALS = {"1m", "5m", "15m", "30m", "1h", "1d"}
PERIODS   = {"1d", "5d", "1mo", "3mo"}

TICKER_PATTERN = re.compile(r"^[A-Z0-9.^=_-]{1,24}$")

# Maps intraday interval → the shortest yfinance period that covers it
_LIVE_PERIOD: dict[str, str] = {
    "1m":  "1d",
    "5m":  "5d",
    "15m": "5d",
    "30m": "1mo",
    "1h":  "1mo",
    "1d":  "3mo",
}

_LIVE_CACHE_TTL = 60  # seconds — short enough to feel live, long enough to not hammer yf


async def fetch_and_cache_live_intraday(ticker: str, interval: str) -> list[dict]:
    """
    Live yfinance fallback used when the parquet file isn't ready yet.

    Flow:
      1. Return the Redis short-cache if still warm  (avoids repeated yf calls)
      2. Otherwise, call yfinance synchronously in a thread executor
      3. Serialise to the same OHLC dict shape that df_to_chart() produces
      4. Store in Redis with a 60-second TTL
    """
    redis_key = f"intraday:live:{ticker}:{interval}"

    # --- 1. warm Redis cache ------------------------------------------------
    try:
        cached = await redis_client.get(redis_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    # --- 2. blocking yfinance call in executor --------------------------------
    period = _LIVE_PERIOD.get(interval, "1d")

    def _sync_fetch() -> list[dict]:
        df = yf.download(
            ticker, period=period, interval=interval,
            auto_adjust=True, progress=False,
        )
        if df.empty:
            return []
        # flatten MultiIndex if present
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0].lower() for col in df.columns]
        else:
            df.columns = [col.lower() for col in df.columns]
        df.index.name = "timestamp"
        return df_to_chart(df.reset_index())

    try:
        loop = asyncio.get_running_loop()
        chart = await loop.run_in_executor(None, _sync_fetch)
        # --- 3 & 4. cache non-empty results ----------------------------------
        if chart:
            await redis_client.setex(redis_key, _LIVE_CACHE_TTL, json.dumps(chart))
        return chart
    except Exception as exc:
        print(f"[live fallback] {ticker}/{interval} failed: {exc}")
        return []


# ── rest of file unchanged ────────────────────────────────────────────────────

def normalize_ticker(value: str) -> str:
    ticker = value.strip().upper()
    if not TICKER_PATTERN.fullmatch(ticker):
        raise ValueError("Invalid ticker")
    return ticker

def load_stock_data(ticker_symbol: str, interval: str, period: str = None):
    try:
        df = load_parquet(ticker_symbol, interval)
    except FileNotFoundError:
        try:
            df_raw = yf.download(ticker_symbol, period=period or "1d", interval=interval,
                                 auto_adjust=True, progress=False)
        except Exception as e:
            raise ValueError(f"Error: {e}")
        if df_raw.empty:
            raise ValueError("No data found.")
        if isinstance(df_raw.columns, pd.MultiIndex):
            df_raw.columns = [col[0].lower() for col in df_raw.columns]
        else:
            df_raw.columns = [col.lower() for col in df_raw.columns]
        df_raw.index.name = "timestamp"
        df = df_raw.reset_index()

    column_mapping = {
        'close_col':  'close',
        'open_col':   'open',
        'high_col':   'high',
        'low_col':    'low',
        'volume_col': 'volume',
    }
    data = df.set_index("timestamp").copy()
    data = data.ffill()
    data = calculate_metrics(data, column_mapping)
    return data, column_mapping

def identify_columns(data, ticker_symbol):
    column_mapping = {}
    if isinstance(data.columns, pd.MultiIndex):
        cols = list(data.columns)
        def get(col):
            return (col, ticker_symbol) if (col, ticker_symbol) in cols else (col, '')
        column_mapping = {
            'close_col':  get('Close'),
            'open_col':   get('Open'),
            'high_col':   get('High'),
            'low_col':    get('Low'),
            'volume_col': get('Volume'),
        }
    else:
        for key in ['Close', 'Open', 'High', 'Low', 'Volume']:
            column_mapping[f"{key.lower()}_col"] = key
    return column_mapping

def calculate_metrics(data, column_mapping):
    if len(data) == 0:
        return data
    try:
        close_col  = column_mapping['close_col']
        volume_col = column_mapping['volume_col']
        data['Price_Change'] = data[close_col].pct_change() * 100
        data = compute_buy_price(data, close_col)
        if volume_col in data.columns:
            data['Volume_MA20'] = data[volume_col].rolling(window=20).mean()
            data['Relative_Volume'] = (
                data[volume_col] / data['Volume_MA20']
                if len(data) >= 20
                else data[volume_col] / data[volume_col].mean()
            )
    except Exception as e:
        print(f"Metrics calc error: {e}")
        data['Price_Change']    = np.nan
        data['Relative_Volume'] = np.nan
    return data

def compute_buy_price(data, close_col):
    def multiplier(price):
        return 1.0008 if price < 10000 else 1.00008
    data['Multiplier'] = data[close_col].apply(multiplier)
    data['Buy_Price']  = data[close_col] * data['Multiplier']
    return data

def asset_exists(ticker: str, interval: str) -> bool:
    path = BASE_DIR / ticker / interval / "data.parquet"
    print(f"Checking path: {path} - exists: {path.exists()}")
    return path.exists()

async def download_asset_worker(ticker: str):
    print(f"[Worker] Starting download for {ticker}")
    for interval, config in INTERVAL_CONFIG.items():
        await download_and_save(ticker, interval, config["period"])
    print(f"[Worker] Completed download for {ticker}")
    try:
        info = yf.Ticker(ticker).info
        name = info.get("longName") or info.get("shortName") or ticker
        await redis_client.set(f"meta:name:{ticker}", name)
    except Exception:
        await redis_client.set(f"meta:name:{ticker}", ticker)

def df_to_chart(df: pd.DataFrame) -> list[dict]:
    return [
        {
            "time":  int(row["timestamp"].timestamp()),
            "open":  round(float(row["open"]),  2),
            "high":  round(float(row["high"]),  2),
            "low":   round(float(row["low"]),   2),
            "close": round(float(row["close"]), 2),
        }
        for _, row in df.iterrows()
    ]