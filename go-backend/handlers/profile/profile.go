package handlers

import (
	"database/sql"
	"encoding/json"
	"finsec-backend/structs"
	"net/http"

	"github.com/gin-gonic/gin"
)

func GetPreferences(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		var colorScheme []byte
		err := db.QueryRowContext(c,
			`SELECT color_scheme FROM user_preferences WHERE user_id = $1`, userID,
		).Scan(&colorScheme)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{"color_scheme": map[string]interface{}{}})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch preferences"})
			return
		}

		var parsed map[string]interface{}
		json.Unmarshal(colorScheme, &parsed)
		c.JSON(http.StatusOK, gin.H{"color_scheme": parsed})
	}
}

func UpdatePreferences(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		var req structs.UpdatePreferencesRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		data, err := json.Marshal(req.ColorScheme)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid color scheme"})
			return
		}

		_, err = db.ExecContext(c,
			`INSERT INTO user_preferences (user_id, color_scheme, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id)
             DO UPDATE SET color_scheme = $2, updated_at = NOW()`,
			userID, data,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save preferences"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Preferences saved"})
	}
}
