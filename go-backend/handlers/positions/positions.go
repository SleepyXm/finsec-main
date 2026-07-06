package positions

import (
	"database/sql"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func GetOpenPositions(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		var accountID string
		err := db.QueryRowContext(c,
			`SELECT id FROM user_accounts WHERE user_id = $1`, userID,
		).Scan(&accountID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, []any{})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch account"})
			return
		}

		rows, err := db.QueryContext(c,
			`SELECT id,
			        symbol,
			        CASE side WHEN 'buy' THEN 'long' ELSE 'short' END AS side,
			        quantity,
			        price,
			        entry_price,
			        order_type,
			        stop_loss,
			        take_profit,
			        status,
			        opened_at
			 FROM trades
			 WHERE account_id = $1 AND status = 'open'`, accountID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch open trades"})
			return
		}
		defer rows.Close()

		positions := []gin.H{}
		for rows.Next() {
			var id, symbol, side, orderType, status string
			var quantity, entryPrice float64
			var price, stopLoss, takeProfit sql.NullFloat64
			var openedAt time.Time

			if err := rows.Scan(
				&id, &symbol, &side, &quantity, &price, &entryPrice,
				&orderType, &stopLoss, &takeProfit, &status, &openedAt,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not scan open trade"})
				return
			}
			position := gin.H{
				"id":          id,
				"trade_id":    id,
				"symbol":      symbol,
				"side":        side,
				"quantity":    quantity,
				"price":       nil,
				"entry_price": entryPrice,
				"order_type":  orderType,
				"stop_loss":   nil,
				"take_profit": nil,
				"status":      status,
				"opened_at":   openedAt,
			}
			if price.Valid {
				position["price"] = price.Float64
			}
			if stopLoss.Valid {
				position["stop_loss"] = stopLoss.Float64
			}
			if takeProfit.Valid {
				position["take_profit"] = takeProfit.Float64
			}
			positions = append(positions, position)
		}

		c.JSON(http.StatusOK, positions)
	}
}

func GetPositionHistory(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		var accountID string
		err := db.QueryRowContext(c,
			`SELECT id FROM user_accounts WHERE user_id = $1`, userID,
		).Scan(&accountID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{
				"history":     []any{},
				"next_cursor": nil,
				"stats": gin.H{
					"total_realised_pnl": 0.0,
					"trade_count":        0,
					"wins":               0,
					"losses":             0,
					"win_rate":           0.0,
					"avg_pnl_per_trade":  0.0,
					"best_trade":         0.0,
					"worst_trade":        0.0,
				},
			})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch account"})
			return
		}

		// --- Pagination params ---
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

		// --- Query ---
		// On first page cursorID is empty, so we skip the cursor filter entirely.
		var rows *sql.Rows
		if cursorID == "" {
			rows, err = db.QueryContext(c,
				`SELECT id,
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
				 LIMIT $2`,
				accountID, limit,
			)
		} else {
			rows, err = db.QueryContext(c,
				`SELECT id,
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
				 LIMIT $4`,
				accountID, cursorTime, cursorID, limit,
			)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch trade history"})
			return
		}
		defer rows.Close()

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

		var rawTrades []tradeRow

		for rows.Next() {
			var trade tradeRow
			if err := rows.Scan(
				&trade.id, &trade.symbol, &trade.side, &trade.quantity,
				&trade.entryPrice, &trade.exitPrice, &trade.realisedPnl,
				&trade.openedAt, &trade.closedAt,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not scan trade"})
				return
			}
			rawTrades = append(rawTrades, trade)
		}

		if len(rawTrades) == 0 {
			c.JSON(http.StatusOK, gin.H{
				"history":     []any{},
				"next_cursor": nil,
				"stats": gin.H{
					"total_realised_pnl": 0.0,
					"trade_count":        0,
					"wins":               0,
					"losses":             0,
					"win_rate":           0.0,
					"avg_pnl_per_trade":  0.0,
					"best_trade":         0.0,
					"worst_trade":        0.0,
				},
			})
			return
		}

		// --- Build history ---
		history := make([]gin.H, 0, len(rawTrades))
		for _, p := range rawTrades {
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

		// --- Next cursor (only set when a full page was returned) ---
		var nextCursor gin.H
		if len(rawTrades) == limit {
			last := rawTrades[len(rawTrades)-1]
			if last.closedAt.Valid {
				nextCursor = gin.H{
					"cursor_time": last.closedAt.Time.Format(time.RFC3339),
					"cursor_id":   last.id,
				}
			}
		}

		// --- Stats (unchanged) ---
		var pnlValues []float64
		for _, p := range rawTrades {
			if p.realisedPnl.Valid {
				pnlValues = append(pnlValues, p.realisedPnl.Float64)
			}
		}

		stats := gin.H{
			"total_realised_pnl": 0.0,
			"trade_count":        len(rawTrades),
			"wins":               0,
			"losses":             0,
			"win_rate":           0.0,
			"avg_pnl_per_trade":  0.0,
			"best_trade":         0.0,
			"worst_trade":        0.0,
		}

		if len(pnlValues) > 0 {
			var total, best, worst float64
			var wins, losses int

			best = pnlValues[0]
			worst = pnlValues[0]

			for _, v := range pnlValues {
				total += v
				if v > best {
					best = v
				}
				if v < worst {
					worst = v
				}
				if v > 0 {
					wins++
				} else {
					losses++
				}
			}

			n := float64(len(pnlValues))
			stats["total_realised_pnl"] = math.Round(total*100) / 100
			stats["wins"] = wins
			stats["losses"] = losses
			stats["win_rate"] = math.Round(float64(wins)/n*100*10) / 10
			stats["avg_pnl_per_trade"] = math.Round(total/n*100) / 100
			stats["best_trade"] = math.Round(best*100) / 100
			stats["worst_trade"] = math.Round(worst*100) / 100
		}

		c.JSON(http.StatusOK, gin.H{
			"history":     history,
			"next_cursor": nextCursor,
			"stats":       stats,
		})
	}
}
