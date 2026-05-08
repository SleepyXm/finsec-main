package backtest

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"finsec-backend/structs"
	"strings"

	"bytes"
	"database/sql"

	"finsec-backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const BacktestSessionTTL = 1 * time.Hour

// RunBacktest handles POST /backtest/run.
// It loads candle data for the requested ticker/interval/date range from Parquet storage,
// builds a enriched candle list with buy prices, creates a session record, stores it in
// Redis, and returns the full candle sequence to the client.

func RunBacktest(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		var req structs.BacktestRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		body, err := json.Marshal(map[string]any{
			"ticker":    strings.ToUpper(req.Ticker),
			"interval":  req.Interval,
			"date_from": req.DateFrom,
			"date_to":   req.DateTo,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build request"})
			return
		}

		pyReq, err := http.NewRequest("POST", utils.Cfg.PythonUrl+"/api/internal/backtest/candles", bytes.NewBuffer(body))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build request"})
			return
		}
		pyReq.Header.Set("Content-Type", "application/json")
		pyReq.Header.Set("X-Internal-Secret", utils.Cfg.InternalSecret)

		pyResp, err := http.DefaultClient.Do(pyReq)
		if err != nil || pyResp.StatusCode != 200 {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build candles"})
			return
		}
		defer pyResp.Body.Close()

		var candles []structs.BacktestCandle
		if err := json.NewDecoder(pyResp.Body).Decode(&candles); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to decode candles"})
			return
		}

		sessionID := uuid.NewString()
		session := structs.BacktestSession{
			SessionID:       sessionID,
			UserID:          userID,
			Ticker:          strings.ToUpper(req.Ticker),
			Interval:        req.Interval,
			DateFrom:        req.DateFrom,
			DateTo:          req.DateTo,
			StartingBalance: req.StartingBalance,
			CandleCount:     len(candles),
			CreatedAt:       time.Now().UTC().Format(time.RFC3339),
		}

		sessionJSON, _ := json.Marshal(session)
		if err := utils.RDB.SetEx(context.Background(), fmt.Sprintf("backtest:session:%s", sessionID), sessionJSON, BacktestSessionTTL).Err(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store session"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"session_id":       sessionID,
			"ticker":           session.Ticker,
			"interval":         session.Interval,
			"candle_count":     len(candles),
			"starting_balance": req.StartingBalance,
			"candles":          candles,
		})
	}
}

// GetBacktestSession handles GET /backtest/session/:session_id.
// It retrieves a previously created backtest session from Redis, verifies ownership,
// and returns the session metadata to the authenticated user.
func GetBacktestSession(db *sql.DB) gin.HandlerFunc {
	// Authenticate the requesting user.
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		// Extract the session ID from the URL path parameter.
		sessionID := c.Param("session_id")
		sessionKey := fmt.Sprintf("backtest:session:%s", sessionID)

		// Look up the session in Redis.
		ctx := context.Background()
		cached, err := utils.RDB.Get(ctx, sessionKey).Result()
		if err != nil {
			// Redis returns an error when the key does not exist.
			c.JSON(http.StatusNotFound, gin.H{"error": "Backtest session not found or expired"})
			return
		}

		// Deserialise the stored JSON back into a BacktestSession struct.
		var session structs.BacktestSession
		if err := json.Unmarshal([]byte(cached), &session); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse session"})
			return
		}

		// Ensure the session belongs to the requesting user.
		if session.UserID != fmt.Sprintf("%v", userID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not your session"})
			return
		}

		c.JSON(http.StatusOK, session)
	}
}

// DeleteBacktestSession handles DELETE /backtest/session/:session_id.
// It verifies ownership of the session and then removes both the session metadata
// and any associated candle cache entries from Redis.
func DeleteBacktestSession(db *sql.DB) gin.HandlerFunc {
	// Authenticate the requesting user.
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		// Extract the session ID from the URL path parameter.
		sessionID := c.Param("session_id")
		sessionKey := fmt.Sprintf("backtest:session:%s", sessionID)

		// Fetch the session from Redis to verify it exists and check ownership.
		ctx := context.Background()
		cached, err := utils.RDB.Get(ctx, sessionKey).Result()
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}

		// Deserialise the session to check ownership before deletion.
		var session structs.BacktestSession
		if err := json.Unmarshal([]byte(cached), &session); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse session"})
			return
		}

		// Reject the deletion if the session belongs to a different user.
		if session.UserID != fmt.Sprintf("%v", userID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not your session"})
			return
		}

		// Delete the session metadata key.
		utils.RDB.Del(ctx, sessionKey)

		// Also delete the associated candles cache key, if it exists.
		utils.RDB.Del(ctx, fmt.Sprintf("backtest:candles:%s", sessionID))

		c.JSON(http.StatusOK, gin.H{"message": "Session deleted"})
	}
}
