package stocks_old

import (
	"context"
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
