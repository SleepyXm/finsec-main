package stocks

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"finsec-backend/services"

	"github.com/gin-gonic/gin"
	"github.com/gobwas/ws"
	"github.com/gobwas/ws/wsutil"
	"github.com/redis/go-redis/v9"
)

var startedBroadcasts sync.Map

// Per ticker/interval, one singleflight group ensures only one
// chart/cache call fires and everyone else waits for its result
var chartGroup singleflight.Group

var pools sync.Map // key: "ticker:interval" -> *WorkerPool

func getOrCreatePool(key string, rdb *redis.Client, channel string) *services.WorkerPool {
	if p, ok := pools.Load(key); ok {
		return p.(*services.WorkerPool)
	}
	p := services.NewWorkerPool()
	actual, loaded := pools.LoadOrStore(key, p)
	if loaded {
		// another goroutine beat us, use theirs
		return actual.(*services.WorkerPool)
	}
	// we won the race, start the Redis feed
	go func() {
		ctx := context.Background()
		pubsub := rdb.Subscribe(ctx, channel)
		defer pubsub.Close()
		for msg := range pubsub.Channel() {
			p.Send(services.Message{Type: "price", Payload: []byte(msg.Payload)})
		}
	}()
	log.Printf("[wspool] new pool created for %s", key)
	return p
}

// StockDataHandlerRaw returns a plain http.HandlerFunc.
//
// Callers must mount this on http.ServeMux directly, not on a
// gin.RouterGroup — that is the whole point. See routes/ws.go.
func StockDataHandlerRaw(rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ticker := r.URL.Query().Get("ticker_symbol")
		interval := r.URL.Query().Get("interval")
		if interval == "" {
			interval = "1m"
		}

		// --------------------------------------------------------
		// Upgrade the HTTP connection to WebSocket.
		//
		// Because w is the real http.ResponseWriter (not wrapped by
		// Gin), gobwas/ws can reach net.Conn via a single Hijack()
		// call with no contention from Gin's internal mutex.
		// --------------------------------------------------------
		t0 := time.Now()
		conn, _, _, err := ws.UpgradeHTTP(r, w)
		log.Printf("[upgrade] %s/%s | %v", ticker, interval, time.Since(t0))
		if err != nil {
			// UpgradeHTTP has already written an HTTP error response;
			// nothing more to do here.
			return
		}
		defer conn.Close()

		// Wrap the raw net.Conn in your existing WSConn abstraction.
		// Nothing about this changes from the original handler.
		wsc := services.NewWSConn(conn)
		defer wsc.Close()

		ctx := context.Background()
		pythonURL := os.Getenv("PYTHON_URL")

		channel := fmt.Sprintf("price:%s:%s", ticker, interval)
		chartKey := fmt.Sprintf("chart:%s:%s", ticker, interval)
		broadcastKey := fmt.Sprintf("%s:%s", ticker, interval)

		// --------------------------------------------------------
		// Start the Python broadcast for this ticker/interval.
		//
		// CHANGE FROM ORIGINAL: the http.Post is now in a goroutine.
		//
		// Previously this was a blocking call in the hot path. The
		// first connection for any ticker/interval would stall here
		// waiting for the Python service to respond, while all other
		// connections for the same key piled up on the LoadOrStore.
		// Under load that stall was long enough to ripple into
		// ws_connecting latency for the connections that arrived
		// just after the first one.
		//
		// LoadOrStore still guarantees only one POST is ever sent per
		// broadcastKey — the goroutine just means we don't block the
		// WebSocket connection on the round-trip.
		// --------------------------------------------------------
		if _, alreadyStarted := startedBroadcasts.LoadOrStore(broadcastKey, struct{}{}); !alreadyStarted {
			go func() {
				http.Post(
					pythonURL+"/api/internal/broadcast/start?ticker="+ticker+"&interval="+interval,
					"", nil,
				)
			}()
		}

		// Get or create the connection pool for this ticker/interval.
		// Unchanged from original.
		pool := getOrCreatePool(broadcastKey, rdb, channel)
		pool.AddConn(wsc)
		defer pool.RemoveConn(wsc)

		// --------------------------------------------------------
		// Send the initial chart snapshot from Redis cache.
		// If the cache is cold, prime it from the Python service.
		// Unchanged from original.
		// --------------------------------------------------------
		cached, err := rdb.Get(ctx, chartKey).Result()
		if err == redis.Nil {
			cached, err = primeChart(ctx, rdb, pythonURL, ticker, interval, chartKey)
		}

		t4 := time.Now()
		if err == nil {
			if err := services.SafeWrite(wsc, []byte(cached)); err != nil {
				return
			}
		} else {
			// Cache is still cold (Python service hasn't produced data yet).
			// Tell the client to show a loading state.
			if err := services.SafeWrite(wsc, []byte(
				`{"type":"downloading","message":"data is being prepared"}`,
			)); err != nil {
				return
			}
		}
		log.Printf("[write] %s/%s | %v", ticker, interval, time.Since(t4))

		// Send the last known tick so the client has a current price
		// before the broadcast resumes. Unchanged from original.
		lastKey := fmt.Sprintf("last:price:%s:%s", ticker, interval)
		if last, err := rdb.Get(ctx, lastKey).Result(); err == nil && last != "" {
			_ = services.SafeWrite(wsc, []byte(last))
		}

		// --------------------------------------------------------
		// Connection monitor — block until the client disconnects.
		//
		// CHANGE FROM ORIGINAL: replaced wsutil.ReadClientData with
		// a manual header-read + io.Discard drain loop.
		//
		// wsutil.ReadClientData allocates a new []byte on every call
		// to hold the frame payload. At 1000 concurrent connections
		// that is continuous GC pressure even when clients are idle.
		//
		// Reading just the frame header and discarding the body is
		// zero-alloc: ws.ReadHeader reads into a fixed-size struct,
		// and io.CopyN into io.Discard never allocates on the heap
		// for the body bytes.
		//
		// Functionally identical to the original — we still return
		// (and trigger the deferred cleanup) the moment the client
		// closes or sends an unreadable frame.
		// --------------------------------------------------------
		for {
			hdr, err := ws.ReadHeader(conn)
			if err != nil {
				// Client closed, network error, or malformed frame.
				// Deferred conn.Close / pool.RemoveConn handle cleanup.
				return
			}

			// Drain the frame body so the connection stays in sync
			// for the next frame. We don't need the payload contents.
			if hdr.Length > 0 {
				if _, err := io.CopyN(io.Discard, conn, hdr.Length); err != nil {
					return
				}
			}

			// Optional: respond to ping frames to keep the connection
			// alive through proxies and load balancers.
			if hdr.OpCode == ws.OpPing {
				_ = wsutil.WriteServerMessage(conn, ws.OpPong, nil)
			}
		}
	}
}

func primeChart(ctx context.Context, rdb *redis.Client, pythonURL, ticker, interval, chartKey string) (string, error) {
	_, err, _ := chartGroup.Do(chartKey, func() (interface{}, error) {
		resp, pyErr := http.Post(
			pythonURL+"/api/internal/chart/cache?ticker="+ticker+"&interval="+interval,
			"", nil,
		)
		if pyErr == nil {
			resp.Body.Close()
		}
		return nil, pyErr
	})
	if err != nil {
		return "", err
	}
	return rdb.Get(ctx, chartKey).Result()
}

func LivePriceHandler(rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ticker := c.Query("ticker_symbol")
		interval := c.Query("interval")
		if interval == "" {
			interval = "1m"
		}

		conn, _, _, err := ws.UpgradeHTTP(c.Request, c.Writer)
		if err != nil {
			return
		}
		defer conn.Close()

		ctx := context.Background()

		wsc := services.NewWSConn(conn)
		defer wsc.Close()

		// last tick directly to this connection before joining pool
		lastKey := fmt.Sprintf("last:price:%s:%s", ticker, interval)
		if last, err := rdb.Get(ctx, lastKey).Result(); err == nil && last != "" {
			_ = wsc.Write([]byte(last))
			log.Printf("[last_tick] %s/%s | sent", ticker, interval)
		} else {
			log.Printf("[last_tick] %s/%s | miss err=%v", ticker, interval, err)
		}

		// join the same pool as StockDataHandler
		channel := fmt.Sprintf("price:%s:%s", ticker, interval)
		broadcastKey := fmt.Sprintf("%s:%s", ticker, interval)
		pool := getOrCreatePool(broadcastKey, rdb, channel)
		pool.AddConn(wsc)
		defer pool.RemoveConn(wsc)

		// block until client disconnects
		for {
			if _, _, err := wsutil.ReadClientData(conn); err != nil {
				return
			}
		}
	}
}
