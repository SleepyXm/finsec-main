package backtest

import (
	"encoding/json"
	"time"

	"finsec-backend/structs"
)

type snapshot struct {
	SessionID       string                   `json:"session_id"`
	Ticker          string                   `json:"ticker"`
	Interval        string                   `json:"interval"`
	DateFrom        time.Time                `json:"date_from"`
	DateTo          time.Time                `json:"date_to"`
	StartingBalance float64                  `json:"starting_balance"`
	CurrentCandle   int                      `json:"current_candle"`
	Positions       json.RawMessage          `json:"positions"`
	CreatedAt       time.Time                `json:"created_at"`
	UpdatedAt       time.Time                `json:"updated_at"`
	ExpiresAt       time.Time                `json:"expires_at"`
	CandleCount     int                      `json:"candle_count,omitempty"`
	Candles         []structs.BacktestCandle `json:"candles,omitempty"`
}

type snapshotUpdate struct {
	CurrentCandle *int            `json:"current_candle"`
	Positions     json.RawMessage `json:"positions"`
}
