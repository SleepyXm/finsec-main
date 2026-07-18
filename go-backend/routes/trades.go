package routes

import (
	"database/sql"
	"finsec-backend/handlers/positions"
	"finsec-backend/middleware"
	"finsec-backend/services"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

func RegisterTradeRoutes(rg *gin.RouterGroup, db *sql.DB, redisClient *redis.Client, pool *services.WorkerPool) {
	rg.GET("/positions", middleware.AuthMiddleware(db), positions.GetOpenPositions(db))
	rg.GET("/portfolio", middleware.AuthMiddleware(db), positions.GetPositionHistory(db))
	rg.GET("/trade", middleware.AuthMiddleware(db), positions.PlaceTrade(db, redisClient, pool))
	rg.PATCH("/trade/:trade_id", middleware.AuthMiddleware(db), positions.UpdateTrade(db))
	rg.DELETE("/trade/:trade_id", middleware.AuthMiddleware(db), positions.CloseTrade(db, redisClient))
}
