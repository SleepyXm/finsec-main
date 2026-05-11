package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net"
	"sync"
	"time"

	"github.com/gobwas/ws/wsutil"
	"github.com/redis/go-redis/v9"
)

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const (
	workerHardLimit  = 100
	workerSpawnLimit = 65

	flushEvery     = 150 * time.Millisecond
	redisQueueKey  = "trades:pending"
	redisPubSubKey = "trades:confirm:"
	queueEntryTTL  = 30 * time.Second
)

var (
	workerAdjectives = []string{"amber", "brisk", "cedar", "dusty", "ember", "frosty", "gilded", "hollow", "ivory", "jade"}
	workerNouns      = []string{"anvil", "birch", "crane", "drifter", "falcon", "gorge", "herald", "iron", "juniper", "knoll"}
)

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

type Message struct {
	Type    string
	Payload []byte
}

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

type WSConn struct {
	conn   net.Conn
	active chan struct{}
}

// RedisConn extends WSConn with an identity for queue routing
type RedisConn struct {
	connID string
	conn   net.Conn
	active chan struct{}
}

func NewWSConn(conn net.Conn) *WSConn {
	return &WSConn{
		conn:   conn,
		active: make(chan struct{}),
	}
}

func NewRedisConn(connID string, conn net.Conn) *RedisConn {
	return &RedisConn{
		connID: connID,
		conn:   conn,
		active: make(chan struct{}),
	}
}

func SafeWrite(c *WSConn, msg []byte) error {
	select {
	case <-c.active:
		return fmt.Errorf("connection closed")
	default:
		return wsutil.WriteServerText(c.conn, msg)
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

func (c *WSConn) Close() {
	close(c.active)
}

func (c *WSConn) Write(msg []byte) error {
	return SafeWrite(c, msg)
}

func (c *RedisConn) Close() {
	close(c.active)
}

func (c *RedisConn) Write(msg []byte) error {
	return SafeWriteRedis(c, msg)
}

// -----------------------------------------------------------------------
// Worker
// -----------------------------------------------------------------------

type Worker struct {
	name  string
	conns []*WSConn
	mu    sync.Mutex
	count int
	msgCh chan Message
}

func newWorkerName() string {
	return workerAdjectives[rand.Intn(len(workerAdjectives))] + "-" + workerNouns[rand.Intn(len(workerNouns))]
}

func (w *Worker) run() {
	for msg := range w.msgCh {
		w.mu.Lock()
		for _, c := range w.conns {
			if err := SafeWrite(c, msg.Payload); err != nil {
				log.Printf("[wspool] write error, connection likely closed: %v", err)
			}
		}
		w.mu.Unlock()
	}
}

// -----------------------------------------------------------------------
// WorkerPool
// -----------------------------------------------------------------------

type WorkerPool struct {
	workers     []*Worker
	mu          sync.Mutex
	msgCh       chan Message
	redisClient *redis.Client // nil if not needed

	// conn registry for targeted delivery — connID -> RedisConn
	registry   map[string]*RedisConn
	registryMu sync.RWMutex
}

func NewWorkerPool() *WorkerPool {
	p := &WorkerPool{
		msgCh:    make(chan Message, 256),
		registry: make(map[string]*RedisConn),
	}
	go p.fanOut()
	return p
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
	return p.redisClient.RPush(ctx, redisQueueKey, data).Err()
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
		}
	}
}

func (p *WorkerPool) flush(ctx context.Context, db *sql.DB) {
	raw, err := p.redisClient.LPopCount(ctx, redisQueueKey, 100_000).Result()
	if err == redis.Nil || len(raw) == 0 {
		return
	}
	if err != nil {
		log.Printf("[flusher] lpop error: %v", err)
		return
	}

	entries := make([]QueueEntry, 0, len(raw))
	for _, r := range raw {
		var e QueueEntry
		if err := json.Unmarshal([]byte(r), &e); err != nil {
			log.Printf("[flusher] unmarshal error: %v", err)
			continue
		}
		entries = append(entries, e)
	}
	if len(entries) == 0 {
		return
	}

	log.Printf("[flusher] flushing %d trades", len(entries))
	p.bulkInsert(ctx, db, entries)

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
		"[flusher] flushed=%d queued_span=%s→%s",
		len(entries),
		oldest.Format(time.RFC3339Nano),
		newest.Format(time.RFC3339Nano),
	)
}

func (p *WorkerPool) bulkInsert(ctx context.Context, db *sql.DB, entries []QueueEntry) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[flusher] begin tx: %v", err)
		p.publishErrors(ctx, entries, "begin tx failed")
		return
	}
	defer tx.Rollback()

	orderStmt, err := tx.PrepareContext(ctx,
		`INSERT INTO orders (account_id, bot_id, symbol, side, order_type, quantity, price, status)
		 VALUES ($1, $2, $3, $4, 'market', $5, $6, 'filled')
		 RETURNING id`,
	)
	if err != nil {
		log.Printf("[flusher] prepare orders: %v", err)
		p.publishErrors(ctx, entries, "prepare orders failed")
		return
	}
	defer orderStmt.Close()

	posStmt, err := tx.PrepareContext(ctx,
		`INSERT INTO positions (account_id, bot_id, symbol, side, quantity, entry_order_id, entry_price, status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')
		 RETURNING id`,
	)
	if err != nil {
		log.Printf("[flusher] prepare positions: %v", err)
		p.publishErrors(ctx, entries, "prepare positions failed")
		return
	}
	defer posStmt.Close()

	results := make([]result, 0, len(entries))

	for _, e := range entries {
		var orderID string
		if err := orderStmt.QueryRowContext(ctx,
			e.AccountID, e.BotID, e.Ticker, e.Action, e.Quantity, e.Price,
		).Scan(&orderID); err != nil {
			results = append(results, result{entry: e, err: fmt.Sprintf("insert order: %v", err)})
			continue
		}

		var positionID string
		if err := posStmt.QueryRowContext(ctx,
			e.AccountID, e.BotID, e.Ticker, e.Side, e.Quantity, orderID, e.Price,
		).Scan(&positionID); err != nil {
			results = append(results, result{entry: e, err: fmt.Sprintf("insert position: %v", err)})
			continue
		}

		results = append(results, result{entry: e, orderID: orderID, positionID: positionID})
	}

	// Publish confirms to pub/sub — subscriber delivers to the right conn
	flushedAt := time.Now().UTC().Format(time.RFC3339Nano)
	pipe := p.redisClient.Pipeline()
	for _, r := range results {
		var confirm QueueConfirm
		if r.err != "" {
			confirm = QueueConfirm{
				TradeID:    r.entry.TradeID,
				ConnID:     r.entry.ConnID,
				Symbol:     r.entry.Ticker,
				Side:       r.entry.Side,
				Quantity:   r.entry.Quantity,
				EntryPrice: r.entry.Price,
				Status:     "error",
				Error:      r.err,
				QueuedAt:   r.entry.QueuedAt,
				FlushedAt:  flushedAt,
			}
		} else {
			confirm = QueueConfirm{
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
		}
		data, _ := json.Marshal(confirm)
		pipe.Publish(ctx, redisPubSubKey+r.entry.ConnID, data)
	}

	if err := tx.Commit(); err != nil {
		log.Printf("[flusher] commit: %v", err)
		p.publishErrors(ctx, entries, fmt.Sprintf("commit failed: %v", err))
		return
	}
	pipe.Exec(ctx)
}

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

// -----------------------------------------------------------------------
// Pub/sub subscriber — delivers confirms to the right conn on this instance
// -----------------------------------------------------------------------

func (p *WorkerPool) subscribeConfirms(ctx context.Context) {
	// Subscribe to all confirm channels on this instance
	pubsub := p.redisClient.PSubscribe(ctx, redisPubSubKey+"*")
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var confirm QueueConfirm
			if err := json.Unmarshal([]byte(msg.Payload), &confirm); err != nil {
				log.Printf("[pubsub] unmarshal error: %v", err)
				continue
			}
			conn, ok := p.lookupConn(confirm.ConnID)
			if !ok {
				// connection not on this instance, another instance will deliver it
				continue
			}
			data, _ := json.Marshal(confirm)
			if err := conn.Write(data); err != nil {
				log.Printf("[pubsub] write error connID=%s: %v", confirm.ConnID, err)
			}
		}
	}
}

// -----------------------------------------------------------------------
// Existing pool methods — unchanged
// -----------------------------------------------------------------------

func (p *WorkerPool) fanOut() {
	for msg := range p.msgCh {
		p.mu.Lock()
		for _, w := range p.workers {
			select {
			case w.msgCh <- msg:
			default:
				log.Printf("[wspool] worker backed up, skipping message")
			}
		}
		p.mu.Unlock()
	}
}

func (p *WorkerPool) spawnWorker() *Worker {
	w := &Worker{
		name:  newWorkerName(),
		conns: make([]*WSConn, 0, workerHardLimit),
		msgCh: make(chan Message, 256),
	}
	p.workers = append(p.workers, w)
	go w.run()
	log.Printf("[wspool] spawned worker %q | total workers: %d", w.name, len(p.workers))
	return w
}

func (p *WorkerPool) AddConn(c *WSConn) {
	p.mu.Lock()
	defer p.mu.Unlock()

	var target *Worker
	for _, w := range p.workers {
		w.mu.Lock()
		if w.count < workerSpawnLimit {
			target = w
			w.mu.Unlock()
			break
		}
		w.mu.Unlock()
	}

	if target == nil {
		for _, w := range p.workers {
			w.mu.Lock()
			if w.count < workerHardLimit {
				target = w
				w.mu.Unlock()
				break
			}
			w.mu.Unlock()
		}
	}

	if target == nil {
		log.Printf("[wspool] emergency spawn — all workers at hard limit")
		target = p.spawnWorker()
	}

	target.mu.Lock()
	target.conns = append(target.conns, c)
	target.count++
	log.Printf("[wspool] [%s] %d connections", target.name, target.count)

	hasRoom := false
	for _, w := range p.workers {
		if w == target {
			continue
		}
		w.mu.Lock()
		if w.count < workerSpawnLimit {
			hasRoom = true
			w.mu.Unlock()
			break
		}
		w.mu.Unlock()
	}
	if !hasRoom && target.count >= workerSpawnLimit {
		log.Printf("[wspool] [%s] hit %d connections — spawning new worker", target.name, target.count)
		p.spawnWorker()
	}

	target.mu.Unlock()
}

func (p *WorkerPool) RemoveConn(c *WSConn) {
	p.mu.Lock()
	defer p.mu.Unlock()

	for i, w := range p.workers {
		w.mu.Lock()
		for j, wc := range w.conns {
			if wc == c {
				w.conns = append(w.conns[:j], w.conns[j+1:]...)
				w.count--
				log.Printf("[wspool] [%s] connection removed | now at %d", w.name, w.count)
				if w.count == 0 {
					close(w.msgCh)
					p.workers = append(p.workers[:i], p.workers[i+1:]...)
					log.Printf("[wspool] [%s] empty, removing | total workers: %d", w.name, len(p.workers))
				}
				w.mu.Unlock()
				return
			}
		}
		w.mu.Unlock()
	}
}

func (p *WorkerPool) Send(msg Message) {
	p.msgCh <- msg
}

func (c *WSConn) WriteMsg(msg []byte) error {
	return SafeWrite(c, msg)
}
