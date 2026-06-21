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
	args := make([]any, 0, len(entries)*8)

	for i, entry := range entries {
		base := i*8 + 1

		valueParts = append(valueParts, fmt.Sprintf(
			"($%d::int, $%d::uuid, $%d::uuid, $%d::text, $%d::text, $%d::text, $%d::numeric, $%d::numeric)",
			base,
			base+1,
			base+2,
			base+3,
			base+4,
			base+5,
			base+6,
			base+7,
		))

		args = append(args,
			i,
			entry.AccountID,
			entry.BotID,
			entry.Ticker,
			entry.Action,
			entry.Side,
			entry.Quantity,
			entry.Price,
		)
	}

	query := fmt.Sprintf(`
		WITH input_rows (
			idx,
			account_id,
			bot_id,
			symbol,
			action,
			side,
			quantity,
			price
		) AS (
			VALUES %s
		),

		order_rows AS (
			SELECT
				gen_random_uuid() AS order_id,
				idx,
				account_id,
				bot_id,
				symbol,
				action,
				side,
				quantity,
				price
			FROM input_rows
		),

		inserted_orders AS (
			INSERT INTO orders (
				id,
				account_id,
				bot_id,
				symbol,
				side,
				order_type,
				quantity,
				price,
				status
			)
			SELECT
				order_id,
				account_id,
				bot_id,
				symbol,
				action,
				'market',
				quantity,
				price,
				'filled'
			FROM order_rows
			RETURNING id
		),

		inserted_positions AS (
			INSERT INTO positions (
				account_id,
				bot_id,
				symbol,
				side,
				quantity,
				entry_order_id,
				entry_price,
				status
			)
			SELECT
				o.account_id,
				o.bot_id,
				o.symbol,
				o.side,
				o.quantity,
				o.order_id,
				o.price,
				'open'
			FROM order_rows o
			INNER JOIN inserted_orders io
				ON io.id = o.order_id
			RETURNING id, entry_order_id
		)

		SELECT
			o.idx,
			o.order_id::text,
			p.id::text
		FROM order_rows o
		INNER JOIN inserted_positions p
			ON p.entry_order_id = o.order_id
		ORDER BY o.idx ASC
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
		var orderID string
		var positionID string

		if err := rows.Scan(&idx, &orderID, &positionID); err != nil {
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
			entry:      entries[idx],
			orderID:    orderID,
			positionID: positionID,
		}
	}

	if err := rows.Err(); err != nil {
		log.Printf("[flusher] bulk insert rows: %v", err)
		p.publishErrors(ctx, entries, fmt.Sprintf("bulk insert rows: %v", err))
		return false
	}

	for i, result := range results {
		if result.entry.TradeID == "" || result.orderID == "" || result.positionID == "" {
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
			PositionID: result.positionID,
			OrderID:    result.orderID,
			Symbol:     result.entry.Ticker,
			Side:       result.entry.Side,
			Quantity:   result.entry.Quantity,
			EntryPrice: result.entry.Price,
			Status:     "open",
			QueuedAt:   result.entry.QueuedAt,
			FlushedAt:  flushedAt,
		}

		confirms = append(confirms, confirm)
	}

	return confirms, nil
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
