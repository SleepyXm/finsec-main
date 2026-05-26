package routes

import (
	handlers_experimental "finsec-backend/handlers-experimental"
	"finsec-backend/handlers/stocks"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

func RegisterStockRoutes(rg *gin.RouterGroup, rdb *redis.Client) {
	rg.Any("/ws/stockdata", stocks.StockDataHandler(rdb))
	rg.Any("/ws/prices", stocks.MarketOverviewHandler(rdb))
	rg.Any("/ws/compressed/stockdata", handlers_experimental.StockDataHandler(rdb))
	//rg.Any("/ws/price", stocks.LivePriceHandler(rdb))
	//rg.Any("/ws/intraday", stocks.IntradayHandler(rdb))
}
