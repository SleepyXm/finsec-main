package positions

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var editableTradeFields = map[string]struct{}{
	"stop_loss": {}, "take_profit": {}, "price": {}, "order_type": {},
}

func UpdateTrade(db *sql.DB) gin.HandlerFunc {
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

		var request map[string]json.RawMessage
		if err := c.ShouldBindJSON(&request); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid trade update"})
			return
		}
		for field := range request {
			if _, ok := editableTradeFields[field]; !ok {
				c.JSON(http.StatusBadRequest, gin.H{"error": field + " is not editable"})
				return
			}
		}

		updates := make([]string, 0, len(request))
		args := make([]any, 0, len(request)+2)
		addUpdate := func(column string, value any) {
			args = append(args, value)
			updates = append(updates, fmt.Sprintf("%s = $%d", column, len(args)))
		}

		for _, field := range []string{"stop_loss", "take_profit", "price"} {
			raw, ok := request[field]
			if !ok {
				continue
			}
			value, err := nullableFloat(raw)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": field + " " + err.Error()})
				return
			}
			addUpdate(field, value)
		}

		if raw, ok := request["order_type"]; ok {
			var orderType string
			if err := json.Unmarshal(raw, &orderType); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "order_type must be market or limit"})
				return
			}
			orderType = strings.ToLower(strings.TrimSpace(orderType))
			if orderType != "market" && orderType != "limit" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "order_type must be market or limit"})
				return
			}
			addUpdate("order_type", orderType)
		}
		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No editable trade fields supplied"})
			return
		}

		args = append(args, tradeID, accountID)
		query := fmt.Sprintf(`
			UPDATE trades SET %s, updated_at = NOW()
			WHERE id = $%d AND account_id = $%d AND status = 'open'
			RETURNING id, symbol,
				CASE side WHEN 'buy' THEN 'long' ELSE 'short' END,
				quantity, price, entry_price, order_type, stop_loss,
				take_profit, status, opened_at
		`, strings.Join(updates, ", "), len(args)-1, len(args))

		var id, symbol, side, orderType, status string
		var quantity, entryPrice float64
		var price, stopLoss, takeProfit sql.NullFloat64
		var openedAt time.Time
		err := db.QueryRowContext(c, query, args...).Scan(
			&id, &symbol, &side, &quantity, &price, &entryPrice,
			&orderType, &stopLoss, &takeProfit, &status, &openedAt,
		)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "Open trade not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update trade"})
			}
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Trade updated", "data": gin.H{
			"id": id, "trade_id": id, "symbol": symbol, "side": side,
			"quantity": quantity, "price": nullableFloatValue(price), "entry_price": entryPrice,
			"order_type": orderType, "stop_loss": nullableFloatValue(stopLoss),
			"take_profit": nullableFloatValue(takeProfit), "status": status, "opened_at": openedAt,
		}})
	}
}
