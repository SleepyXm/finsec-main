from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.stocks.stocks import stock_router
from routers.utils.stock_utils import asset_exists, download_asset_worker
from routers.storage.retrieveparquet import load_parquet
from routers.storage.parquet import BASE_DIR, mark_worker_active
from routers.search import search_router
from routers.websocket import websocket_router, broadcast_stock_data, subscriptions, fetch_tasks
from routers.auth.auth import auth_router as auth
from routers.positions.positions import positions_router
from routers.auth.profile import profile_router
from routers.portfolio.portfolio_router import portfolio_router
from routers.positions.trade import trades_router
from routers.backtest.backtest import backtest_router
from routers.publish_price import price_router
from database import get_db, AsyncSessionLocal
from helpers.queries.assetquery import get_tracked_tickers
from sqlalchemy.future import select
from helpers.redis import redis_client
import asyncio, sys, json

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(stock_router, prefix="/api")
app.include_router(search_router, prefix="/api")
#app.include_router(websocket_router, prefix="/api")
#app.include_router(auth, prefix="/api/auth")
#app.include_router(positions_router, prefix="/api")
#app.include_router(profile_router, prefix="/api/user")
#app.include_router(portfolio_router, prefix="/api")
#app.include_router(trades_router, prefix="/api")
app.include_router(backtest_router, prefix="/api")
app.include_router(price_router, prefix="/api")



@app.on_event("startup")
async def startup_broadcast_tasks():
    if BASE_DIR.exists():
        existing_tickers = [p.name for p in BASE_DIR.iterdir() if p.is_dir()]
        for ticker in existing_tickers:
            print(f"[Startup] Queuing re-download for existing ticker: {ticker}")
            await mark_worker_active(ticker)
            asyncio.create_task(download_asset_worker(ticker))
            
            key = f"{ticker}_1m"
            if key not in fetch_tasks:
                subscriptions[key] = set()
                
                if asset_exists(ticker, "1m"):
                    load_parquet(ticker, "1m")
                    print(f"  [{ticker}] Loaded 1m data into cache on startup")
                fetch_tasks[key] = asyncio.create_task(broadcast_stock_data(ticker, "1m"))
                print(f"  [{ticker}] Broadcast task started on startup")

    

@app.get("/api/market/overview")
async def market_overview():
    tickers = [key.replace("_1m", "") for key in fetch_tasks.keys()]
    keys = [f"last:price:{ticker}:1m" for ticker in tickers]
    values = await redis_client.mget(keys)
    results = [json.loads(v) for v in values if v is not None]
    return results


@app.on_event("shutdown")
async def shutdown_cleanup():
    await redis_client.delete("active_workers")
    await redis_client.delete("failed_downloads")