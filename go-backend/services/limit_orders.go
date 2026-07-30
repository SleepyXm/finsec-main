package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"math"

	"github.com/redis/go-redis/v9"
)

type limitOrderStore interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

type limitPriceTick struct {
	Ticker   string  `json:"ticker"`
	Close    float64 `json:"close"`
	BuyPrice float64 `json:"buy_price"`
}

func RunLimitOrderExecutor(ctx context.Context, db *sql.DB, redisClient *redis.Client) {
	pubsub := redisClient.PSubscribe(ctx, "price:finsec:*:*")
	defer pubsub.Close()

	for {
		select {
		case <-ctx.Done():
			return
		case message, open := <-pubsub.Channel():
			if !open {
				return
			}
			var tick limitPriceTick
			if err := json.Unmarshal([]byte(message.Payload), &tick); err != nil {
				continue
			}
			if err := fillPendingLimitOrders(ctx, db, tick); err != nil {
				log.Printf("[limits] fill ticker=%s: %v", tick.Ticker, err)
			}
		}
	}
}

func fillPendingLimitOrders(ctx context.Context, db limitOrderStore, tick limitPriceTick) error {
	if tick.Ticker == "" || !validLimitPrice(tick.Close) {
		return nil
	}
	ask := tick.BuyPrice
	if !validLimitPrice(ask) {
		ask = tick.Close
	}

	result, err := db.ExecContext(ctx, `
		UPDATE trades
		SET entry_price = CASE side WHEN 'buy' THEN $2 ELSE $3 END,
		    status = 'open', opened_at = NOW(), updated_at = NOW()
		WHERE symbol = $1 AND order_type = 'limit' AND status = 'pending'
		  AND (
		    (side = 'buy' AND price >= $2)
		    OR (side = 'sell' AND price <= $3)
		  )
	`, tick.Ticker, ask, tick.Close)
	if err != nil {
		return err
	}
	filled, err := result.RowsAffected()
	if err == nil && filled > 0 {
		log.Printf("[limits] filled ticker=%s orders=%d", tick.Ticker, filled)
	}
	return err
}

func validLimitPrice(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value > 0
}
