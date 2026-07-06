package positions

import (
	"context"
	"database/sql"
	"encoding/json"
	"finsec-backend/services"
	"finsec-backend/structs"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gobwas/ws"
	"github.com/gobwas/ws/wsutil"
	"github.com/redis/go-redis/v9"

	"github.com/google/uuid"
)

var BacktestSessionTTL = 1 * time.Hour

func nullableFloat(raw json.RawMessage) (any, error) {
	var value *float64
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	if value == nil {
		return nil, nil
	}
	return *value, nil
}

func nullableFloatValue(value sql.NullFloat64) any {
	if !value.Valid {
		return nil
	}
	return value.Float64
}

func updateAccountStats(ctx context.Context, tx *sql.Tx, accountID string, pnl float64) error {
	isWin := 0
	isLoss := 0
	if pnl > 0 {
		isWin = 1
	} else {
		isLoss = 1
	}

	_, err := tx.ExecContext(ctx, `
		UPDATE user_accounts SET
			net_pnl      = net_pnl + $1,
			trade_count  = trade_count + 1,
			wins         = wins + $2,
			losses       = losses + $3,
			best_trade   = GREATEST(best_trade, $1),
			worst_trade  = LEAST(worst_trade, $1)
		WHERE id = $4
	`, pnl, isWin, isLoss, accountID)
	return err
}

func PlaceTrade(db *sql.DB, redisClient *redis.Client, pool *services.WorkerPool) gin.HandlerFunc {
	return func(c *gin.Context) {

		// Pull userID set by auth middleware
		userID := c.MustGet("userID").(string)

		// Upgrade the HTTP connection to WebSocket — from this point on,
		// c.Writer and c.Request are owned by the WS connection
		netConn, _, _, err := ws.UpgradeHTTP(c.Request, c.Writer)
		if err != nil {
			log.Printf("[ws] upgrade error userID=%s: %v", userID, err)
			return
		}

		// Fetch the account once on connect — every trade on this connection
		// belongs to this account, no need to look it up per trade
		var accountID string
		err = db.QueryRowContext(c, `SELECT id FROM user_accounts WHERE user_id = $1`, userID).Scan(&accountID)
		if err == sql.ErrNoRows {
			netConn.Close()
			return
		}
		if err != nil {
			log.Printf("[ws] account lookup error userID=%s: %v", userID, err)
			netConn.Close()
			return
		}

		// Generate a connID for this connection — this is the routing key
		// used by the pub/sub subscriber to deliver confirms back here
		connID := uuid.NewString()

		// Wrap the net.Conn for safe concurrent writes with close detection
		rc := services.NewIdentifiedWSConn(connID, netConn)

		// Register in the pool registry so the pub/sub subscriber can find
		// this connection when a confirm arrives for this connID
		pool.RegisterConn(rc)

		// Also add to the worker pool for broadcast messages (price updates etc.)
		wsConn := services.NewWSConn(netConn)
		pool.AddConn(wsConn)

		// On exit — connection dropped or read error — clean up both registrations
		defer func() {
			pool.UnregisterConn(rc)
			pool.RemoveConn(wsConn)
			rc.Close()
			netConn.Close()
		}()

		// Read loop — blocks here for the lifetime of the connection.
		// Each message is a trade intent from the client.
		for {
			msg, op, err := wsutil.ReadClientData(netConn)
			if err != nil {
				// Client disconnected or network error — exit cleanly
				log.Printf("[ws] read error connID=%s: %v", connID, err)
				return
			}
			if op != ws.OpText {
				// Ignore binary frames, ping/pong handled by gobwas automatically
				continue
			}

			var req structs.TradeAction
			if err := json.Unmarshal(msg, &req); err != nil {
				log.Printf("[ws] unmarshal error connID=%s: %v", connID, err)
				continue
			}

			// Backtest trades — no queue, write directly to Redis session cache
			if req.SessionID != nil {
				side := "short"
				if req.Action == "buy" {
					side = "long"
				}
				tradeID := uuid.NewString()
				openedAt := time.Now().UTC()
				trade := map[string]any{
					"id":          tradeID,
					"trade_id":    tradeID,
					"symbol":      req.Ticker,
					"side":        side,
					"quantity":    req.Quantity,
					"price":       req.Price,
					"entry_price": req.Price,
					"order_type":  "market",
					"status":      "open",
					"opened_at":   openedAt.Format(time.RFC3339),
				}
				tradesKey := "backtest:trades:" + *req.SessionID
				cached, _ := redisClient.Get(c, tradesKey).Bytes()
				var trades []map[string]any
				if cached != nil {
					json.Unmarshal(cached, &trades)
				}
				trades = append(trades, trade)
				data, _ := json.Marshal(trades)
				redisClient.SetEx(c, tradesKey, data, BacktestSessionTTL)

				// Write confirm directly back on the WebSocket — no queue needed for backtest
				resp, _ := json.Marshal(services.QueueConfirm{
					TradeID:    tradeID,
					ConnID:     connID,
					Symbol:     req.Ticker,
					Side:       side,
					Quantity:   req.Quantity,
					Price:      req.Price,
					EntryPrice: req.Price,
					OrderType:  "market",
					Status:     "open",
					QueuedAt:   openedAt.Format(time.RFC3339Nano),
					FlushedAt:  openedAt.Format(time.RFC3339Nano),
				})
				rc.Write(resp)
				continue
			}

			// Live trade — determine position direction from action.
			side := "short"
			if req.Action == "buy" {
				side = "long"
			}

			// Build the queue entry — connID is set here from the connection,
			// not from the request, so the client cannot spoof routing
			entry := services.QueueEntry{
				TradeID:   uuid.NewString(),
				ConnID:    connID,
				AccountID: accountID,
				BotID:     req.BotID,
				Ticker:    req.Ticker,
				Action:    req.Action,
				Side:      side,
				Quantity:  req.Quantity,
				Price:     req.Price,
			}

			// Push onto the Redis queue — flusher picks this up within 150ms,
			// bulk inserts to DB, publishes confirm to trades:confirm:<connID>,
			// subscriber delivers it back to this connection
			if err := pool.QueueTrade(context.Background(), entry); err != nil {
				log.Printf("[ws] queue error connID=%s tradeID=%s: %v", connID, entry.TradeID, err)
				resp, _ := json.Marshal(gin.H{"error": "Could not queue trade"})
				rc.Write(resp)
				continue
			}
		}
	}
}

func UpdateTrade(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)
		tradeID := c.Param("trade_id")

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

		var req map[string]json.RawMessage
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		updates := []string{}
		args := []any{}

		addUpdate := func(column string, value any) {
			args = append(args, value)
			updates = append(updates, fmt.Sprintf("%s = $%d", column, len(args)))
		}

		for _, field := range []string{"stop_loss", "take_profit", "price"} {
			raw, ok := req[field]
			if !ok {
				continue
			}

			value, err := nullableFloat(raw)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": field + " must be a number or null"})
				return
			}
			addUpdate(field, value)
		}

		if raw, ok := req["order_type"]; ok {
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
		tradeIDParam := len(args) - 1
		accountIDParam := len(args)

		query := fmt.Sprintf(`
			UPDATE trades
			   SET %s,
			       updated_at = NOW()
			 WHERE id = $%d
			   AND account_id = $%d
			   AND status = 'open'
			RETURNING id,
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
		`, strings.Join(updates, ", "), tradeIDParam, accountIDParam)

		var id, symbol, side, orderType, status string
		var quantity, entryPrice float64
		var price, stopLoss, takeProfit sql.NullFloat64
		var openedAt time.Time

		err = db.QueryRowContext(c, query, args...).Scan(
			&id, &symbol, &side, &quantity, &price, &entryPrice,
			&orderType, &stopLoss, &takeProfit, &status, &openedAt,
		)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Trade not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update trade"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Trade updated",
			"data": gin.H{
				"id":          id,
				"trade_id":    id,
				"symbol":      symbol,
				"side":        side,
				"quantity":    quantity,
				"price":       nullableFloatValue(price),
				"entry_price": entryPrice,
				"order_type":  orderType,
				"stop_loss":   nullableFloatValue(stopLoss),
				"take_profit": nullableFloatValue(takeProfit),
				"status":      status,
				"opened_at":   openedAt,
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
			tradesKey := "backtest:trades:" + *req.SessionID
			cached, _ := redisClient.Get(c, tradesKey).Bytes()
			var trades []map[string]any
			if cached != nil {
				json.Unmarshal(cached, &trades)
			}

			var trade map[string]any
			for _, t := range trades {
				if t["id"] == tradeID || t["trade_id"] == tradeID {
					trade = t
					break
				}
			}
			if trade == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "Trade not found"})
				return
			}

			trade["status"] = "closed"
			trade["exit_price"] = req.ExitPrice
			trade["realised_pnl"] = req.RealisedPnl
			trade["closed_at"] = time.Now().UTC().Format(time.RFC3339)

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

			c.JSON(http.StatusOK, gin.H{"message": "Trade closed", "data": trade})
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
		err = tx.QueryRowContext(c,
			`SELECT symbol,
			        CASE side WHEN 'buy' THEN 'long' ELSE 'short' END AS side
			   FROM trades
			 WHERE id = $1 AND account_id = $2 AND status = 'open'
			 FOR UPDATE`,
			tradeID, accountID,
		).Scan(&symbol, &side)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Trade not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch trade"})
			return
		}

		closedAt := time.Now().UTC()
		result, err := tx.ExecContext(c,
			`UPDATE trades
			 SET status = 'closed',
			     exit_price = $1,
			     realised_pnl = $2,
			     closed_at = $3,
			     updated_at = $3
			 WHERE id = $4 AND account_id = $5 AND status = 'open'`,
			req.ExitPrice, req.RealisedPnl, closedAt, tradeID, accountID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not close trade"})
			return
		}
		rowsAffected, err := result.RowsAffected()
		if err != nil || rowsAffected != 1 {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not close trade"})
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

		// ↓ add this
		if err = updateAccountStats(c, tx, accountID, req.RealisedPnl); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update account stats"})
			return
		}

		if err = tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not commit transaction"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Trade closed",
			"data": gin.H{
				"trade_id":     tradeID,
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
