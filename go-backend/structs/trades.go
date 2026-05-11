package structs

type TradeAction struct {
	Ticker    string  `json:"ticker"`
	Action    string  `json:"action"`
	Price     float64 `json:"price"`    // was json:"float" — wrong tag
	Quantity  float64 `json:"quantity"` // same
	SessionID *string `json:"session_id,omitempty"`
	ConnID    string
	BotID     *string
}

type CloseTradeRequest struct {
	ExitPrice   float64 `json:"exit_price"`
	RealisedPnl float64 `json:"realised_pnl"`
	SessionID   *string `json:"session_id,omitempty"`
}

type BacktestRequest struct {
	// Ticker is the asset symbol to backtest (e.g. "BTC", "AAPL").
	Ticker string `json:"ticker" binding:"required"`

	// Interval is the candle interval string (e.g. "1m", "1h", "1d").
	Interval string `json:"interval" binding:"required"`

	// DateFrom is the start of the backtest range (inclusive).
	DateFrom string `json:"date_from" binding:"required"`

	// DateTo is the end of the backtest range (inclusive).
	DateTo string `json:"date_to" binding:"required"`

	// StartingBalance is the simulated account balance to begin with.
	// Defaults to 100,000 if not supplied.
	StartingBalance float64 `json:"starting_balance"`
}

// BacktestCandle represents a single OHLC candle returned to the client.
// It mirrors the Python BacktestCandle Pydantic model.
type BacktestCandle struct {
	// Time is the Unix timestamp (seconds) of the candle open.
	Time int64 `json:"time"`

	// Open is the opening price of the candle.
	Open float64 `json:"open"`

	// High is the highest price reached during the candle.
	High float64 `json:"high"`

	// Low is the lowest price reached during the candle.
	Low float64 `json:"low"`

	// Close is the closing price of the candle.
	Close float64 `json:"close"`

	// BuyPrice is the estimated execution price for a market buy,
	// calculated as Close * a small multiplier to account for slippage/spread.
	BuyPrice float64 `json:"buy_price"`
}

// BacktestSession holds the metadata for an active backtest session stored in Redis.
// It is serialised to/from JSON when reading and writing the cache.
type BacktestSession struct {
	// SessionID is the unique identifier for this backtest session.
	SessionID string `json:"session_id"`

	// UserID is the ID of the user who created the session.
	UserID string `json:"user_id"`

	// Ticker is the asset symbol used in this session.
	Ticker string `json:"ticker"`

	// Interval is the candle interval used in this session.
	Interval string `json:"interval"`

	// DateFrom is the ISO-8601 string of the requested range start.
	DateFrom string `json:"date_from"`

	// DateTo is the ISO-8601 string of the requested range end.
	DateTo string `json:"date_to"`

	// StartingBalance is the balance the simulation started with.
	StartingBalance float64 `json:"starting_balance"`

	// CandleCount is the total number of candles loaded for this session.
	CandleCount int `json:"candle_count"`

	// CreatedAt is the ISO-8601 UTC timestamp of when this session was created.
	CreatedAt string `json:"created_at"`
}

// BacktestRunResponse is the JSON response body returned from POST /backtest/run.
type BacktestRunResponse struct {
	SessionID       string           `json:"session_id"`
	Ticker          string           `json:"ticker"`
	Interval        string           `json:"interval"`
	CandleCount     int              `json:"candle_count"`
	StartingBalance float64          `json:"starting_balance"`
	Candles         []BacktestCandle `json:"candles"`
}
