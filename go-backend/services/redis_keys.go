package services

import "time"

const (
	flushEvery   = 150 * time.Millisecond
	maxBatchSize = 500

	tradeBatchTTL = 30 * time.Second
)

const (
	redisTradePendingKey    = "trades:pending"
	redisTradeBatchPrefix   = "trades:batch:"
	redisTradeProcessingKey = "trades:processing"
	redisTradeConfirmPrefix = "trades:confirm:"
)

func redisTradeBatchKey(batchID string) string {
	return redisTradeBatchPrefix + batchID
}

func redisTradeConfirmChannel(connID string) string {
	return redisTradeConfirmPrefix + connID
}
