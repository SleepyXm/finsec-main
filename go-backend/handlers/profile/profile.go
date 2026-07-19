package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"finsec-backend/structs"

	"github.com/gin-gonic/gin"
)

func GetPreferences(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		var colorScheme []byte
		var cookieConsent sql.NullString
		err := db.QueryRowContext(c,
			`SELECT COALESCE(color_scheme, '{}'::jsonb), cookie_consent FROM user_preferences WHERE user_id = $1`, userID,
		).Scan(&colorScheme, &cookieConsent)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{"color_scheme": map[string]interface{}{}, "cookie_consent": nil})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch preferences"})
			return
		}

		parsed := map[string]interface{}{}
		if err := json.Unmarshal(colorScheme, &parsed); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not read preferences"})
			return
		}
		var consent *string
		if cookieConsent.Valid {
			value := cookieConsent.String
			consent = &value
		}
		c.JSON(http.StatusOK, gin.H{"color_scheme": parsed, "cookie_consent": consent})
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

		if req.ColorScheme == nil && req.CookieConsent == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No preferences supplied"})
			return
		}
		if req.CookieConsent != nil {
			value := strings.ToLower(strings.TrimSpace(*req.CookieConsent))
			if value != "accepted" && value != "declined" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cookie consent"})
				return
			}
			req.CookieConsent = &value
		}

		tx, err := db.BeginTx(c, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save preferences"})
			return
		}
		defer tx.Rollback()
		if _, err = tx.ExecContext(c, `
			INSERT INTO user_preferences (user_id, updated_at) VALUES ($1, NOW())
			ON CONFLICT (user_id) DO NOTHING
		`, userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save preferences"})
			return
		}
		if req.ColorScheme != nil {
			data, marshalErr := json.Marshal(*req.ColorScheme)
			if marshalErr != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid color scheme"})
				return
			}
			if _, err = tx.ExecContext(c, `
				UPDATE user_preferences SET color_scheme = $2, updated_at = NOW() WHERE user_id = $1
			`, userID, data); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save preferences"})
				return
			}
		}
		if req.CookieConsent != nil {
			if _, err = tx.ExecContext(c, `
				UPDATE user_preferences SET cookie_consent = $2, updated_at = NOW() WHERE user_id = $1
			`, userID, *req.CookieConsent); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save preferences"})
				return
			}
		}
		if err = tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save preferences"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Preferences saved"})
	}
}
