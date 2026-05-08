package routes

import (
	"finsec-backend/handlers/stocks"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

func RegisterStockRoutes(rg *gin.RouterGroup, rdb *redis.Client) {
	rg.Any("/ws/stockdata", stocks.StockDataHandler(rdb))
	rg.Any("/ws/price", stocks.LivePriceHandler(rdb))
}
