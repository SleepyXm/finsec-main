package handlers

import (
	"database/sql"
	"time"
)

type point struct {
	Date       string  `json:"date"`
	DailyPnl   float64 `json:"daily_pnl"`
	Cumulative float64 `json:"cumulative"`
}

type tradeRow struct {
	id          string
	symbol      string
	side        string
	quantity    float64
	entryPrice  float64
	exitPrice   sql.NullFloat64
	realisedPnl sql.NullFloat64
	openedAt    time.Time
	closedAt    sql.NullTime
}
