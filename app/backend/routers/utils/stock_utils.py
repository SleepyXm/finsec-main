import pandas as pd
import yfinance as yf
import numpy as np
from ..storage.parquet import BASE_DIR, download_and_save, INTERVAL_CONFIG
from ..storage.retrieveparquet import load_parquet
from helpers.redis import redis_client

INTERVALS = {
    "1m", "5m", "15m", "1h", "1d", "1wk", "1mo"
}

PERIODS = {
    "1d", "5d", "1mo", "3mo", "6mo", "1y", "5y"
}

def load_stock_data(ticker_symbol: str, interval: str, period: str = None):
    """
    Load from local parquet cache. `period` is ignored — we serve the full stored range.
    Falls back to live yfinance only if parquet doesn't exist yet.
    """

    try:
        df = load_parquet(ticker_symbol, interval)
    except FileNotFoundError:
        # fallback: live fetch (only hits during initial download race)
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
        'close_col': 'close',
        'open_col':  'open',
        'high_col':  'high',
        'low_col':   'low',
        'volume_col': 'volume',
    }

    # work on a copy so we don't mutate the cached df
    data = df.set_index("timestamp").copy()
    data = data.ffill()
    data = calculate_metrics(data, column_mapping)
    return data, column_mapping

def identify_columns(data, ticker_symbol):
    column_mapping = {}
    if isinstance(data.columns, pd.MultiIndex):
        cols = list(data.columns)
        def get(col): return (col, ticker_symbol) if (col, ticker_symbol) in cols else (col, '')
        column_mapping = {
            'close_col': get('Close'),
            'open_col': get('Open'),
            'high_col': get('High'),
            'low_col': get('Low'),
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
        close_col = column_mapping['close_col']
        volume_col = column_mapping['volume_col']

        data['Price_Change'] = data[close_col].pct_change() * 100
        data = compute_buy_price(data, close_col)

        if volume_col in data.columns:
            data['Volume_MA20'] = data[volume_col].rolling(window=20).mean()
            if len(data) >= 20:
                data['Relative_Volume'] = data[volume_col] / data['Volume_MA20']
            else:
                data['Relative_Volume'] = data[volume_col] / data[volume_col].mean()
    except Exception as e:
        print(f"Metrics calc error: {e}")
        data['Price_Change'] = np.nan
        data['Relative_Volume'] = np.nan
    return data

def compute_buy_price(data, close_col):
    def multiplier(price): return 1.0008 if price < 10000 else 1.00008
    data['Multiplier'] = data[close_col].apply(multiplier)
    data['Buy_Price'] = data[close_col] * data['Multiplier']
    return data


def asset_exists(ticker: str, interval: str) -> bool:
    path =  (BASE_DIR / ticker / interval / "data.parquet")
    print(f"Checking path: {path} - exists: {path.exists()}")
    return path.exists()



async def download_asset_worker(ticker: str):
    """Downloads all intervals for a ticker. Runs in background."""
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
            "time": int(row["timestamp"].timestamp()),
            "open": row["open"],
            "high": row["high"],
            "low": row["low"],
            "close": row["close"],
        }
        for _, row in df.iterrows()
    ]