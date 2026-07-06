package services

// QueueEntry is pushed to Redis on trade intake.
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
