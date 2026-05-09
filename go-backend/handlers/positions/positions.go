package positions

import (
	"database/sql"
	"math"
	"net/http"
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
			`SELECT id, symbol, side, quantity, entry_price, status, opened_at
			 FROM positions
			 WHERE account_id = $1 AND status = 'open'`, accountID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch positions"})
			return
		}
		defer rows.Close()

		positions := []gin.H{}
		for rows.Next() {
			var id, symbol, side, status string
			var quantity, entryPrice float64
			var openedAt time.Time

			if err := rows.Scan(&id, &symbol, &side, &quantity, &entryPrice, &status, &openedAt); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not scan position"})
				return
			}
			positions = append(positions, gin.H{
				"position_id": id,
				"symbol":      symbol,
				"side":        side,
				"quantity":    quantity,
				"entry_price": entryPrice,
				"status":      status,
				"opened_at":   openedAt,
			})
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
			c.JSON(http.StatusOK, gin.H{"history": []any{}, "stats": gin.H{}})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch account"})
			return
		}

		rows, err := db.QueryContext(c,
			`SELECT id, symbol, side, quantity, entry_price, exit_price, realised_pnl, opened_at, closed_at
			 FROM positions
			 WHERE account_id = $1 AND status = 'closed'
			 ORDER BY closed_at DESC`, accountID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch position history"})
			return
		}
		defer rows.Close()

		type positionRow struct {
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

		var rawPositions []positionRow

		for rows.Next() {
			var p positionRow
			if err := rows.Scan(
				&p.id, &p.symbol, &p.side, &p.quantity,
				&p.entryPrice, &p.exitPrice, &p.realisedPnl,
				&p.openedAt, &p.closedAt,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not scan position"})
				return
			}
			rawPositions = append(rawPositions, p)
		}

		if len(rawPositions) == 0 {
			c.JSON(http.StatusOK, gin.H{
				"history": []any{},
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

		history := make([]gin.H, 0, len(rawPositions))
		for _, p := range rawPositions {
			entry := gin.H{
				"id":           p.id,
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

		// Aggregate stats over positions with a recorded realised_pnl
		var pnlValues []float64
		for _, p := range rawPositions {
			if p.realisedPnl.Valid {
				pnlValues = append(pnlValues, p.realisedPnl.Float64)
			}
		}

		stats := gin.H{
			"total_realised_pnl": 0.0,
			"trade_count":        len(rawPositions),
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
			"history": history,
			"stats":   stats,
		})
	}
}
