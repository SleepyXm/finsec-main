package stocks

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
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

func PrewarmFromRedis(rdb *redis.Client, pythonURL string) {
	ctx := context.Background()
	keys, _ := rdb.Keys(ctx, "last:price:*:1m").Result()
	for _, channel := range keys {
		// channel is "price:NQ=F:1m", extract ticker
		parts := strings.Split(channel, ":")
		if len(parts) < 3 {
			continue
		}
		ticker := parts[2]
		key := fmt.Sprintf("%s:1m", ticker)
		startedBroadcasts.LoadOrStore(key, struct{}{})
		pool := getOrCreatePool(key, rdb, channel)
		log.Printf("[prewarm] pool ready for %s", ticker)
		_ = pool
	}
}

func StockDataHandler(rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ticker := c.Query("ticker_symbol")
		interval := c.Query("interval")
		if interval == "" {
			interval = "1m"
		}

		t0 := time.Now()
		conn, _, _, err := ws.UpgradeHTTP(c.Request, c.Writer)
		log.Printf("[upgrade] %s/%s | %v", ticker, interval, time.Since(t0))
		if err != nil {
			return
		}
		defer conn.Close()

		// wrap in WSConn
		wsc := services.NewWSConn(conn)
		defer wsc.Close()

		ctx := context.Background()
		pythonURL := os.Getenv("PYTHON_URL")

		channel := fmt.Sprintf("price:%s:%s", ticker, interval)
		chartKey := fmt.Sprintf("chart:%s:%s", ticker, interval)
		broadcastKey := fmt.Sprintf("%s:%s", ticker, interval)

		// start broadcast once
		if _, started := startedBroadcasts.LoadOrStore(broadcastKey, struct{}{}); !started {
			http.Post(
				pythonURL+"/api/internal/broadcast/start?ticker="+ticker+"&interval="+interval,
				"", nil,
			)
		}

		// get or create pool for this ticker/interval
		pool := getOrCreatePool(broadcastKey, rdb, channel)
		pool.AddConn(wsc)
		defer pool.RemoveConn(wsc)

		// cache
		cached, err := rdb.Get(ctx, chartKey).Result()
		if err == redis.Nil {
			cached, err = primeChart(ctx, rdb, pythonURL, ticker, interval, chartKey)
		}

		// initial write directly to this connection
		t4 := time.Now()
		if err == nil {
			if err := services.SafeWrite(wsc, []byte(cached)); err != nil {
				return
			}
		} else {
			if err := services.SafeWrite(wsc, []byte(
				`{"type":"downloading","message":"data is being prepared"}`,
			)); err != nil {
				return
			}
		}
		log.Printf("[write] %s/%s | %v", ticker, interval, time.Since(t4))

		// last tick directly to this connection
		lastKey := fmt.Sprintf("last:price:%s:%s", ticker, interval)
		if last, err := rdb.Get(ctx, lastKey).Result(); err == nil && last != "" {
			_ = services.SafeWrite(wsc, []byte(last))
		}

		// connection monitor — block until client disconnects
		for {
			if _, _, err := wsutil.ReadClientData(conn); err != nil {
				return
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
