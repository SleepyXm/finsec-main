package routes

import (
	"database/sql"
	handlers "finsec-backend/handlers/products"
	"finsec-backend/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterProductRoutes(rg *gin.RouterGroup, db *sql.DB) {
	auth := middleware.AuthMiddleware(db)
	// paginated rows only
	rg.GET("/subscriptions", handlers.GetSubscriptions(db)) // pre-aggregated all-time stats
	rg.GET("/extras", handlers.GetExtras(db))               // ?month=2025-05
	rg.POST("/webhook", handlers.HandleStripeWebhook(db))
	rg.POST("/checkout-session", auth, handlers.CreateCheckoutSession(db)) // ?period=month|all'
	rg.GET("/checkout-success", auth, handlers.HandleCheckoutSuccess(db))

}
