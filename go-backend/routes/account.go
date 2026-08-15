package routes

import (
	"database/sql"
	handlers "finsec-backend/handlers/accounts"
	"finsec-backend/middleware"
	"finsec-backend/utils"

	"github.com/gin-gonic/gin"
)

func RegisterAccountRoutes(rg *gin.RouterGroup, db *sql.DB) {
	auth := middleware.AuthMiddleware(db)
	// paginated rows only
	rg.GET("/stats", auth, handlers.GetAccountStats(db)) // pre-aggregated all-time stats
	rg.GET("/journal", auth, handlers.GetJournal(db))    // ?month=2025-05
	rg.GET("/pnl-curve", auth, handlers.GetPnLCurve(db)) // ?period=month|week|all
	rg.GET("/broker/:broker", auth, handlers.Status(db, utils.RDB))
	rg.POST("/broker/:broker/authorize", auth, handlers.Authorize(db, utils.RDB))
	rg.GET("/broker/:broker/callback", auth, handlers.Callback(db, utils.RDB))
	rg.DELETE("/broker/:broker", auth, handlers.Disconnect(db, utils.RDB))
	rg.GET("/broker/:broker/chart", auth, handlers.Chart(db, utils.RDB))
}
