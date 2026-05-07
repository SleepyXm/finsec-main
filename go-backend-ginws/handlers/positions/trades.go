package positions

import (
	"database/sql"
	"encoding/json"
	"finsec-backend/structs"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	"github.com/google/uuid"
)

var BacktestSessionTTL = 1 * time.Hour

func PlaceTrade(db *sql.DB, redisClient *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		var req structs.TradeAction
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var accountID string
		err := db.QueryRowContext(c,
			`SELECT id FROM user_accounts WHERE user_id = $1`, userID,
		).Scan(&accountID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Account not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch account"})
			return
		}

		// Backtest path
		if req.SessionID != nil {
			side := "short"
			if req.Action == "buy" {
				side = "long"
			}
			position := map[string]any{
				"id":          uuid.NewString(),
				"symbol":      req.Ticker,
				"side":        side,
				"quantity":    req.Quantity,
				"entry_price": req.Price,
				"status":      "open",
				"opened_at":   time.Now().UTC().Format(time.RFC3339),
			}

			positionsKey := "backtest:positions:" + *req.SessionID
			cached, _ := redisClient.Get(c, positionsKey).Bytes()
			var positions []map[string]any
			if cached != nil {
				json.Unmarshal(cached, &positions)
			}
			positions = append(positions, position)
			data, _ := json.Marshal(positions)
			redisClient.SetEx(c, positionsKey, data, BacktestSessionTTL)

			c.JSON(http.StatusOK, gin.H{"message": "Trade recorded", "data": position})
			return
		}

		// Live path
		side := "short"
		if req.Action == "buy" {
			side = "long"
		}

		tx, err := db.BeginTx(c, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not start transaction"})
			return
		}
		defer tx.Rollback()

		var orderID string
		err = tx.QueryRowContext(c,
			`INSERT INTO orders (account_id, bot_id, symbol, side, order_type, quantity, price, status)
			 VALUES ($1, NULL, $2, $3, 'market', $4, $5, 'filled')
			 RETURNING id`,
			accountID, req.Ticker, req.Action, req.Quantity, req.Price,
		).Scan(&orderID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create order"})
			return
		}

		var positionID string
		err = tx.QueryRowContext(c,
			`INSERT INTO positions (account_id, bot_id, symbol, side, quantity, entry_order_id, entry_price, status)
			 VALUES ($1, NULL, $2, $3, $4, $5, $6, 'open')
			 RETURNING id`,
			accountID, req.Ticker, side, req.Quantity, orderID, req.Price,
		).Scan(&positionID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create position"})
			return
		}

		if err = tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not commit transaction"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Trade recorded",
			"data": gin.H{
				"position_id": positionID,
				"symbol":      req.Ticker,
				"side":        side,
				"quantity":    req.Quantity,
				"entry_price": req.Price,
				"status":      "open",
			},
		})
	}
}

func CloseTrade(db *sql.DB, redisClient *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)
		tradeID := c.Param("trade_id")

		var req structs.CloseTradeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var accountID string
		err := db.QueryRowContext(c,
			`SELECT id FROM user_accounts WHERE user_id = $1`, userID,
		).Scan(&accountID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Account not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch account"})
			return
		}

		// Backtest path
		if req.SessionID != nil {
			positionsKey := "backtest:positions:" + *req.SessionID
			cached, _ := redisClient.Get(c, positionsKey).Bytes()
			var positions []map[string]any
			if cached != nil {
				json.Unmarshal(cached, &positions)
			}

			var position map[string]any
			remaining := []map[string]any{}
			for _, p := range positions {
				if p["id"] == tradeID {
					position = p
				} else {
					remaining = append(remaining, p)
				}
			}
			if position == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "Position not found"})
				return
			}

			position["status"] = "closed"
			position["exit_price"] = req.ExitPrice
			position["realised_pnl"] = req.RealisedPnl
			position["closed_at"] = time.Now().UTC().Format(time.RFC3339)

			remainingData, _ := json.Marshal(remaining)
			redisClient.SetEx(c, positionsKey, remainingData, BacktestSessionTTL)

			tradesKey := "backtest:trades:" + *req.SessionID
			cachedTrades, _ := redisClient.Get(c, tradesKey).Bytes()
			var trades []map[string]any
			if cachedTrades != nil {
				json.Unmarshal(cachedTrades, &trades)
			}
			trades = append(trades, position)
			tradesData, _ := json.Marshal(trades)
			redisClient.SetEx(c, tradesKey, tradesData, BacktestSessionTTL)

			balanceKey := "backtest:balance:" + *req.SessionID
			cachedBalance, _ := redisClient.Get(c, balanceKey).Result()
			currentBalance, _ := strconv.ParseFloat(cachedBalance, 64)
			if cachedBalance == "" {
				db.QueryRowContext(c,
					`SELECT balance FROM user_accounts WHERE id = $1`, accountID,
				).Scan(&currentBalance)
			}
			newBalance := strconv.FormatFloat(currentBalance+req.RealisedPnl, 'f', -1, 64)
			redisClient.SetEx(c, balanceKey, newBalance, BacktestSessionTTL)

			c.JSON(http.StatusOK, gin.H{"message": "Position closed", "data": position})
			return
		}

		// Live path
		tx, err := db.BeginTx(c, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not start transaction"})
			return
		}
		defer tx.Rollback()

		var symbol, side string
		var quantity float64
		err = tx.QueryRowContext(c,
			`SELECT symbol, side, quantity FROM positions
			 WHERE id = $1 AND account_id = $2 AND status = 'open'`,
			tradeID, accountID,
		).Scan(&symbol, &side, &quantity)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Position not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch position"})
			return
		}

		exitSide := "buy"
		if side == "long" {
			exitSide = "sell"
		}

		var exitOrderID string
		err = tx.QueryRowContext(c,
			`INSERT INTO orders (account_id, bot_id, symbol, side, order_type, quantity, price, status)
			 VALUES ($1, NULL, $2, $3, 'market', $4, $5, 'filled')
			 RETURNING id`,
			accountID, symbol, exitSide, quantity, req.ExitPrice,
		).Scan(&exitOrderID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create exit order"})
			return
		}

		closedAt := time.Now().UTC()
		_, err = tx.ExecContext(c,
			`UPDATE positions
			 SET status = 'closed', exit_order_id = $1, exit_price = $2,
			     realised_pnl = $3, closed_at = $4
			 WHERE id = $5`,
			exitOrderID, req.ExitPrice, req.RealisedPnl, closedAt, tradeID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not close position"})
			return
		}

		_, err = tx.ExecContext(c,
			`UPDATE user_accounts SET balance = balance + $1 WHERE id = $2`,
			req.RealisedPnl, accountID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update balance"})
			return
		}

		if err = tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not commit transaction"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Position closed",
			"data": gin.H{
				"position_id":  tradeID,
				"symbol":       symbol,
				"side":         side,
				"exit_price":   req.ExitPrice,
				"realised_pnl": req.RealisedPnl,
				"closed_at":    closedAt,
				"status":       "closed",
			},
		})
	}
}
