import yfinance as yf
import pandas as pd
from pathlib import Path
from datetime import datetime
from helpers.redis import redis_client
from .retrieveparquet import invalidate_cache

# --- Config ---
TICKERS = ["AAPL", "BTC-USD", "MSFT", "NQ=F"]  # expand as needed

INTERVAL_CONFIG = {
    "1m":  {"period": "7d",  "capped": True},
    "5m":  {"period": "60d",  "capped": True},
    "15m": {"period": "60d", "capped": False},
    "30m": {"period": "60d", "capped": False},
    "1h":  {"period": "2y", "capped": False},
    "1d":  {"period": "max", "capped": False},
}

#INTERVAL_CONFIG = {
#    "1m":  {"period": "3d",  "capped": False},
#    "5m":  {"period": "1wk",  "capped": False},
#    "15m": {"period": "1mo", "capped": False},
#    "30m": {"period": "1mo", "capped": False},
#    "1h":  {"period": "3mo", "capped": False},
#    "1d":  {"period": "max", "capped": False},
#}

BASE_DIR = Path("data/history")

ACTIVE_WORKERS = set()
FAILED_DOWNLOADS = set()


async def is_worker_active(ticker: str) -> bool:
    return await redis_client.sismember("active_workers", ticker)

async def is_download_failed(ticker: str, interval: str) -> bool:
    return await redis_client.sismember("failed_downloads", f"{ticker}_{interval}")

async def mark_worker_active(ticker: str):
    await redis_client.sadd("active_workers", ticker)

async def mark_worker_done(ticker: str):
    await redis_client.srem("active_workers", ticker)

async def mark_download_failed(ticker: str, interval: str):
    await redis_client.sadd("failed_downloads", f"{ticker}_{interval}")

async def download_and_save(ticker: str, interval: str, period: str):

    key = f"{ticker}_{interval}"
    if await is_download_failed(ticker, interval):
        print(f"  Skipping {ticker} {interval} — previously failed")
        return
    
    try:
    
        print(f"Downloading {ticker} | {interval} | {period}...")

        try:
            df = yf.download(
                tickers=ticker,
                interval=interval,
                period=period,
                auto_adjust=True,
                progress=False
            )
        except Exception as e:
            print(f"  Failed {ticker} | {interval}: {e}")
            FAILED_DOWNLOADS.add(f"{ticker}_{interval}")
            return

        if df.empty:
            print(f"  No data returned for {ticker} {interval}")
            FAILED_DOWNLOADS.add(f"{ticker}_{interval}")
            return

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0].lower() for col in df.columns]
        else:
            df.columns = [col.lower() for col in df.columns]

        df.index.name = "timestamp"
        df = df.reset_index()

        save_dir = BASE_DIR / ticker / interval
        save_dir.mkdir(parents=True, exist_ok=True)
        save_path = save_dir / "data.parquet"

        df.to_parquet(save_path, index=False, engine="pyarrow")
        print(f"  Saved {len(df)} rows → {save_path}")

    except Exception as e:
        print(f"  Failed {ticker} {interval}: {e}")
        await mark_download_failed(ticker, interval)
        return

def run_initial_download():
    for ticker in TICKERS:
        for interval, config in INTERVAL_CONFIG.items():
            download_and_save(ticker, interval, config["period"])


def append_at_close(ticker: str, interval: str, cap_rows: int = None):
    """
    Run this at market close for each ticker/interval.
    Appends the latest candle and optionally trims from the head.
    """
    config = INTERVAL_CONFIG[interval]
    save_path = BASE_DIR / ticker / interval / "data.parquet"

    # Fetch just the latest candle
    df_new = yf.download(
        tickers=ticker,
        interval=interval,
        period=config["period"],
        auto_adjust=True,
        progress=False
    )

    if df_new.empty:
        print(f"  No new data for {ticker} {interval}")
        return

    if isinstance(df_new.columns, pd.MultiIndex):
        df_new.columns = [col[0].lower() for col in df_new.columns]
    else:
        df_new.columns = [col.lower() for col in df_new.columns]

    df_new.index.name = "timestamp"
    df_new = df_new.reset_index()

    if save_path.exists():
        df_existing = pd.read_parquet(save_path)
        df_combined = pd.concat([df_existing, df_new]).drop_duplicates(
            subset=["timestamp"]
        ).sort_values("timestamp").reset_index(drop=True)
    else:
        df_combined = df_new

    # Sliding window for capped intervals
    if cap_rows and config["capped"]:
        df_combined = df_combined.tail(cap_rows).reset_index(drop=True)
        print(f"  Trimmed to last {cap_rows} rows")

    df_combined.to_parquet(save_path, index=False, engine="pyarrow")
    print(f"  Updated {save_path} → {len(df_combined)} rows")

    invalidate_cache(ticker, interval)
    print(f"  Cache invalidated for {ticker} {interval}")


if __name__ == "__main__":
    # First time setup - download everything
    run_initial_download()

    # Example of what you'd call at market close
    # for ticker in TICKERS:
    #     append_at_close(ticker, "1m", cap_rows=390)   # 1 trading day of 1m candles
    #     append_at_close(ticker, "5m", cap_rows=234)   # 3 trading days of 5m candles
    #     append_at_close(ticker, "1h")
    #     append_at_close(ticker, "1d")