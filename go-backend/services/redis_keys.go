package services

func redisTradeBatchKey(batchID string) string {
	return redisTradeBatchPrefix + batchID
}

func redisTradeConfirmChannel(connID string) string {
	return redisTradeConfirmPrefix + connID
}
