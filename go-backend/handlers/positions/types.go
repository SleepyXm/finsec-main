package positions

import (
	"database/sql"
	"time"
)

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
