package positions

import (
	"context"
	"database/sql"
	"encoding/json"
	"finsec-backend/services"
	"finsec-backend/structs"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gobwas/ws"
	"github.com/gobwas/ws/wsutil"
	"github.com/redis/go-redis/v9"

	"github.com/google/uuid"
)

var BacktestSessionTTL = 1 * time.Hour

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
		rc := services.NewRedisConn(connID, netConn)

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

				// Write confirm directly back on the WebSocket — no queue needed for backtest
				resp, _ := json.Marshal(gin.H{"message": "Trade recorded", "data": position})
				rc.Write(resp)
				continue
			}

			// Live trade — determine side from action
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
