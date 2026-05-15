package routes

import (
	"database/sql"
	handlers "finsec-backend/handlers/profile"
	"finsec-backend/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterProfileRoutes(rg *gin.RouterGroup, db *sql.DB) {
	rg.GET("/profile/preferences", middleware.AuthMiddleware(db), handlers.GetPreferences(db))
	rg.PUT("/profile/preferences", middleware.AuthMiddleware(db), handlers.UpdatePreferences(db))
}
