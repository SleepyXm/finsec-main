package routes

import (
	"database/sql"
	handlers "finsec-backend/handlers/products"
	"finsec-backend/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterProductRoutes(rg *gin.RouterGroup, db *sql.DB) {
	auth := middleware.AuthMiddleware(db)
	rg.GET("/subscriptions", handlers.GetSubscriptions(db))
	rg.POST("/webhook", handlers.HandleStripeWebhook(db))
	rg.GET("/subscription", auth, handlers.GetCurrentSubscription(db))
	rg.POST("/checkout-session", auth, handlers.CreateCheckoutSession(db))
	rg.POST("/billing-portal", auth, handlers.CreateBillingPortalSession(db))
	rg.GET("/checkout-success", auth, handlers.HandleCheckoutSuccess(db))
}
