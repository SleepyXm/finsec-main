package routes

import (
	"database/sql"
	"finsec-backend/handlers/indicators"
	"finsec-backend/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterIndicatorRoutes(rg *gin.RouterGroup, db *sql.DB) {
	auth := middleware.AuthMiddleware(db)
	rg.POST("/indicators", auth, indicators.Save(db))
	rg.GET("/indicators", auth, indicators.List(db))
	rg.GET("/indicators/:id", auth, indicators.GetSource(db))
	rg.DELETE("/indicators/:id", auth, indicators.Delete(db))
}
