package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"
)

func (p *WorkerPool) bulkInsert(ctx context.Context, db *sql.DB, entries []QueueEntry) bool {
	if len(entries) == 0 {
		return true
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[flusher] begin tx: %v", err)
		p.publishErrors(ctx, entries, "begin tx failed")
		return false
	}

	defer tx.Rollback()

	valueParts := make([]string, 0, len(entries))
	args := make([]any, 0, len(entries)*7)

	for i, entry := range entries {
		base := i*7 + 1

		valueParts = append(valueParts, fmt.Sprintf(
			"($%d::int, $%d::uuid, $%d::uuid, $%d::text, $%d::text, $%d::numeric, $%d::numeric)",
			base,
			base+1,
			base+2,
			base+3,
			base+4,
			base+5,
			base+6,
		))

		args = append(args,
			i,
			entry.TradeID,
			entry.AccountID,
			entry.Ticker,
			entry.Action,
			entry.Quantity,
			entry.Price,
		)
	}

	query := fmt.Sprintf(`
		WITH input_rows (
			idx,
			id,
			account_id,
			symbol,
			side,
			quantity,
			price
		) AS (
			VALUES %s
		),

		inserted_trades AS (
			INSERT INTO trades (
				id,
				account_id,
				executed_by,
				symbol,
				side,
				order_type,
				quantity,
				price,
				entry_price,
				status,
				opened_at
			)
			SELECT
				id,
				account_id,
				'user',
				symbol,
				side,
				'market',
				quantity,
				price,
				price,
				'open',
				NOW()
			FROM input_rows
			RETURNING id
		)

		SELECT
			i.idx,
			t.id::text
		FROM input_rows i
		INNER JOIN inserted_trades t
			ON t.id = i.id
		ORDER BY i.idx ASC
	`, strings.Join(valueParts, ","))

	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		log.Printf("[flusher] bulk insert query: %v", err)
		p.publishErrors(ctx, entries, fmt.Sprintf("bulk insert failed: %v", err))
		return false
	}

	defer rows.Close()

	results := make([]bulkInsertResult, len(entries))

	for rows.Next() {
		var idx int
		var tradeID string

		if err := rows.Scan(&idx, &tradeID); err != nil {
			log.Printf("[flusher] scan bulk insert result: %v", err)
			p.publishErrors(ctx, entries, fmt.Sprintf("scan bulk insert result: %v", err))
			return false
		}

		if idx < 0 || idx >= len(entries) {
			log.Printf("[flusher] invalid bulk insert idx=%d", idx)
			p.publishErrors(ctx, entries, "invalid bulk insert result index")
			return false
		}

		results[idx] = bulkInsertResult{
			entry:   entries[idx],
			tradeID: tradeID,
		}
	}

	if err := rows.Err(); err != nil {
		log.Printf("[flusher] bulk insert rows: %v", err)
		p.publishErrors(ctx, entries, fmt.Sprintf("bulk insert rows: %v", err))
		return false
	}

	for i, result := range results {
		if result.entry.TradeID == "" || result.tradeID == "" {
			log.Printf("[flusher] missing bulk insert result idx=%d", i)
			p.publishErrors(ctx, entries, "missing bulk insert result")
			return false
		}
	}

	confirms, err := buildQueueConfirms(results)
	if err != nil {
		log.Printf("[flusher] build confirms: %v", err)
		p.publishErrors(ctx, entries, fmt.Sprintf("build confirms failed: %v", err))
		return false
	}

	if err := tx.Commit(); err != nil {
		log.Printf("[flusher] commit: %v", err)
		p.publishErrors(ctx, entries, fmt.Sprintf("commit failed: %v", err))
		return false
	}

	p.publishConfirms(ctx, confirms)

	return true
}

func buildQueueConfirms(results []bulkInsertResult) ([]QueueConfirm, error) {
	flushedAt := time.Now().UTC().Format(time.RFC3339Nano)

	confirms := make([]QueueConfirm, 0, len(results))

	for _, result := range results {
		confirm := QueueConfirm{
			TradeID:    result.entry.TradeID,
			ConnID:     result.entry.ConnID,
			Symbol:     result.entry.Ticker,
			Side:       tradeSide(result.entry.Action),
			Quantity:   result.entry.Quantity,
			Price:      result.entry.Price,
			EntryPrice: result.entry.Price,
			OrderType:  "market",
			Status:     "open",
			QueuedAt:   result.entry.QueuedAt,
			FlushedAt:  flushedAt,
		}

		confirms = append(confirms, confirm)
	}

	return confirms, nil
}

func tradeSide(action string) string {
	if action == "buy" {
		return "long"
	}
	return "short"
}

func (p *WorkerPool) publishConfirms(ctx context.Context, confirms []QueueConfirm) {
	if p.redisClient == nil {
		log.Printf("[flusher] redis client not set, cannot publish confirms")
		return
	}

	pipe := p.redisClient.Pipeline()

	for _, confirm := range confirms {
		data, err := json.Marshal(confirm)
		if err != nil {
			log.Printf("[flusher] marshal confirm tradeID=%s connID=%s: %v", confirm.TradeID, confirm.ConnID, err)
			continue
		}

		pipe.Publish(ctx, redisTradeConfirmChannel(confirm.ConnID), data)
	}

	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf("[flusher] publish confirms: %v", err)
	}
}

func (p *WorkerPool) publishErrors(ctx context.Context, entries []QueueEntry, reason string) {
	if p.redisClient == nil {
		log.Printf("[flusher] redis client not set, cannot publish errors reason=%s", reason)
		return
	}

	flushedAt := time.Now().UTC().Format(time.RFC3339Nano)

	pipe := p.redisClient.Pipeline()

	for _, entry := range entries {
		confirm := QueueConfirm{
			TradeID:   entry.TradeID,
			ConnID:    entry.ConnID,
			Status:    "error",
			Error:     reason,
			QueuedAt:  entry.QueuedAt,
			FlushedAt: flushedAt,
		}

		data, err := json.Marshal(confirm)
		if err != nil {
			log.Printf("[flusher] marshal error confirm tradeID=%s connID=%s: %v", entry.TradeID, entry.ConnID, err)
			continue
		}

		pipe.Publish(ctx, redisTradeConfirmChannel(entry.ConnID), data)
	}

	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf("[flusher] publish errors: %v", err)
	}
}
