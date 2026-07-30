import asyncio
import json

from routers import websocket


class FakePipeline:
    def __init__(self, redis, transaction):
        self.redis = redis
        self.transaction = transaction
        self.commands = []

    async def __aenter__(self):
        self.redis.transactions.append(self.transaction)
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def set(self, key, value, **options):
        self.commands.append((key, value, options))
        return self

    async def execute(self):
        for key, value, options in self.commands:
            if options.get("nx") and key in self.redis.values:
                continue
            self.redis.values[key] = value


class FakeRedis:
    def __init__(self, values):
        self.values = values
        self.transactions = []

    async def get(self, key):
        return self.values.get(key)

    async def mget(self, keys):
        return [self.values.get(key) for key in keys]

    def pipeline(self, transaction=False):
        return FakePipeline(self, transaction)


def candle(time, close=None):
    value = float(close if close is not None else time)
    return {
        "time": time,
        "open": value,
        "high": value,
        "low": value,
        "close": value,
    }


def page(number, total_pages, total_rows, times):
    return json.dumps({
        "type": "historical",
        "page": number,
        "total_pages": total_pages,
        "total_rows": total_rows,
        "data": [candle(time) for time in times],
    })


def test_page_one_updates_appends_then_rolls_back_as_a_domino(monkeypatch):
    cache_key = "chart:TEST:1m"
    redis = FakeRedis({
        cache_key: page(1, 2, 5, [20, 21]),
        f"{cache_key}:page:1": page(1, 2, 5, [20, 21]),
        f"{cache_key}:page:2": page(2, 2, 5, [10, 11, 12]),
        f"{cache_key}:meta:tp": "2",
    })

    monkeypatch.setattr(websocket, "r", redis)
    monkeypatch.setattr(websocket, "PAGE_SIZE", 3)
    websocket._chart_locks.clear()

    asyncio.run(websocket.append_candle_to_page_one("TEST", "1m", candle(21, 99)))
    updated_page_one = json.loads(redis.values[f"{cache_key}:page:1"])
    assert [row["time"] for row in updated_page_one["data"]] == [20, 21]
    assert updated_page_one["data"][-1]["close"] == 99

    asyncio.run(websocket.append_candle_to_page_one("TEST", "1m", candle(22)))
    full_page_one = json.loads(redis.values[f"{cache_key}:page:1"])
    assert [row["time"] for row in full_page_one["data"]] == [20, 21, 22]
    assert full_page_one["total_pages"] == 2

    asyncio.run(websocket.append_candle_to_page_one("TEST", "1m", candle(23)))

    new_page_one = json.loads(redis.values[f"{cache_key}:page:1"])
    moved_page_two = json.loads(redis.values[f"{cache_key}:page:2"])
    moved_page_three = json.loads(redis.values[f"{cache_key}:page:3"])

    assert [row["time"] for row in new_page_one["data"]] == [23]
    assert [row["time"] for row in moved_page_two["data"]] == [20, 21, 22]
    assert [row["time"] for row in moved_page_three["data"]] == [10, 11, 12]
    assert [new_page_one["page"], moved_page_two["page"], moved_page_three["page"]] == [1, 2, 3]
    assert all(payload["total_pages"] == 3 for payload in (new_page_one, moved_page_two, moved_page_three))
    assert redis.values[f"{cache_key}:meta:tp"] == "3"
    assert redis.transactions[-1] is True
