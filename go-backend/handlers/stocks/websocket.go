package stocks

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"finsec-backend/services"

	"github.com/redis/go-redis/v9"
)

// Per ticker/interval, one singleflight group ensures only one
// chart/cache call fires and everyone else waits for its result
var chartGroup singleflight.Group
var broadcastGroup singleflight.Group

var pools sync.Map // key: "provider:ticker:interval" -> *WorkerPool

var errNoMarketData = errors.New("no market data")
var broadcastClient = &http.Client{Timeout: 15 * time.Second}

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

func startBroadcast(
	ctx context.Context,
	pythonURL, provider, ticker, interval string,
) error {
	key := fmt.Sprintf("%s:%s:%s", provider, ticker, interval)
	_, err, _ := broadcastGroup.Do(key, func() (any, error) {
		query := url.Values{
			"provider": {provider},
			"ticker":   {ticker},
			"interval": {interval},
		}
		request, err := http.NewRequestWithContext(
			ctx,
			http.MethodPost,
			pythonURL+"/api/internal/broadcast/start?"+query.Encode(),
			nil,
		)
		if err != nil {
			return nil, err
		}
		response, err := broadcastClient.Do(request)
		if err != nil {
			return nil, err
		}
		defer response.Body.Close()
		if response.StatusCode == http.StatusNotFound {
			return nil, errNoMarketData
		}
		if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
			return nil, fmt.Errorf("broadcast start returned %s", response.Status)
		}
		return nil, nil
	})
	return err
}

func primeChart(
	ctx context.Context,
	rdb *redis.Client,
	pythonURL, provider, ticker, interval string,
) (string, int, error) {
	chartKey := fmt.Sprintf("chart:%s:%s", ticker, interval)

	v, err, _ := chartGroup.Do(chartKey, func() (any, error) {

		// warm path
		if cached, err := rdb.Get(ctx, chartKey).Result(); err == nil && cached != "" {
			tp := 1
			if raw, err := rdb.Get(ctx, chartKey+":meta:tp").Result(); err == nil {
				if n, err := strconv.Atoi(raw); err == nil {
					tp = n
				}
			}
			return &primeResult{cached, tp}, nil
		}

		// cold path — data comes back in the response body
		query := url.Values{
			"provider": {provider},
			"ticker":   {ticker},
			"interval": {interval},
		}
		resp, err := http.Post(pythonURL+"/api/internal/chart/cache?"+query.Encode(), "", nil)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusAccepted { // 202 = still downloading
			return nil, fmt.Errorf("asset downloading")
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, err
		}

		tp := 1
		if s := resp.Header.Get("X-Total-Pages"); s != "" {
			if n, err := strconv.Atoi(s); err == nil {
				tp = n
			}
		}

		return &primeResult{string(body), tp}, nil
	})

	if err != nil {
		return "", 0, err
	}
	return v.(*primeResult).data, v.(*primeResult).totalPages, nil
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
	keys, _ := rdb.Keys(ctx, "last:price:*:*:1m").Result()
	for _, lastKey := range keys {
		parts := strings.Split(lastKey, ":")
		if len(parts) != 5 {
			continue
		}
		provider := parts[2]
		ticker := parts[3]
		interval := parts[4]
		key := fmt.Sprintf("%s:%s:%s", provider, ticker, interval)
		channel := fmt.Sprintf("price:%s:%s:%s", provider, ticker, interval)
		pool := getOrCreatePool(key, rdb, channel)
		log.Printf("[prewarm] pool ready for %s/%s", provider, ticker)
		_ = pool
	}
}
