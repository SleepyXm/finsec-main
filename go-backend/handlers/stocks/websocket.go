package stocks

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/gin-gonic/gin"
	"github.com/gobwas/ws"
	"github.com/gobwas/ws/wsutil"
	"github.com/redis/go-redis/v9"
)

var startedBroadcasts sync.Map

// Per ticker/interval, one singleflight group ensures only one
// chart/cache call fires and everyone else waits for its result
var chartGroup singleflight.Group

func safeWrite(conn net.Conn, active <-chan struct{}, msg []byte) error {
	select {
	case <-active:
		return fmt.Errorf("connection closed")
	default:
		return wsutil.WriteServerText(conn, msg)
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

		// IMPORTANT: lifecycle guard
		active := make(chan struct{})
		defer close(active)

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

		// cache
		cached, err := rdb.Get(ctx, chartKey).Result()
		if err == redis.Nil {
			cached, err = primeChart(ctx, rdb, pythonURL, ticker, interval, chartKey)
		}

		// initial write
		t4 := time.Now()
		if err == nil {
			if err := safeWrite(conn, active, []byte(cached)); err != nil {
				return
			}
		} else {
			if err := safeWrite(conn, active, []byte(
				`{"type":"downloading","message":"data is being prepared"}`,
			)); err != nil {
				return
			}
		}
		log.Printf("[write] %s/%s | %v", ticker, interval, time.Since(t4))

		// subscribe
		pubsub := rdb.Subscribe(ctx, channel)
		ch := pubsub.Channel()
		defer pubsub.Close()

		// last tick
		lastKey := fmt.Sprintf("last:price:%s:%s", ticker, interval)
		if last, err := rdb.Get(ctx, lastKey).Result(); err == nil && last != "" {
			_ = safeWrite(conn, active, []byte(last))
		}

		// connection monitor
		done := make(chan struct{})
		go func() {
			defer close(done)
			for {
				if _, _, err := wsutil.ReadClientData(conn); err != nil {
					return
				}
			}
		}()

		// pubsub loop (CRITICAL FIXED)
		for {
			select {
			case msg, ok := <-ch:
				if !ok {
					return
				}
				if err := safeWrite(conn, active, []byte(msg.Payload)); err != nil {
					return
				}

			case <-done:
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

		pubsub := rdb.Subscribe(ctx, fmt.Sprintf("price:%s:%s", ticker, interval))
		ch := pubsub.Channel()
		defer pubsub.Close()

		lastKey := fmt.Sprintf("last:price:%s:%s", ticker, interval)
		if last, err := rdb.Get(ctx, lastKey).Result(); err == nil && last != "" {
			wsutil.WriteServerText(conn, []byte(last))
			log.Printf("[last_tick] %s/%s | sent", ticker, interval)
		} else {
			log.Printf("[last_tick] %s/%s | miss err=%v", ticker, interval, err)
		}

		done := make(chan struct{})

		go func() {
			defer close(done)
			for {
				if _, _, err := wsutil.ReadClientData(conn); err != nil {
					return
				}
			}
		}()

		for {
			select {
			case msg, ok := <-ch:
				if !ok {
					return
				}
				if err := wsutil.WriteServerText(conn, []byte(msg.Payload)); err != nil {
					return
				}
			case <-done:
				return
			}
		}
	}
}
