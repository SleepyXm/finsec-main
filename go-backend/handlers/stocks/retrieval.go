package stocks

import (
	"context"
	"errors"
	"finsec-backend/market"
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
		provider, err := market.NormalizeProvider(c.DefaultQuery("provider", market.FinsecProvider))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ticker, err := market.NormalizeTicker(c.Param("ticker"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		rawInterval := c.DefaultQuery("interval", "1m")
		interval, err := market.NormalizeInterval(rawInterval)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if !strings.EqualFold(c.GetHeader("Upgrade"), "websocket") ||
			!strings.Contains(strings.ToLower(c.GetHeader("Connection")), "upgrade") ||
			c.GetHeader("Sec-WebSocket-Key") == "" ||
			c.GetHeader("Sec-WebSocket-Version") != "13" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "websocket upgrade required"})
			return
		}
		pythonURL := os.Getenv("PYTHON_URL")
		broadcastKey := fmt.Sprintf("%s:%s:%s", provider, ticker, interval)
		if _, opened := pools.Load(broadcastKey); !opened {
			err = startBroadcast(c.Request.Context(), pythonURL, provider, ticker, interval)
			if errors.Is(err, errNoMarketData) {
				c.JSON(http.StatusNotFound, gin.H{"error": "no data available"})
				return
			}
			if err != nil {
				c.JSON(http.StatusBadGateway, gin.H{"error": "market data provider unavailable"})
				return
			}
		}
		t0 := time.Now()
		conn, _, _, err := ws.UpgradeHTTP(c.Request, c.Writer)
		log.Printf("[upgrade] %s/%s/%s | %v", provider, ticker, interval, time.Since(t0))
		if err != nil {
			return
		}
		defer conn.Close()
		wsc := services.NewWSConn(conn)
		defer wsc.Close()
		ctx := context.Background()
		channel := fmt.Sprintf("price:%s:%s:%s", provider, ticker, interval)
		pool := getOrCreatePool(broadcastKey, rdb, channel)
		pool.AddConn(wsc)
		defer pool.RemoveConn(wsc)

		// always serve the flat key on connect — this is the live-stitched data
		chartKey := fmt.Sprintf("chart:%s:%s", ticker, interval)
		t4 := time.Now()
		cached, err := rdb.Get(ctx, chartKey).Result()
		if err == redis.Nil {
			cached, _, err = primeChart(ctx, rdb, pythonURL, provider, ticker, interval)
		}
		if err == nil {
			if err := wsc.Write([]byte(cached)); err != nil {
				return
			}
		} else {
			if err := wsc.Write([]byte(
				`{"type":"downloading","message":"data is being prepared"}`,
			)); err != nil {
				return
			}
		}
		log.Printf("[write] %s/%s/%s | %v", provider, ticker, interval, time.Since(t4))

		lastKey := fmt.Sprintf("last:price:%s:%s:%s", provider, ticker, interval)
		if last, err := rdb.Get(ctx, lastKey).Result(); err == nil && last != "" {
			_ = wsc.Write([]byte(last))
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
				_ = wsc.Write([]byte(data))
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
		keys, err := rdb.Keys(ctx, "last:price:*:*:1m").Result()
		if err != nil || len(keys) == 0 {
			return
		}

		out := make(chan []byte, 256)
		var wg sync.WaitGroup

		for _, key := range keys {
			key := key
			parts := strings.Split(key, ":")
			if len(parts) != 5 {
				continue
			}
			provider := parts[2]
			ticker := parts[3]
			interval := parts[4]
			channel := fmt.Sprintf("price:%s:%s:%s", provider, ticker, interval)

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
				if err := wsc.Write(payload); err != nil {
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
