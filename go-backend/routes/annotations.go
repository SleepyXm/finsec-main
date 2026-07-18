package routes

import (
	"database/sql"
	"finsec-backend/handlers/annotations"
	"finsec-backend/middleware"

	"github.com/gin-gonic/gin"
)

func RegisterAnnotationRoutes(rg *gin.RouterGroup, db *sql.DB) {
	rg.POST("/annotations", annotations.SaveTraining())
	rg.GET("/annotations", annotations.ListTraining())
	rg.POST("/user-annotations", middleware.AuthMiddleware(db), annotations.SaveUser(db))
	rg.GET("/user-annotations", middleware.AuthMiddleware(db), annotations.ListUser(db))
	rg.GET("/user-annotations/:id", middleware.AuthMiddleware(db), annotations.GetUser(db))
	rg.DELETE("/user-annotations/:id", middleware.AuthMiddleware(db), annotations.DeleteUser(db))
	rg.DELETE("/user-annotations/:id/snapshots/:index", middleware.AuthMiddleware(db), annotations.DeleteUserSnapshot(db))
	rg.PUT("/user-annotations/:id/snapshots/:index/annotations", middleware.AuthMiddleware(db), annotations.UpdateUserSnapshotAnnotations(db))
}
