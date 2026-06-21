package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"time"
)

func (p *WorkerPool) flushLoop(ctx context.Context, db *sql.DB) {
	ticker := time.NewTicker(flushEvery)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			p.flush(context.Background(), db)
			return

		case <-ticker.C:
			p.flush(ctx, db)

		case <-p.flushSignal:
			p.flush(ctx, db)
			ticker.Reset(flushEvery)
		}
	}
}

func (p *WorkerPool) flush(ctx context.Context, db *sql.DB) {
	batchID := fmt.Sprintf("%d-%d", time.Now().UnixNano(), rand.Int63())

	batchKey, moved, err := p.claimBatch(ctx, batchID)
	if err != nil {
		log.Printf("[flusher] claim batch failed: %v", err)
		return
	}

	if moved == 0 {
		return
	}

	raw, err := p.redisClient.LRange(ctx, batchKey, 0, -1).Result()
	if err != nil {
		log.Printf("[flusher] read batch failed batch=%s: %v", batchID, err)
		return
	}

	entries := make([]QueueEntry, 0, len(raw))

	for _, item := range raw {
		var entry QueueEntry

		if err := json.Unmarshal([]byte(item), &entry); err != nil {
			log.Printf("[flusher] unmarshal error batch=%s: %v", batchID, err)
			continue
		}

		entries = append(entries, entry)
	}

	if len(entries) == 0 {
		if err := p.finishBatch(ctx, batchKey, batchID); err != nil {
			log.Printf("[flusher] finish empty batch failed batch=%s: %v", batchID, err)
		}

		return
	}

	log.Printf("[flusher] flushing batch=%s trades=%d", batchID, len(entries))

	if ok := p.bulkInsert(ctx, db, entries); !ok {
		log.Printf("[flusher] bulk insert failed batch=%s", batchID)
		return
	}

	if err := p.finishBatch(ctx, batchKey, batchID); err != nil {
		log.Printf("[flusher] finish batch failed batch=%s: %v", batchID, err)
		return
	}

	logFlushSummary(batchID, entries)
}

func logFlushSummary(batchID string, entries []QueueEntry) {
	var oldest time.Time
	var newest time.Time

	for _, entry := range entries {
		queuedAt, err := time.Parse(time.RFC3339Nano, entry.QueuedAt)
		if err != nil {
			continue
		}

		if oldest.IsZero() || queuedAt.Before(oldest) {
			oldest = queuedAt
		}

		if newest.IsZero() || queuedAt.After(newest) {
			newest = queuedAt
		}
	}

	if oldest.IsZero() || newest.IsZero() {
		log.Printf(
			"[flusher] flushed batch=%s trades=%d queued_span=unknown",
			batchID,
			len(entries),
		)

		return
	}

	log.Printf(
		"[flusher] flushed batch=%s trades=%d queued_span=%s→%s",
		batchID,
		len(entries),
		oldest.Format(time.RFC3339Nano),
		newest.Format(time.RFC3339Nano),
	)
}
