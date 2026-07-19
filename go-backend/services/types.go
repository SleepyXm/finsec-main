package services

import (
	"net"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	flushEvery   = 150 * time.Millisecond
	maxBatchSize = 500

	tradeBatchTTL = 30 * time.Second
)

const (
	redisTradePendingKey    = "trades:pending"
	redisTradeBatchPrefix   = "trades:batch:"
	redisTradeProcessingKey = "trades:processing"
	redisTradeConfirmPrefix = "trades:confirm:"
)

const (
	workerHardLimit  = 250
	workerSpawnLimit = 125
)

// QueueEntry is pushed to Redis on trade intake.
type QueueEntry struct {
	TradeID   string  `json:"trade_id"`
	ConnID    string  `json:"conn_id"`
	AccountID string  `json:"account_id"`
	Ticker    string  `json:"ticker"`
	Action    string  `json:"action"`
	Quantity  float64 `json:"quantity"`
	Price     float64 `json:"price"`
	QueuedAt  string  `json:"queued_at"`
}

// QueueConfirm is published to Redis pub/sub after flush and delivered
// to the matching WebSocket connection on whichever instance owns it.
type QueueConfirm struct {
	TradeID    string  `json:"trade_id"`
	ConnID     string  `json:"conn_id"`
	Symbol     string  `json:"symbol"`
	Side       string  `json:"side"`
	Quantity   float64 `json:"quantity"`
	Price      float64 `json:"price"`
	EntryPrice float64 `json:"entry_price"`
	OrderType  string  `json:"order_type"`
	Status     string  `json:"status"` // "open" | "error"
	Error      string  `json:"error,omitempty"`
	QueuedAt   string  `json:"queued_at"`
	FlushedAt  string  `json:"flushed_at"`
}

type bulkInsertResult struct {
	entry   QueueEntry
	tradeID string
}

// WSConn is the single WebSocket connection type used by the pool,
// broadcast fanout, Redis confirm routing, and direct writes.
//
// ID is optional.
// - Empty ID: normal pooled/broadcast WebSocket.
// - Non-empty ID: connection can also receive targeted Redis confirmations.
type WSConn struct {
	ID string

	conn   net.Conn
	closed chan struct{}

	closeOnce sync.Once
	writeMu   sync.Mutex
}

// ConnRegistry tracks live WebSocket connections by routing ID.
//
// This replaces:
// - registry map[string]*RedisConn
// - registryMu
// - lookupConn returning *RedisConn
type ConnRegistry struct {
	mu    sync.RWMutex
	conns map[string]*WSConn
}

type Message struct {
	Type    string
	Payload []byte
}

type Worker struct {
	name  string
	conns []*WSConn
	mu    sync.Mutex
	count int
	msgCh chan Message
}

type WorkerPool struct {
	workers []*Worker
	mu      sync.Mutex
	msgCh   chan Message

	redisClient *redis.Client
	registry    *ConnRegistry

	flushSignal chan struct{}
}
