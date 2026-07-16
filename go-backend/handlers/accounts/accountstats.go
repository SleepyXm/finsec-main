package handlers

import (
	"database/sql"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// ── GetAccountStats ───────────────────────────────────────────────────────────
// GET /account/stats
// Single row read — always reflects all-time totals regardless of pagination.
func GetAccountStats(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		var (
			balance    float64
			netPnl     float64
			tradeCount int
			wins       int
			losses     int
			bestTrade  float64
			worstTrade float64
		)
		err := db.QueryRowContext(c, `
			SELECT a.balance, a.net_pnl, a.trade_count, a.wins, a.losses, a.best_trade, a.worst_trade
			FROM user_accounts a
			WHERE a.user_id = $1
		`, userID).Scan(&balance, &netPnl, &tradeCount, &wins, &losses, &bestTrade, &worstTrade)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{
				"balance": 0, "net_pnl": 0, "trade_count": 0, "wins": 0,
				"losses": 0, "win_rate": 0, "avg_pnl_per_trade": 0,
				"best_trade": 0, "worst_trade": 0,
			})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch stats"})
			return
		}

		winRate := 0.0
		avgPnl := 0.0
		if tradeCount > 0 {
			winRate = math.Round(float64(wins)/float64(tradeCount)*100*10) / 10
			avgPnl = math.Round(netPnl/float64(tradeCount)*100) / 100
		}

		c.JSON(http.StatusOK, gin.H{
			"balance":           math.Round(balance*100) / 100,
			"net_pnl":           math.Round(netPnl*100) / 100,
			"trade_count":       tradeCount,
			"wins":              wins,
			"losses":            losses,
			"win_rate":          winRate,
			"avg_pnl_per_trade": avgPnl,
			"best_trade":        math.Round(bestTrade*100) / 100,
			"worst_trade":       math.Round(worstTrade*100) / 100,
		})
	}
}

// ── GetJournal ────────────────────────────────────────────────────────────────
// GET /journal?month=2025-05
// Returns daily P&L buckets for the calendar — one query, no pagination needed.
func GetJournal(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		// Default to current month
		monthStr := c.DefaultQuery("month", time.Now().Format("2006-01"))
		monthStart, err := time.Parse("2006-01", monthStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid month, use YYYY-MM"})
			return
		}
		monthEnd := monthStart.AddDate(0, 1, 0)

		var accountID string
		err = db.QueryRowContext(c,
			`SELECT id FROM user_accounts WHERE user_id = $1`, userID,
		).Scan(&accountID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{"month": monthStr, "days": gin.H{}})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch account"})
			return
		}

		rows, err := db.QueryContext(c, `
			SELECT
				DATE(closed_at)              AS day,
				SUM(realised_pnl)            AS daily_pnl,
				COUNT(*)                     AS trade_count,
				json_agg(json_build_object(
					'id',       id,
					'trade_id', id,
					'symbol',   symbol,
					'side',     CASE side WHEN 'buy' THEN 'long' ELSE 'short' END,
					'pnl',      ROUND(realised_pnl::numeric, 2)
				) ORDER BY closed_at)        AS trades
			FROM trades
			WHERE account_id = $1
			  AND status     = 'closed'
			  AND realised_pnl IS NOT NULL
			  AND closed_at >= $2
			  AND closed_at <  $3
			GROUP BY DATE(closed_at)
			ORDER BY day
		`, accountID, monthStart, monthEnd)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch journal"})
			return
		}
		defer rows.Close()

		days := gin.H{}
		for rows.Next() {
			var day time.Time
			var dailyPnl float64
			var tradeCount int
			var tradesJSON []byte

			if err := rows.Scan(&day, &dailyPnl, &tradeCount, &tradesJSON); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not scan journal row"})
				return
			}

			days[day.Format("2006-01-02")] = gin.H{
				"pnl":         math.Round(dailyPnl*100) / 100,
				"trade_count": tradeCount,
				"trades":      json.RawMessage(tradesJSON),
			}
		}

		c.JSON(http.StatusOK, gin.H{"month": monthStr, "days": days})
	}
}

// ── GetPnLCurve ───────────────────────────────────────────────────────────────
// GET /pnl-curve?period=month|week|all
// Returns cumulative P&L data points bucketed by day.
func GetPnLCurve(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		var accountID string
		err := db.QueryRowContext(c,
			`SELECT id FROM user_accounts WHERE user_id = $1`, userID,
		).Scan(&accountID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{"points": []any{}})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch account"})
			return
		}

		var since time.Time
		switch c.DefaultQuery("period", "month") {
		case "week":
			since = time.Now().AddDate(0, 0, -7)
		case "all":
			since = time.Time{} // zero value = no filter
		default: // month
			since = time.Now().AddDate(0, -1, 0)
		}

		var rows *sql.Rows
		if since.IsZero() {
			rows, err = db.QueryContext(c, `
				SELECT
					DATE(closed_at)   AS day,
					SUM(realised_pnl) AS daily_pnl
				FROM trades
				WHERE account_id = $1
				  AND status = 'closed'
				  AND realised_pnl IS NOT NULL
				GROUP BY day
				ORDER BY day
			`, accountID)
		} else {
			rows, err = db.QueryContext(c, `
				SELECT
					DATE(closed_at)   AS day,
					SUM(realised_pnl) AS daily_pnl
				FROM trades
				WHERE account_id = $1
				  AND status = 'closed'
				  AND realised_pnl IS NOT NULL
				  AND closed_at >= $2
				GROUP BY day
				ORDER BY day
			`, accountID, since)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch pnl curve"})
			return
		}
		defer rows.Close()

		var points []point
		var cumulative float64
		for rows.Next() {
			var day time.Time
			var dailyPnl float64
			if err := rows.Scan(&day, &dailyPnl); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not scan curve row"})
				return
			}
			cumulative += dailyPnl
			points = append(points, point{
				Date:       day.Format("2006-01-02"),
				DailyPnl:   math.Round(dailyPnl*100) / 100,
				Cumulative: math.Round(cumulative*100) / 100,
			})
		}

		if points == nil {
			points = []point{}
		}

		c.JSON(http.StatusOK, gin.H{"points": points})
	}
}

// ── GetPositionHistory (cleaned up) ──────────────────────────────────────────
// GET /portfolio?cursor_time=...&cursor_id=...&limit=20
// Returns paginated closed trades — no stats computation on the page.
func GetPositionHistory(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		var accountID string
		err := db.QueryRowContext(c,
			`SELECT id FROM user_accounts WHERE user_id = $1`, userID,
		).Scan(&accountID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{"history": []any{}, "next_cursor": nil})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch account"})
			return
		}

		limit := 20
		if l, err := strconv.Atoi(c.DefaultQuery("limit", "20")); err == nil && l > 0 && l <= 100 {
			limit = l
		}

		cursorTime := time.Now()
		cursorID := ""
		if ct := c.Query("cursor_time"); ct != "" {
			if t, err := time.Parse(time.RFC3339, ct); err == nil {
				cursorTime = t
			}
		}
		if ci := c.Query("cursor_id"); ci != "" {
			cursorID = ci
		}

		var rows *sql.Rows
		if cursorID == "" {
			rows, err = db.QueryContext(c, `
				SELECT id,
				       symbol,
				       CASE side WHEN 'buy' THEN 'long' ELSE 'short' END AS side,
				       quantity,
				       entry_price,
				       exit_price,
				       realised_pnl,
				       opened_at,
				       closed_at
				FROM trades
				WHERE account_id = $1 AND status = 'closed'
				ORDER BY closed_at DESC, id DESC
				LIMIT $2
			`, accountID, limit)
		} else {
			rows, err = db.QueryContext(c, `
				SELECT id,
				       symbol,
				       CASE side WHEN 'buy' THEN 'long' ELSE 'short' END AS side,
				       quantity,
				       entry_price,
				       exit_price,
				       realised_pnl,
				       opened_at,
				       closed_at
				FROM trades
				WHERE account_id = $1 AND status = 'closed'
				  AND (closed_at, id) < ($2, $3)
				ORDER BY closed_at DESC, id DESC
				LIMIT $4
			`, accountID, cursorTime, cursorID, limit)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch trade history"})
			return
		}
		defer rows.Close()

		var trades []tradeRow
		for rows.Next() {
			var trade tradeRow
			if err := rows.Scan(
				&trade.id, &trade.symbol, &trade.side, &trade.quantity,
				&trade.entryPrice, &trade.exitPrice, &trade.realisedPnl,
				&trade.openedAt, &trade.closedAt,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not scan trade"})
				return
			}
			trades = append(trades, trade)
		}

		if len(trades) == 0 {
			c.JSON(http.StatusOK, gin.H{"history": []any{}, "next_cursor": nil})
			return
		}

		history := make([]gin.H, 0, len(trades))
		for _, p := range trades {
			entry := gin.H{
				"id":           p.id,
				"trade_id":     p.id,
				"symbol":       p.symbol,
				"side":         p.side,
				"quantity":     p.quantity,
				"entry_price":  p.entryPrice,
				"exit_price":   nil,
				"realised_pnl": nil,
				"opened_at":    p.openedAt.Format(time.RFC3339),
				"closed_at":    nil,
			}
			if p.exitPrice.Valid {
				entry["exit_price"] = p.exitPrice.Float64
			}
			if p.realisedPnl.Valid {
				entry["realised_pnl"] = p.realisedPnl.Float64
			}
			if p.closedAt.Valid {
				entry["closed_at"] = p.closedAt.Time.Format(time.RFC3339)
			}
			history = append(history, entry)
		}

		var nextCursor gin.H
		if len(trades) == limit {
			last := trades[len(trades)-1]
			if last.closedAt.Valid {
				nextCursor = gin.H{
					"cursor_time": last.closedAt.Time.Format(time.RFC3339),
					"cursor_id":   last.id,
				}
			}
		}

		c.JSON(http.StatusOK, gin.H{"history": history, "next_cursor": nextCursor})
	}
}
