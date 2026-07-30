import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from routers import providers, publish_price, websocket
from routers.utils import stock_utils


class FakeRedis:
    def __init__(self):
        self.published = []

    async def publish(self, channel, payload):
        self.published.append((channel, json.loads(payload)))


class BroadcastLifecycleTests(unittest.TestCase):
    def setUp(self):
        publish_price.fetch_tasks.clear()

    def tearDown(self):
        for task in publish_price.fetch_tasks.values():
            task.cancel()
        publish_price.fetch_tasks.clear()

    def test_lists_finsec_as_the_current_provider(self):
        self.assertEqual(
            asyncio.run(providers.list_providers()),
            {"providers": [{"id": "finsec", "name": "Finsec"}]},
        )

    def test_start_rejects_unknown_provider_before_fetching(self):
        with patch.object(publish_price, "fetch_latest") as fetch_latest:
            with self.assertRaises(HTTPException) as error:
                asyncio.run(publish_price.start_broadcast("other", "AAPL", "1m"))

        self.assertEqual(error.exception.status_code, 400)
        fetch_latest.assert_not_called()
        self.assertEqual(publish_price.fetch_tasks, {})

    def test_start_rejects_ticker_with_no_data_without_creating_task(self):
        with (
            patch.object(publish_price, "is_download_failed", AsyncMock(return_value=False)),
            patch.object(publish_price, "mark_download_failed", AsyncMock()) as mark_failed,
            patch.object(publish_price, "fetch_latest", return_value=None) as fetch_latest,
        ):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(publish_price.start_broadcast("finsec", "BOMBOCLAT", "1m"))

        self.assertEqual(error.exception.status_code, 404)
        fetch_latest.assert_called_once_with("finsec", "BOMBOCLAT", "1m")
        mark_failed.assert_awaited_once_with("BOMBOCLAT", "1m")
        self.assertEqual(publish_price.fetch_tasks, {})

    def test_start_does_not_refetch_a_known_empty_feed(self):
        with (
            patch.object(publish_price, "is_download_failed", AsyncMock(return_value=True)),
            patch.object(publish_price, "fetch_latest") as fetch_latest,
        ):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(publish_price.start_broadcast("finsec", "BOMBOCLAT", "1m"))

        self.assertEqual(error.exception.status_code, 404)
        fetch_latest.assert_not_called()

    def test_start_publishes_before_starting_background_broadcast(self):
        events = []
        candle = {"provider": "finsec", "ticker": "AAPL", "source": "real"}

        async def publish(*args):
            events.append(("published", args))

        async def broadcast(*args):
            events.append(("broadcast", args))

        async def start():
            result = await publish_price.start_broadcast("finsec", "AAPL", "1m")
            events.append(("returned", result))
            await asyncio.sleep(0)

        with (
            patch.object(publish_price, "is_download_failed", AsyncMock(return_value=False)),
            patch.object(publish_price, "fetch_latest", return_value=candle),
            patch.object(publish_price, "publish_candle", publish),
            patch.object(publish_price, "broadcast_stock_data", broadcast),
        ):
            asyncio.run(start())

        self.assertEqual([event[0] for event in events], ["published", "returned", "broadcast"])

    def test_broadcast_stops_after_first_empty_provider_response(self):
        redis = FakeRedis()
        with (
            patch.object(websocket, "r", redis),
            patch.object(websocket, "fetch_latest", return_value=None) as fetch_latest,
        ):
            asyncio.run(websocket.broadcast_stock_data("finsec", "BOMBOCLAT", "1m"))

        fetch_latest.assert_called_once_with("finsec", "BOMBOCLAT", "1m")
        self.assertEqual(redis.published, [
            (
                "price:finsec:BOMBOCLAT:1m",
                {
                    "error": "no data",
                    "provider": "finsec",
                    "ticker": "BOMBOCLAT",
                    "terminal": True,
                },
            ),
        ])

    def test_download_worker_stops_after_first_empty_interval(self):
        download = AsyncMock(return_value=False)
        worker_done = AsyncMock()
        with (
            patch.object(stock_utils, "download_and_save", download),
            patch.object(stock_utils, "mark_worker_done", worker_done),
        ):
            asyncio.run(stock_utils.download_asset_worker("BOMBOCLAT"))

        download.assert_awaited_once()
        worker_done.assert_awaited_once_with("BOMBOCLAT")
