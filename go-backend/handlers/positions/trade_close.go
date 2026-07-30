package positions

import (
	"database/sql"
	"net/http"
	"time"

	"finsec-backend/structs"

	"github.com/gin-gonic/gin"
)

func CloseTrade(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)
		tradeID := c.Param("trade_id")
		if err := validateTradeID(tradeID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var accountID string
		if err := db.QueryRowContext(c, `SELECT id FROM user_accounts WHERE user_id = $1`, userID).Scan(&accountID); err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "Account not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch account"})
			}
			return
		}

		tx, err := db.BeginTx(c, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not start transaction"})
			return
		}
		defer tx.Rollback()

		var symbol, action, status string
		var quantity float64
		var entryPrice sql.NullFloat64
		var savedExit, savedPnL sql.NullFloat64
		var savedClosedAt sql.NullTime
		err = tx.QueryRowContext(c, `
			SELECT symbol, side, quantity, entry_price, status,
			       exit_price, realised_pnl, closed_at
			FROM trades WHERE id = $1 AND account_id = $2 FOR UPDATE
		`, tradeID, accountID).Scan(
			&symbol, &action, &quantity, &entryPrice, &status,
			&savedExit, &savedPnL, &savedClosedAt,
		)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "Trade not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch trade"})
			}
			return
		}
		if status == "closed" && savedExit.Valid && savedPnL.Valid && savedClosedAt.Valid {
			writeClosedTrade(c, tradeID, symbol, positionSide(action), savedExit.Float64, savedPnL.Float64, savedClosedAt.Time)
			return
		}
		if status == "pending" {
			result, err := tx.ExecContext(c, `
				UPDATE trades SET status = 'cancelled', closed_at = NOW(), updated_at = NOW()
				WHERE id = $1 AND account_id = $2 AND status = 'pending'
			`, tradeID, accountID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not cancel order"})
				return
			}
			cancelled, _ := result.RowsAffected()
			if cancelled != 1 {
				c.JSON(http.StatusConflict, gin.H{"error": "Order was already changed"})
				return
			}
			if err = tx.Commit(); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not commit cancellation"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"message": "Limit order cancelled", "data": gin.H{
				"trade_id": tradeID, "symbol": symbol, "status": "cancelled",
			}})
			return
		}
		var request structs.CloseTradeRequest
		if err := c.ShouldBindJSON(&request); err != nil || !validPositiveNumber(request.ExitPrice, maxTradePrice) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "exit_price must be a positive finite number"})
			return
		}
		if status != "open" {
			c.JSON(http.StatusConflict, gin.H{"error": "Trade is not open"})
			return
		}
		if !entryPrice.Valid {
			c.JSON(http.StatusConflict, gin.H{"error": "Trade has no execution price"})
			return
		}

		direction := 1.0
		if action == "sell" {
			direction = -1
		}
		realisedPnL := roundMoney((request.ExitPrice - entryPrice.Float64) * direction * quantity)
		closedAt := time.Now().UTC()
		result, err := tx.ExecContext(c, `
			UPDATE trades SET status = 'closed', exit_price = $1,
			       realised_pnl = $2, closed_at = $3, updated_at = $3
			WHERE id = $4 AND account_id = $5 AND status = 'open'
		`, request.ExitPrice, realisedPnL, closedAt, tradeID, accountID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not close trade"})
			return
		}
		updated, _ := result.RowsAffected()
		if updated != 1 {
			c.JSON(http.StatusConflict, gin.H{"error": "Trade was already changed"})
			return
		}
		if _, err = tx.ExecContext(c, `UPDATE user_accounts SET balance = balance + $1 WHERE id = $2`, realisedPnL, accountID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update balance"})
			return
		}
		if err = updateAccountStats(c, tx, accountID, realisedPnL); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update account stats"})
			return
		}
		if err = tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not commit transaction"})
			return
		}
		writeClosedTrade(c, tradeID, symbol, positionSide(action), request.ExitPrice, realisedPnL, closedAt)
	}
}

func writeClosedTrade(c *gin.Context, tradeID, symbol, side string, exitPrice, pnl float64, closedAt time.Time) {
	c.JSON(http.StatusOK, gin.H{"message": "Trade closed", "data": gin.H{
		"trade_id": tradeID, "symbol": symbol, "side": side,
		"exit_price": exitPrice, "realised_pnl": pnl,
		"closed_at": closedAt, "status": "closed",
	}})
}
