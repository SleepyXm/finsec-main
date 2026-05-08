package positions

import (
	"database/sql"
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
