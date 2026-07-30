import asyncio
import json
import unittest
from unittest.mock import patch

from fastapi import BackgroundTasks, HTTPException

from routers.stocks import stocks
from routers.utils.stock_utils import normalize_ticker


class FakeRedis:
    def __init__(self, latest=None):
        self.latest = latest
        self.requested_key = None

    async def get(self, key):
        self.requested_key = key
        return self.latest


def candle(time, close):
    return {"time": time, "open": close, "high": close, "low": close, "close": close}


class IntradayCacheTests(unittest.TestCase):
    def test_normalize_ticker_uses_canonical_cache_key(self):
        self.assertEqual(normalize_ticker(" nq=f "), "NQ=F")
        with self.assertRaises(ValueError):
            normalize_ticker("../NQ")

    def test_intraday_uses_cached_chart_and_latest_tick(self):
        calls = []

        async def cached_chart(ticker, interval):
            calls.append((ticker, interval))
            return json.dumps({"data": [candle(10, 100), candle(11, 101)]}), 3

        redis = FakeRedis(json.dumps(candle(11, 105)))
        with (
            patch.object(stocks, "build_and_cache_chart", cached_chart),
            patch.object(stocks, "redis_client", redis),
            patch.object(stocks, "asset_exists", return_value=True),
        ):
            result = asyncio.run(stocks.get_intraday_data(
                BackgroundTasks(), " nq=f ", "1m",
            ))

        self.assertEqual(calls, [("NQ=F", "1m")])
        self.assertEqual(redis.requested_key, "last:price:finsec:NQ=F:1m")
        self.assertEqual([item["close"] for item in result], [100, 105])

    def test_intraday_rejects_invalid_ticker(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(stocks.get_intraday_data(
                BackgroundTasks(), "../NQ", "1m",
            ))
        self.assertEqual(error.exception.status_code, 400)
