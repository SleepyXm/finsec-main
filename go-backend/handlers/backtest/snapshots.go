package backtest

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"finsec-backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

func loadSnapshot(db *sql.DB, userID string, sessionID string) (snapshot, error) {
	var item snapshot
	var positions []byte
	item.SessionID = sessionID
	err := db.QueryRow(`
		SELECT ticker, interval, date_from, date_to, starting_balance,
		       current_candle, positions, created_at, updated_at, expires_at
		FROM backtests
		WHERE id = $1 AND user_id = $2 AND expires_at > NOW()
	`, sessionID, userID).Scan(
		&item.Ticker, &item.Interval, &item.DateFrom, &item.DateTo,
		&item.StartingBalance, &item.CurrentCandle, &positions,
		&item.CreatedAt, &item.UpdatedAt, &item.ExpiresAt,
	)
	item.Positions = positions
	return item, err
}

func ListBacktests(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)
		rows, err := db.QueryContext(c, `
			SELECT id, ticker, interval, date_from, date_to, starting_balance,
			       current_candle, created_at, updated_at, expires_at
			FROM backtests
			WHERE user_id = $1 AND expires_at > NOW()
			ORDER BY updated_at DESC
		`, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list backtests"})
			return
		}
		defer rows.Close()

		items := make([]snapshot, 0)
		for rows.Next() {
			var item snapshot
			if err := rows.Scan(
				&item.SessionID, &item.Ticker, &item.Interval,
				&item.DateFrom, &item.DateTo, &item.StartingBalance,
				&item.CurrentCandle, &item.CreatedAt, &item.UpdatedAt, &item.ExpiresAt,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read backtests"})
				return
			}
			items = append(items, item)
		}
		c.JSON(http.StatusOK, items)
	}
}

func GetBacktestSession(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)
		item, err := loadSnapshot(db, userID, c.Param("session_id"))
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Backtest not found or expired"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load backtest"})
			return
		}

		key := "backtest:candles:" + item.SessionID
		cached, err := utils.RDB.Get(c, key).Bytes()
		if err == redis.Nil {
			item.Candles, err = fetchCandles(
				c, item.Ticker, item.Interval,
				item.DateFrom.Format("2006-01-02"), item.DateTo.Format("2006-01-02"),
			)
			if err == nil {
				data, _ := json.Marshal(item.Candles)
				utils.RDB.SetEx(c, key, data, time.Until(item.ExpiresAt))
			}
		} else if err == nil {
			err = json.Unmarshal(cached, &item.Candles)
		}
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "failed to restore candles"})
			return
		}
		item.CandleCount = len(item.Candles)
		c.JSON(http.StatusOK, item)
	}
}

func UpdateBacktestSession(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 512<<10)
		var req snapshotUpdate
		if err := c.ShouldBindJSON(&req); err != nil || req.CurrentCandle == nil ||
			*req.CurrentCandle < 0 || *req.CurrentCandle > maxBacktestCandles {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid backtest snapshot"})
			return
		}
		if err := validateBacktestPositions(req.Positions, *req.CurrentCandle); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		result, err := db.ExecContext(c, `
			UPDATE backtests
			SET current_candle = $1, positions = $2::jsonb
			WHERE id = $3 AND user_id = $4 AND expires_at > NOW()
		`, *req.CurrentCandle, string(req.Positions), c.Param("session_id"), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save backtest"})
			return
		}
		updated, _ := result.RowsAffected()
		if updated == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Backtest not found or expired"})
			return
		}
		c.Status(http.StatusNoContent)
	}
}

func DeleteBacktestSession(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)
		sessionID := c.Param("session_id")
		result, err := db.ExecContext(c,
			`DELETE FROM backtests WHERE id = $1 AND user_id = $2`, sessionID, userID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete backtest"})
			return
		}
		deleted, _ := result.RowsAffected()
		if deleted == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Backtest not found"})
			return
		}

		keys := []string{
			"backtest:session:" + sessionID, "backtest:candles:" + sessionID,
			"backtest:trades:" + sessionID, "backtest:balance:" + sessionID,
		}
		utils.RDB.Del(c, keys...)
		c.Status(http.StatusNoContent)
	}
}
