package routes

import (
	"database/sql"
	handlers "finsec-backend/handlers/accounts"
	"finsec-backend/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterAccounteRoutes(rg *gin.RouterGroup, db *sql.DB) {
	auth := middleware.AuthMiddleware(db)
	// paginated rows only
	rg.GET("/stats", auth, handlers.GetAccountStats(db)) // pre-aggregated all-time stats
	rg.GET("/journal", auth, handlers.GetJournal(db))    // ?month=2025-05
	rg.GET("/pnl-curve", auth, handlers.GetPnLCurve(db)) // ?period=month|week|all
}
