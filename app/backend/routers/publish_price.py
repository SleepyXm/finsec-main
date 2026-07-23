from fastapi import APIRouter, Response
import asyncio
from routers.websocket import broadcast_stock_data, fetch_tasks, build_and_cache_chart
from routers.utils.stock_utils import asset_exists, download_asset_worker
from routers.storage.parquet import is_worker_active, mark_worker_active

price_router = APIRouter()

@price_router.post("/internal/broadcast/start")
async def start_broadcast(ticker: str, interval: str = "1m"):
    key = f"{ticker}_{interval}"
    if key not in fetch_tasks or fetch_tasks[key].done():
        fetch_tasks[key] = asyncio.create_task(broadcast_stock_data(ticker, interval))
        return {"status": "started", "key": key}
    return {"status": "already_running", "key": key}

@price_router.delete("/internal/broadcast/stop")
async def stop_broadcast(ticker: str, interval: str = "1m"):
    key = f"{ticker}_{interval}"
    if key in fetch_tasks:
        fetch_tasks[key].cancel()
        del fetch_tasks[key]
        return {"status": "stopped"}
    return {"status": "not_running"}

@price_router.get("/internal/broadcast/status")
async def broadcast_status():
    return {
        k: ("running" if not t.done() else "dead")
        for k, t in fetch_tasks.items()
    }

@price_router.post("/internal/chart/cache")
async def prime_chart_cache(ticker: str, interval: str = "1m"):
    if not asset_exists(ticker, interval):
        if not await is_worker_active(ticker):
            await mark_worker_active(ticker)
            asyncio.create_task(download_asset_worker(ticker))
        return Response(
            content='{"status":"downloading"}',
            media_type="application/json",
            status_code=202,
        )

    flat_payload, total_pages = await build_and_cache_chart(ticker, interval)

    return Response(
        content=flat_payload,
        media_type="application/json",
        headers={"X-Total-Pages": str(total_pages)},
    )
