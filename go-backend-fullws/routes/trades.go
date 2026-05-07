package routes

import (
	"database/sql"
	"finsec-backend/handlers/positions"
	"finsec-backend/middleware"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

//func RegisterTradeRoutes(r *gin.Engine, db *sql.DB, redisClient *redis.Client) {
//	api := r.Group("/api")
//	api.GET("/positions", positions.GetOpenPositions(db))
//	//api.GET("/portfolio", positions.GetPortfolio(db))
//	api.POST("/trade", positions.PlaceTrade(db, redisClient))
//	api.DELETE("/trade/:trade_id", positions.CloseTrade(db, redisClient))
//}

func RegisterTradeRoutes(rg *gin.RouterGroup, db *sql.DB, redisClient *redis.Client) {
	rg.GET("/positions", middleware.AuthMiddleware(db), positions.GetOpenPositions(db))
	//rg.POST("/portfolio", middleware.AuthMiddleware(db), positions.GetPortfolio(db, redisClient))
	rg.POST("/trade", middleware.AuthMiddleware(db), positions.PlaceTrade(db, redisClient))
	rg.DELETE("/trade/:trade_id", middleware.AuthMiddleware(db), positions.CloseTrade(db, redisClient))
}
