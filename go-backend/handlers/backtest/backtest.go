package backtest

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"finsec-backend/structs"
	"finsec-backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const BacktestSessionTTL = 72 * time.Hour

func fetchCandles(
	ctx context.Context,
	ticker string,
	interval string,
	dateFrom string,
	dateTo string,
) ([]structs.BacktestCandle, error) {
	body, err := json.Marshal(map[string]any{
		"ticker": strings.ToUpper(ticker), "interval": interval,
		"date_from": dateFrom, "date_to": dateTo,
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		utils.Cfg.PythonUrl+"/api/internal/backtest/candles",
		bytes.NewBuffer(body),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Secret", utils.Cfg.InternalSecret)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("candle service returned %d", resp.StatusCode)
	}

	var candles []structs.BacktestCandle
	if err := json.NewDecoder(resp.Body).Decode(&candles); err != nil {
		return nil, err
	}
	if len(candles) == 0 {
		return nil, fmt.Errorf("no candles found")
	}
	return candles, nil
}

func cacheSession(
	ctx context.Context,
	session structs.BacktestSession,
	candles []structs.BacktestCandle,
) error {
	sessionJSON, err := json.Marshal(session)
	if err != nil {
		return err
	}
	candlesJSON, err := json.Marshal(candles)
	if err != nil {
		return err
	}

	pipe := utils.RDB.TxPipeline()
	pipe.SetEx(ctx, "backtest:session:"+session.SessionID, sessionJSON, BacktestSessionTTL)
	pipe.SetEx(ctx, "backtest:candles:"+session.SessionID, candlesJSON, BacktestSessionTTL)
	_, err = pipe.Exec(ctx)
	return err
}

// RunBacktest creates the durable snapshot and the matching temporary candle cache.
func RunBacktest(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)
		var req structs.BacktestRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		candles, err := fetchCandles(c, req.Ticker, req.Interval, req.DateFrom, req.DateTo)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}

		sessionID := uuid.NewString()
		var createdAt, expiresAt time.Time
		err = db.QueryRowContext(c, `
			INSERT INTO backtests (
				id, user_id, ticker, interval, date_from, date_to, starting_balance
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING created_at, expires_at
		`,
			sessionID, userID, strings.ToUpper(req.Ticker), req.Interval,
			req.DateFrom, req.DateTo, req.StartingBalance,
		).Scan(&createdAt, &expiresAt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create backtest"})
			return
		}

		session := structs.BacktestSession{
			SessionID: sessionID, UserID: userID,
			Ticker: strings.ToUpper(req.Ticker), Interval: req.Interval,
			DateFrom: req.DateFrom, DateTo: req.DateTo,
			StartingBalance: req.StartingBalance, CandleCount: len(candles),
			CreatedAt: createdAt.UTC().Format(time.RFC3339),
			ExpiresAt: expiresAt.UTC().Format(time.RFC3339),
		}
		if err := cacheSession(c, session, candles); err != nil {
			_, _ = db.ExecContext(c, `DELETE FROM backtests WHERE id = $1`, sessionID)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to cache backtest"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"session_id": sessionID, "ticker": session.Ticker,
			"interval": session.Interval, "date_from": session.DateFrom,
			"date_to": session.DateTo, "starting_balance": session.StartingBalance,
			"candle_count": len(candles), "current_candle": 0,
			"positions": []any{}, "created_at": session.CreatedAt,
			"expires_at": session.ExpiresAt, "candles": candles,
		})
	}
}
