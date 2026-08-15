from fastapi import APIRouter, HTTPException, Response
import asyncio
from routers.websocket import broadcast_stock_data, fetch_tasks, build_and_cache_chart, fetch_latest, publish_candle
from routers.utils.stock_utils import INTERVALS, asset_exists, download_asset_worker, normalize_provider, normalize_ticker
from routers.storage.parquet import is_download_failed, is_worker_active, mark_download_failed, mark_worker_active

price_router = APIRouter()

@price_router.post("/internal/broadcast/start")
async def start_broadcast(provider: str, ticker: str, interval: str = "1m"):
    try:
        provider = normalize_provider(provider)
        ticker = normalize_ticker(ticker)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    interval = interval.strip().lower()
    if interval not in INTERVALS:
        raise HTTPException(status_code=400, detail="Invalid interval")

    key = (provider, ticker, interval)
    if key not in fetch_tasks or fetch_tasks[key].done():
        if await is_download_failed(ticker, interval):
            raise HTTPException(status_code=404, detail="No data available")
        try:
            candle = await asyncio.to_thread(fetch_latest, provider, ticker, interval)
        except Exception as error:
            raise HTTPException(status_code=502, detail="Provider unavailable") from error
        if candle is None:
            await mark_download_failed(ticker, interval)
            raise HTTPException(status_code=404, detail="No data available")
        await publish_candle(provider, ticker, interval, candle)
        fetch_tasks[key] = asyncio.create_task(broadcast_stock_data(provider, ticker, interval))
        return {"status": "started", "key": ":".join(key)}
    return {"status": "already_running", "key": ":".join(key)}

@price_router.delete("/internal/broadcast/stop")
async def stop_broadcast(provider: str, ticker: str, interval: str = "1m"):
    key = (
        normalize_provider(provider),
        normalize_ticker(ticker),
        interval.strip().lower(),
    )
    if key in fetch_tasks:
        fetch_tasks[key].cancel()
        del fetch_tasks[key]
        return {"status": "stopped"}
    return {"status": "not_running"}

@price_router.get("/internal/broadcast/status")
async def broadcast_status():
    return {
        ":".join(k): ("running" if not t.done() else "dead")
        for k, t in fetch_tasks.items()
    }

@price_router.post("/internal/chart/cache")
async def prime_chart_cache(provider: str, ticker: str, interval: str = "1m"):
    try:
        provider = normalize_provider(provider)
        ticker = normalize_ticker(ticker)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    interval = interval.strip().lower()
    if interval not in INTERVALS:
        raise HTTPException(status_code=400, detail="Invalid interval")

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
