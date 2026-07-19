package annotations

import (
	"database/sql"
	"errors"
	"net/http"

	"finsec-backend/entitlements"

	"github.com/gin-gonic/gin"
)

func checkStrategyLimit(c *gin.Context, tx *sql.Tx, userID, name string) bool {
	if err := entitlements.LockUser(c, tx, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify strategy limit"})
		return false
	}
	err := entitlements.CheckCreate(
		c, tx, entitlements.Normalize(c.GetString("subscriptionTier")),
		userID, entitlements.SavedStrategies, name,
	)
	var limitErr *entitlements.LimitError
	if errors.As(err, &limitErr) {
		entitlements.WriteLimitError(c, limitErr)
		return false
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify strategy limit"})
		return false
	}
	return true
}
