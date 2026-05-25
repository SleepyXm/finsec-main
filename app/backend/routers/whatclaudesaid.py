Looking at your code, you're storing two types of data in Redis:

Chart data (chart:{ticker}:{interval}) — large historical JSON via build_and_cache_chart
Live price candles (last:price:{ticker}:{interval}) — small but frequent JSON via broadcast_stock_data

Here's the compression layer using zlib (built-in, no extra deps):
Server side — compress before writing to Redis:
pythonimport zlib

def compress(data: str) -> bytes:
    return zlib.compress(data.encode(), level=6)

def decompress(data: bytes) -> str:
    return zlib.decompress(data).decode()
Then swap in compression at the two Redis write points:
python# build_and_cache_chart — chart payload (largest, most benefit)
await r.set(cache_key, compress(json_str), ex=600)

# broadcast_stock_data — live candle snapshot
await r.set(last_key, compress(payload), ex=300)
And decompress on the two read points:
python# build_and_cache_chart cache hit
cached = await r.get(cache_key)
if cached:
    return decompress(cached)   # <-- was: return cached

# anywhere else you read last:price:* from Redis
raw = await r.get(last_key)
candle = json.loads(decompress(raw)) if raw else None
Client side — decompress after receiving:
If your client hits a REST endpoint that reads from Redis and returns the raw bytes, you need to decompress server-side before sending. But if you want true client-side decompression (browser or JS client), use pako for gzip instead:
python# server — use gzip/wbits=31 so browsers can decompress natively
def compress(data: str) -> bytes:
    return zlib.compress(data.encode(), zlib.Z_DEFAULT_COMPRESSION, wbits=31)  # gzip format
Then in the endpoint that serves the chart:
pythonfrom fastapi.responses import Response

@price_router.get("/chart/{ticker}/{interval}")
async def get_chart(ticker: str, interval: str):
    raw = await r.get(f"chart:{ticker}:{interval}")
    if not raw:
        raise HTTPException(404)
    return Response(
        content=raw,                          # already compressed bytes
        media_type="application/json",
        headers={"Content-Encoding": "gzip"} # browser decompresses automatically
    )
With Content-Encoding: gzip, browsers and fetch() clients decompress transparently — your JS doesn't need to do anything special. For a Node.js or non-browser client:
javascript// Node.js — manual decompress if not handled automatically
import { gunzip } from 'zlib'
import { promisify } from 'util'

const gunzipAsync = promisify(gunzip)

const res = await fetch('/chart/AAPL/1m')
const buf = await res.arrayBuffer()
const json = JSON.parse((await gunzipAsync(Buffer.from(buf))).toString())
Which format to pick:
ScenarioFormatWhyBrowser clientwbits=31 (gzip) + Content-Encoding headerZero client code, handled by browserNode / Python clientzlib.compress (deflate)Smaller overhead, simplerSSE / WebSocket streamSkip compression on candlesPayloads are ~200 bytes, not worth it
The chart payload is where you'll see the real gains — historical OHLCV JSON typically compresses 70–85% with zlib. The live candle snapshots in last:price:* are small enough that compression is optional; I'd only bother if you're storing many tickers.

Since your Python side is writing gzip-compressed bytes to Redis, you need to decompress in Go before writing to the WebSocket. Here's how to slot it in:
Decompress helper:
goimport (
    "bytes"
    "compress/gzip"
    "io"
)

func decompressGzip(data []byte) ([]byte, error) {
    r, err := gzip.NewReader(bytes.NewReader(data))
    if err != nil {
        return nil, err
    }
    defer r.Close()
    return io.ReadAll(r)
}
Then swap your Redis reads to use bytes instead of strings, and decompress before writing:
go// chart cache read — use Bytes() not Result()
cachedBytes, err := rdb.Get(ctx, chartKey).Bytes()
if err == redis.Nil {
    cachedBytes, err = primeChart(ctx, rdb, pythonURL, ticker, interval, chartKey)
}

if err == nil {
    decompressed, err := decompressGzip(cachedBytes)
    if err != nil {
        // fallback: try sending raw in case it's uncompressed legacy data
        decompressed = cachedBytes
    }
    if err := services.SafeWrite(wsc, decompressed); err != nil {
        return
    }
} else {
    if err := services.SafeWrite(wsc, []byte(
        `{"type":"downloading","message":"data is being prepared"}`,
    )); err != nil {
        return
    }
}

// last tick read
if lastBytes, err := rdb.Get(ctx, lastKey).Bytes(); err == nil && len(lastBytes) > 0 {
    decompressed, err := decompressGzip(lastBytes)
    if err != nil {
        decompressed = lastBytes // fallback
    }
    _ = services.SafeWrite(wsc, decompressed)
}
Also update primeChart to return []byte so you're not round-tripping through string:
gofunc primeChart(ctx context.Context, rdb *redis.Client, pythonURL, ticker, interval, chartKey string) ([]byte, error) {
    resp, err := http.Post(
        pythonURL+"/api/internal/chart/cache?ticker="+ticker+"&interval="+interval,
        "", nil,
    )
    if err != nil || resp.StatusCode != 200 {
        return nil, fmt.Errorf("prime failed")
    }

    // poll until Python has written the compressed chart into Redis
    for i := 0; i < 10; i++ {
        time.Sleep(500 * time.Millisecond)
        b, err := rdb.Get(ctx, chartKey).Bytes()
        if err == nil {
            return b, nil
        }
    }
    return nil, fmt.Errorf("chart not ready after priming")
}
The fallback decompressed = cachedBytes on decompression error is worth keeping during the rollout — any keys written before you deployed compression will still be raw JSON and will serve fine until they expire.