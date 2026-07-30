package positions

import (
	"context"
	"database/sql"
	"log"
	"time"

	"finsec-backend/services"

	"github.com/gin-gonic/gin"
	"github.com/gobwas/ws"
	"github.com/gobwas/ws/wsutil"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

func PlaceTrade(db *sql.DB, _ *redis.Client, pool *services.WorkerPool) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)
		netConn, _, _, err := ws.UpgradeHTTP(c.Request, c.Writer)
		if err != nil {
			log.Printf("[ws] trade upgrade error userID=%s: %v", userID, err)
			return
		}

		var accountID string
		err = db.QueryRowContext(c, `SELECT id FROM user_accounts WHERE user_id = $1`, userID).Scan(&accountID)
		if err != nil {
			_ = netConn.Close()
			return
		}

		connID := uuid.NewString()
		identifiedConn := services.NewIdentifiedWSConn(connID, netConn)
		broadcastConn := services.NewWSConn(netConn)
		pool.RegisterConn(identifiedConn)
		pool.AddConn(broadcastConn)
		defer func() {
			pool.UnregisterConn(identifiedConn)
			pool.RemoveConn(broadcastConn)
			_ = identifiedConn.Close()
			_ = netConn.Close()
		}()

		for {
			message, operation, err := wsutil.ReadClientData(netConn)
			if err != nil {
				return
			}
			if operation != ws.OpText {
				writeTradeSocketError(identifiedConn, "trade requests must be text messages")
				continue
			}

			request, err := decodeTradeAction(message)
			if err != nil {
				writeTradeSocketError(identifiedConn, err.Error())
				continue
			}
			entry := services.QueueEntry{
				TradeID: uuid.NewString(), ConnID: connID, AccountID: accountID,
				Ticker: request.Ticker, Action: request.Action,
				OrderType: request.OrderType, Quantity: request.Quantity, Price: request.Price,
			}

			queueContext, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			err = pool.QueueTrade(queueContext, entry)
			cancel()
			if err != nil {
				log.Printf("[ws] queue error connID=%s tradeID=%s: %v", connID, entry.TradeID, err)
				writeTradeSocketError(identifiedConn, "Could not queue trade")
			}
		}
	}
}
