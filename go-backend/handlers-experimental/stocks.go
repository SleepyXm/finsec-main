package handlers_experimental

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

	"finsec-backend/services_experimental"

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

func primeChart(ctx context.Context, rdb *redis.Client, pythonURL, ticker, interval, chartKey string) ([]byte, error) {
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
		return nil, err
	}
	return rdb.Get(ctx, chartKey).Bytes() // []byte, not string
}

func getOrCreatePool(key string, rdb *redis.Client, channel string) *services_experimental.WorkerPool {
	if p, ok := pools.Load(key); ok {
		return p.(*services_experimental.WorkerPool)
	}
	p := services_experimental.NewWorkerPool()
	actual, loaded := pools.LoadOrStore(key, p)
	if loaded {
		// another goroutine beat us, use theirs
		return actual.(*services_experimental.WorkerPool)
	}
	// we won the race, start the Redis feed
	go func() {
		ctx := context.Background()
		pubsub := rdb.Subscribe(ctx, channel)
		defer pubsub.Close()
		for msg := range pubsub.Channel() {
			p.Send(services_experimental.Message{
				Type:    "price",
				Payload: []byte(msg.Payload), // compressed bytes
				//Binary:  true,                // add this field if needed
			})
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
		wsc := services_experimental.NewWSConn(conn)
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
		cachedBytes, err := rdb.Get(ctx, chartKey).Bytes()
		if err == redis.Nil {
			cachedBytes, err = primeChart(ctx, rdb, pythonURL, ticker, interval, chartKey)
		}

		// initial write directly to this connection
		t4 := time.Now()
		if err == nil {
			if err := services_experimental.SafeWriteBinary(wsc, []byte(cachedBytes)); err != nil {
				return
			}
		} else {
			msg, err := services_experimental.Compress(`{"type":"downloading","message":"data is being prepared"}`)
			if err != nil {
				log.Println("compress error:", err)
				return
			}
			_ = services_experimental.SafeWriteBinary(wsc, msg)
		}
		log.Printf("[write] %s/%s | %v", ticker, interval, time.Since(t4))

		// last tick directly to this connection
		lastKey := fmt.Sprintf("last:price:%s:%s", ticker, interval)
		if last, err := rdb.Get(ctx, lastKey).Bytes(); err == nil && len(last) > 0 {
			_ = services_experimental.SafeWriteBinary(wsc, last)
		}

		// connection monitor — block until client disconnects
		for {
			if _, _, err := wsutil.ReadClientData(conn); err != nil {
				return
			}
		}
	}
}

func MarketOverviewHandler(rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		conn, _, _, err := ws.UpgradeHTTP(c.Request, c.Writer)
		if err != nil {
			return
		}
		defer conn.Close()

		wsc := services_experimental.NewWSConn(conn)
		defer wsc.Close()

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel() // this kills all pubsub goroutines when handler exits

		// scan all active tickers from Redis
		keys, err := rdb.Keys(ctx, "last:price:*:1m").Result()
		if err != nil || len(keys) == 0 {
			return
		}

		out := make(chan []byte, 256)
		var wg sync.WaitGroup

		for _, key := range keys {
			key := key
			// extract ticker from "last:price:BTC-USD:1m"
			ticker := strings.TrimPrefix(strings.TrimSuffix(key, ":1m"), "last:price:")
			channel := fmt.Sprintf("price:%s:1m", ticker)

			// send last known price immediately
			if last, err := rdb.Get(ctx, key).Result(); err == nil && last != "" {
				select {
				case out <- []byte(last):
				default:
				}
			}

			wg.Add(1)
			go func() {
				defer wg.Done()
				pubsub := rdb.Subscribe(ctx, channel)
				defer pubsub.Close()

				for {
					msg, err := pubsub.ReceiveMessage(ctx)
					if err != nil {
						return
					}
					select {
					case out <- []byte(msg.Payload):
					default:
					}
				}
			}()
		}

		go func() {
			wg.Wait()
			close(out)
		}()

		go func() {
			for payload := range out {
				if err := services_experimental.SafeWrite(wsc, payload); err != nil {
					return
				}
			}
		}()

		// block until client disconnects
		for {
			if _, _, err := wsutil.ReadClientData(conn); err != nil {
				return
			}
		}
	}
}
