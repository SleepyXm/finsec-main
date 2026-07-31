package positions

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"finsec-backend/structs"

	"github.com/gin-gonic/gin"
)

const maxCloseBatch = 1000

type closeTradeBatchItem struct {
	TradeID   string  `json:"trade_id"`
	ExitPrice float64 `json:"exit_price"`
}

const closeTradeBatchSQL = `
	WITH requested AS (
		SELECT trade_id, exit_price
		FROM jsonb_to_recordset($1::jsonb) AS item(trade_id uuid, exit_price numeric)
	),
	closed AS (
		UPDATE trades AS trade
		SET status = 'closed',
		    exit_price = requested.exit_price,
		    realised_pnl = ROUND(
				(requested.exit_price - trade.entry_price) *
				CASE trade.side WHEN 'buy' THEN 1 ELSE -1 END * trade.quantity,
				2
			),
		    closed_at = NOW(), updated_at = NOW()
		FROM requested
		WHERE trade.id = requested.trade_id AND trade.account_id = $2
		  AND trade.status = 'open' AND trade.entry_price IS NOT NULL
		RETURNING trade.realised_pnl
	),
	totals AS (
		SELECT COUNT(*)::integer AS trade_count,
		       COALESCE(SUM(realised_pnl), 0) AS pnl,
		       COUNT(*) FILTER (WHERE realised_pnl > 0)::integer AS wins,
		       COUNT(*) FILTER (WHERE realised_pnl < 0)::integer AS losses,
		       MAX(realised_pnl) AS best_trade,
		       MIN(realised_pnl) AS worst_trade
		FROM closed
	),
	updated_account AS (
		UPDATE user_accounts AS account
		SET balance = account.balance + totals.pnl,
		    net_pnl = account.net_pnl + totals.pnl,
		    trade_count = account.trade_count + totals.trade_count,
		    wins = account.wins + totals.wins,
		    losses = account.losses + totals.losses,
		    best_trade = GREATEST(account.best_trade, totals.best_trade),
		    worst_trade = LEAST(account.worst_trade, totals.worst_trade)
		FROM totals
		WHERE account.id = $2 AND totals.trade_count > 0
	)
	SELECT trade_count FROM totals
`

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

func CloseTrades(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var trades []closeTradeBatchItem
		if err := c.ShouldBindJSON(&trades); err != nil || !validCloseTradeBatch(trades) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "trades must contain 1 to 1000 unique trades with valid ids and exit prices"})
			return
		}

		userID := c.MustGet("userID").(string)
		var accountID string
		if err := db.QueryRowContext(c, `SELECT id FROM user_accounts WHERE user_id = $1`, userID).Scan(&accountID); err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "Account not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch account"})
			}
			return
		}

		payload, err := json.Marshal(trades)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Could not encode trades"})
			return
		}
		tx, err := db.BeginTx(c, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not start transaction"})
			return
		}
		defer tx.Rollback()

		var closedCount int
		if err = tx.QueryRowContext(c, closeTradeBatchSQL, string(payload), accountID).Scan(&closedCount); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not close trades"})
			return
		}
		if closedCount != len(trades) {
			c.JSON(http.StatusConflict, gin.H{"error": "One or more trades could not be closed"})
			return
		}
		if err = tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not commit transaction"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Trades closed", "closed_count": closedCount})
	}
}

func validCloseTradeBatch(trades []closeTradeBatchItem) bool {
	if len(trades) == 0 || len(trades) > maxCloseBatch {
		return false
	}
	seen := make(map[string]struct{}, len(trades))
	for _, trade := range trades {
		if validateTradeID(trade.TradeID) != nil || !validPositiveNumber(trade.ExitPrice, maxTradePrice) {
			return false
		}
		if _, exists := seen[trade.TradeID]; exists {
			return false
		}
		seen[trade.TradeID] = struct{}{}
	}
	return true
}

func writeClosedTrade(c *gin.Context, tradeID, symbol, side string, exitPrice, pnl float64, closedAt time.Time) {
	c.JSON(http.StatusOK, gin.H{"message": "Trade closed", "data": gin.H{
		"trade_id": tradeID, "symbol": symbol, "side": side,
		"exit_price": exitPrice, "realised_pnl": pnl,
		"closed_at": closedAt, "status": "closed",
	}})
}
