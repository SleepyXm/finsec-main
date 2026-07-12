package routes

import (
	"database/sql"
	"finsec-backend/handlers/backtest"
	"finsec-backend/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterBacktestRoutes(rg *gin.RouterGroup, db *sql.DB) {
	rg.Use(middleware.AuthMiddleware(db))
	rg.POST("/backtest/run", backtest.RunBacktest(db))
	rg.GET("/backtest/sessions", backtest.ListBacktests(db))
	rg.GET("/backtest/session/:session_id", backtest.GetBacktestSession(db))
	rg.PATCH("/backtest/session/:session_id", backtest.UpdateBacktestSession(db))
	rg.DELETE("/backtest/session/:session_id", backtest.DeleteBacktestSession(db))
}
