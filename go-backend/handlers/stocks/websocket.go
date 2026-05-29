package stocks

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"

	"golang.org/x/sync/singleflight"

	"finsec-backend/services"

	"github.com/redis/go-redis/v9"
)

var startedBroadcasts sync.Map

// Per ticker/interval, one singleflight group ensures only one
// chart/cache call fires and everyone else waits for its result
var chartGroup singleflight.Group

var pools sync.Map // key: "ticker:interval" -> *WorkerPool

func extractPageKey(ticker, interval string, msg []byte) string {
	idx := bytes.Index(msg, []byte(`"page":`))
	if idx == -1 {
		return ""
	}
	numStart := idx + 7
	numEnd := numStart
	for numEnd < len(msg) && msg[numEnd] >= '0' && msg[numEnd] <= '9' {
		numEnd++
	}
	if numEnd == numStart {
		return ""
	}
	return fmt.Sprintf("chart:%s:%s:page:%s", ticker, interval, msg[numStart:numEnd])
}

func primeChart(ctx context.Context, rdb *redis.Client, pythonURL, ticker, interval string) (string, int, error) {
	chartKey := fmt.Sprintf("chart:%s:%s", ticker, interval)
	_, err, _ := chartGroup.Do(chartKey, func() (interface{}, error) {
		if cached, err := rdb.Get(ctx, chartKey).Result(); err == nil && cached != "" {
			return nil, nil
		}
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
		return "", 0, err
	}
	data, err := rdb.Get(ctx, chartKey).Result()
	if err != nil {
		return "", 0, err
	}
	// parse total_pages out of the flat payload if present
	var parsed map[string]interface{}
	totalPages := 1
	if json.Unmarshal([]byte(data), &parsed) == nil {
		if tp, ok := parsed["total_pages"].(float64); ok {
			totalPages = int(tp)
		}
	}
	return data, totalPages, nil
}

func getOrCreatePool(key string, rdb *redis.Client, channel string) *services.WorkerPool {
	if p, ok := pools.Load(key); ok {
		return p.(*services.WorkerPool)
	}
	p := services.NewWorkerPool()
	actual, loaded := pools.LoadOrStore(key, p)
	if loaded {
		return actual.(*services.WorkerPool)
	}
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
