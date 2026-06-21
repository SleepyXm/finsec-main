package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// WithRedis opts the pool into Redis queue and flusher functionality.
func (p *WorkerPool) WithRedis(rc *redis.Client) *WorkerPool {
	p.redisClient = rc
	return p
}

// StartFlusher starts the batch flusher and pub/sub subscriber.
//
// Call once after WithRedis.
func (p *WorkerPool) StartFlusher(ctx context.Context, db *sql.DB) {
	if p.redisClient == nil {
		log.Printf("[wspool] StartFlusher called without Redis client, skipping")
		return
	}

	if db == nil {
		log.Printf("[wspool] StartFlusher called without DB, skipping")
		return
	}

	go p.flushLoop(ctx, db)
	go p.subscribeConfirms(ctx)
}

// QueueTrade pushes a trade entry onto the Redis queue.
//
// Returns immediately. Confirmation arrives later through:
// Redis pub/sub -> local registry lookup -> WebSocket write.
func (p *WorkerPool) QueueTrade(ctx context.Context, entry QueueEntry) error {
	if p.redisClient == nil {
		return fmt.Errorf("redis client not set on pool")
	}

	entry.QueuedAt = time.Now().UTC().Format(time.RFC3339Nano)

	data, err := json.Marshal(entry)
	if err != nil {
		return fmt.Errorf("marshal entry: %w", err)
	}

	pipe := p.redisClient.Pipeline()

	pipe.RPush(ctx, redisTradePendingKey, data)
	lenCmd := pipe.LLen(ctx, redisTradePendingKey)

	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("queue push: %w", err)
	}

	if lenCmd.Val() >= maxBatchSize {
		p.triggerFlush()
	}

	return nil
}

func (p *WorkerPool) triggerFlush() {
	select {
	case p.flushSignal <- struct{}{}:
	default:
	}
}

func (p *WorkerPool) claimBatch(ctx context.Context, batchID string) (string, int, error) {
	if p.redisClient == nil {
		return "", 0, fmt.Errorf("redis client not set")
	}

	batchKey := redisTradeBatchKey(batchID)

	moved, err := claimTradeBatchScript.Run(
		ctx,
		p.redisClient,
		[]string{
			redisTradePendingKey,
			batchKey,
			redisTradeProcessingKey,
		},
		maxBatchSize,
		batchID,
		time.Now().UnixMilli(),
		tradeBatchTTL.Milliseconds(),
	).Int()

	if err != nil {
		return "", 0, fmt.Errorf("claim batch: %w", err)
	}

	return batchKey, moved, nil
}

func (p *WorkerPool) finishBatch(ctx context.Context, batchKey string, batchID string) error {
	if p.redisClient == nil {
		return fmt.Errorf("redis client not set")
	}

	return finishTradeBatchScript.Run(
		ctx,
		p.redisClient,
		[]string{
			batchKey,
			redisTradeProcessingKey,
		},
		batchID,
	).Err()
}
