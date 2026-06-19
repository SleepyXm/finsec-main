package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net"
	"strings"
	"time"

	"github.com/gobwas/ws/wsutil"
	"github.com/redis/go-redis/v9"
)

// Lua Script for atomicity:

var claimBatchScript = redis.NewScript(`
-- KEYS[1] = pending list
-- KEYS[2] = batch list
-- KEYS[3] = processing zset
-- ARGV[1] = max batch size
-- ARGV[2] = batch id
-- ARGV[3] = now unix milliseconds

local max = tonumber(ARGV[1])
local batch_id = ARGV[2]
local now_ms = ARGV[3]

local moved = 0

for i = 1, max do
	local item = redis.call("RPOP", KEYS[1])

	if not item then
		break
	end

	redis.call("LPUSH", KEYS[2], item)
	moved = moved + 1
end

if moved > 0 then
	redis.call("ZADD", KEYS[3], now_ms, batch_id)
end

return moved
`)

// Delete script
var finishBatchScript = redis.NewScript(`
-- KEYS[1] = batch list
-- KEYS[2] = processing zset
-- ARGV[1] = batch id

redis.call("DEL", KEYS[1])
redis.call("ZREM", KEYS[2], ARGV[1])

return 1
`)

// QueueEntry is what gets pushed to Redis on trade intake
type QueueEntry struct {
	TradeID   string  `json:"trade_id"`
	ConnID    string  `json:"conn_id"`
	AccountID string  `json:"account_id"`
	BotID     *string `json:"bot_id,omitempty"`
	Ticker    string  `json:"ticker"`
	Action    string  `json:"action"`
	Side      string  `json:"side"`
	Quantity  float64 `json:"quantity"`
	Price     float64 `json:"price"`
	QueuedAt  string  `json:"queued_at"`
}

// QueueConfirm is published to Redis pub/sub after flush and delivered to the client
type QueueConfirm struct {
	TradeID    string  `json:"trade_id"`
	ConnID     string  `json:"conn_id"`
	PositionID string  `json:"position_id,omitempty"`
	OrderID    string  `json:"order_id,omitempty"`
	Symbol     string  `json:"symbol"`
	Side       string  `json:"side"`
	Quantity   float64 `json:"quantity"`
	EntryPrice float64 `json:"entry_price"`
	Status     string  `json:"status"` // "open" | "error"
	Error      string  `json:"error,omitempty"`
	QueuedAt   string  `json:"queued_at"`
	FlushedAt  string  `json:"flushed_at"`
}

type result struct {
	entry      QueueEntry
	orderID    string
	positionID string
	err        string
}

// -----------------------------------------------------------------------
// WSConn
// -----------------------------------------------------------------------

// RedisConn extends WSConn with an identity for queue routing
type RedisConn struct {
	connID string
	conn   net.Conn
	active chan struct{}
}

func NewRedisConn(connID string, conn net.Conn) *RedisConn {
	return &RedisConn{
		connID: connID,
		conn:   conn,
		active: make(chan struct{}),
	}
}

func SafeWriteRedis(c *RedisConn, msg []byte) error {
	select {
	case <-c.active:
		return fmt.Errorf("connection closed")
	default:
		return wsutil.WriteServerText(c.conn, msg)
	}
}

func (c *RedisConn) Close() {
	close(c.active)
}

func (c *RedisConn) Write(msg []byte) error {
	return SafeWriteRedis(c, msg)
}

// WithRedis opts the pool into Redis queue and flusher functionality
func (p *WorkerPool) WithRedis(rc *redis.Client) *WorkerPool {
	p.redisClient = rc
	return p
}

// StartFlusher starts the 150ms batch flusher and pub/sub subscriber.
// Call once after WithRedis, passing the db and a context.
func (p *WorkerPool) StartFlusher(ctx context.Context, db *sql.DB) {
	if p.redisClient == nil {
		log.Printf("[wspool] StartFlusher called without Redis client, skipping")
		return
	}
	go p.flushLoop(ctx, db)
	go p.subscribeConfirms(ctx)
}

// -----------------------------------------------------------------------
// Registry — tracks RedisConn by connID for targeted delivery
// -----------------------------------------------------------------------

func (p *WorkerPool) RegisterConn(c *RedisConn) {
	p.registryMu.Lock()
	p.registry[c.connID] = c
	p.registryMu.Unlock()
}

func (p *WorkerPool) UnregisterConn(c *RedisConn) {
	p.registryMu.Lock()
	delete(p.registry, c.connID)
	p.registryMu.Unlock()
}

func (p *WorkerPool) lookupConn(connID string) (*RedisConn, bool) {
	p.registryMu.RLock()
	c, ok := p.registry[connID]
	p.registryMu.RUnlock()
	return c, ok
}

// -----------------------------------------------------------------------
// Queue — intake, called from any handler
// -----------------------------------------------------------------------

// QueueTrade pushes a trade entry onto the Redis queue.
// Returns immediately — confirmation arrives via pub/sub -> WebSocket.
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
	pipe.RPush(ctx, redisQueueKey, data)
	lenCmd := pipe.LLen(ctx, redisQueueKey)
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

// -----------------------------------------------------------------------
// Flusher — drains queue every 150ms, bulk inserts to DB
// -----------------------------------------------------------------------

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
	for _, r := range raw {
		var e QueueEntry
		if err := json.Unmarshal([]byte(r), &e); err != nil {
			log.Printf("[flusher] unmarshal error batch=%s: %v", batchID, err)
			continue
		}
		entries = append(entries, e)
	}

	if len(entries) == 0 {
		return
	}

	log.Printf("[flusher] flushing batch=%s trades=%d", batchID, len(entries))

	success := p.bulkInsert(ctx, db, entries)
	if !success {
		log.Printf("[flusher] bulk insert failed batch=%s", batchID)
		return
	}

	if err := finishBatchScript.Run(
		ctx,
		p.redisClient,
		[]string{
			batchKey,
			redisProcessingKey,
		},
		batchID,
	).Err(); err != nil {
		log.Printf("[flusher] finish batch failed batch=%s: %v", batchID, err)
		return
	}

	var oldest, newest time.Time

	for _, e := range entries {
		t, err := time.Parse(time.RFC3339Nano, e.QueuedAt)
		if err != nil {
			continue
		}
		if oldest.IsZero() || t.Before(oldest) {
			oldest = t
		}
		if newest.IsZero() || t.After(newest) {
			newest = t
		}
	}

	log.Printf(
		"[flusher] flushed batch=%s trades=%d queued_span=%s→%s",
		batchID,
		len(entries),
		oldest.Format(time.RFC3339Nano),
		newest.Format(time.RFC3339Nano),
	)
}

func (p *WorkerPool) bulkInsert(ctx context.Context, db *sql.DB, entries []QueueEntry) bool {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[flusher] begin tx: %v", err)
		p.publishErrors(ctx, entries, "begin tx failed")
		return false
	}
	defer tx.Rollback()

	if len(entries) == 0 {
		return true
	}

	valueParts := make([]string, 0, len(entries))
	args := make([]any, 0, len(entries)*8)

	for i, e := range entries {
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
			e.AccountID,
			e.BotID,
			e.Ticker,
			e.Action,
			e.Side,
			e.Quantity,
			e.Price,
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

	results := make([]result, len(entries))

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

		results[idx] = result{
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

	for i, r := range results {
		if r.entry.TradeID == "" || r.orderID == "" || r.positionID == "" {
			log.Printf("[flusher] missing bulk insert result idx=%d", i)
			p.publishErrors(ctx, entries, "missing bulk insert result")
			return false
		}
	}

	flushedAt := time.Now().UTC().Format(time.RFC3339Nano)
	pipe := p.redisClient.Pipeline()

	for _, r := range results {
		confirm := QueueConfirm{
			TradeID:    r.entry.TradeID,
			ConnID:     r.entry.ConnID,
			PositionID: r.positionID,
			OrderID:    r.orderID,
			Symbol:     r.entry.Ticker,
			Side:       r.entry.Side,
			Quantity:   r.entry.Quantity,
			EntryPrice: r.entry.Price,
			Status:     "open",
			QueuedAt:   r.entry.QueuedAt,
			FlushedAt:  flushedAt,
		}

		data, err := json.Marshal(confirm)
		if err != nil {
			log.Printf("[flusher] marshal confirm: %v", err)
			p.publishErrors(ctx, entries, fmt.Sprintf("marshal confirm: %v", err))
			return false
		}

		pipe.Publish(ctx, redisPubSubKey+r.entry.ConnID, data)
	}

	if err := tx.Commit(); err != nil {
		log.Printf("[flusher] commit: %v", err)
		p.publishErrors(ctx, entries, fmt.Sprintf("commit failed: %v", err))
		return false
	}

	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf("[flusher] publish confirms: %v", err)
	}

	return true
}

// For errors that occur after the transaction has been committed, we still want to publish an error to the client.

func (p *WorkerPool) publishErrors(ctx context.Context, entries []QueueEntry, reason string) {
	flushedAt := time.Now().UTC().Format(time.RFC3339Nano)
	pipe := p.redisClient.Pipeline()
	for _, e := range entries {
		confirm := QueueConfirm{
			TradeID:   e.TradeID,
			ConnID:    e.ConnID,
			Status:    "error",
			Error:     reason,
			FlushedAt: flushedAt,
		}
		data, _ := json.Marshal(confirm)
		pipe.Publish(ctx, redisPubSubKey+e.ConnID, data)
	}
	pipe.Exec(ctx)
}

func (p *WorkerPool) claimBatch(ctx context.Context, batchID string) (string, int, error) {
	if p.redisClient == nil {
		return "", 0, fmt.Errorf("redis client not set")
	}

	batchKey := redisBatchPrefix + batchID

	moved, err := claimBatchScript.Run(
		ctx,
		p.redisClient,
		[]string{
			redisQueueKey,
			batchKey,
			redisProcessingKey,
		},
		maxBatchSize,
		batchID,
		time.Now().UnixMilli(),
	).Int()

	if err != nil {
		return "", 0, fmt.Errorf("claim batch: %w", err)
	}

	return batchKey, moved, nil
}
