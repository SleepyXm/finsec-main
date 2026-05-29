package stocks

import (
	"context"
	"finsec-backend/services"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gobwas/ws"
	"github.com/gobwas/ws/wsutil"
	"github.com/redis/go-redis/v9"
)

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
		wsc := services.NewWSConn(conn)
		defer wsc.Close()
		ctx := context.Background()
		pythonURL := os.Getenv("PYTHON_URL")
		channel := fmt.Sprintf("price:%s:%s", ticker, interval)
		broadcastKey := fmt.Sprintf("%s:%s", ticker, interval)
		if _, started := startedBroadcasts.LoadOrStore(broadcastKey, struct{}{}); !started {
			http.Post(
				pythonURL+"/api/internal/broadcast/start?ticker="+ticker+"&interval="+interval,
				"", nil,
			)
		}
		pool := getOrCreatePool(broadcastKey, rdb, channel)
		pool.AddConn(wsc)
		defer pool.RemoveConn(wsc)

		// always serve the flat key on connect — this is the live-stitched data
		chartKey := fmt.Sprintf("chart:%s:%s", ticker, interval)
		t4 := time.Now()
		cached, err := rdb.Get(ctx, chartKey).Result()
		if err == redis.Nil {
			cached, _, err = primeChart(ctx, rdb, pythonURL, ticker, interval)
		}
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

		lastKey := fmt.Sprintf("last:price:%s:%s", ticker, interval)
		if last, err := rdb.Get(ctx, lastKey).Result(); err == nil && last != "" {
			_ = services.SafeWrite(wsc, []byte(last))
		}

		// connection monitor — paginated requests come in over the socket
		for {
			msg, _, err := wsutil.ReadClientData(conn)
			if err != nil {
				return
			}
			pageKey := extractPageKey(ticker, interval, msg)
			if pageKey == "" {
				continue
			}
			if data, err := rdb.Get(ctx, pageKey).Result(); err == nil {
				_ = services.SafeWrite(wsc, []byte(data))
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

		wsc := services.NewWSConn(conn)
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
				if err := services.SafeWrite(wsc, payload); err != nil {
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
