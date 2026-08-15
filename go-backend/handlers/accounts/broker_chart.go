package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"finsec-backend/market"
	"finsec-backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

var pythonBrokerClient = &http.Client{Timeout: 15 * time.Second}
var AssetType = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]{1,39}$`)

func BrokerChart(db *sql.DB, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		broker := strings.ToLower(strings.TrimSpace(c.Param("broker")))
		if broker != "saxo" && broker != "ig" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Unsupported broker"})
			return
		}

		name := "Saxo"
		if broker == "ig" {
			name = "IG"
		}

		interval, intervalErr := market.NormalizeInterval(c.DefaultQuery("interval", "5m"))
		if intervalErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Valid interval is required"})
			return
		}

		connection, err := loadConnection(c, db, c.GetString("userID"))
		if err != nil || !connection.Broker.Valid || connection.Broker.String != broker {
			c.JSON(http.StatusConflict, gin.H{"error": name + " reconnection required"})
			return
		}

		key := "broker:" + broker + ":" + connection.AccountID
		value, err := rdb.Get(c, key).Result()
		if err == redis.Nil {
			c.JSON(http.StatusConflict, gin.H{"error": name + " reconnection required"})
			return
		}
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Could not access " + name + " connection"})
			return
		}

		session, err := decryptSession(value)
		if err != nil {
			_ = rdb.Del(c, key).Err()
			c.JSON(http.StatusConflict, gin.H{"error": name + " reconnection required"})
			return
		}

		if broker == "saxo" && !session.ExpiresAt.After(time.Now()) {
			_ = rdb.Del(c, key).Err()
			c.JSON(http.StatusConflict, gin.H{"error": "Saxo reconnection required"})
			return
		}

		if broker == "ig" && time.Until(session.ExpiresAt) < 30*time.Second {
			session, err = igRefresh(c, session)
			if err != nil {
				_ = rdb.Del(c, key).Err()
				c.JSON(http.StatusConflict, gin.H{"error": "IG reconnection required"})
				return
			}
			if err = saveSession(c, rdb, key, session); err != nil {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Could not save IG connection"})
				return
			}
		}

		payload := gin.H{
			"environment":  session.Environment,
			"access_token": session.AccessToken,
			"interval":     interval,
		}

		switch broker {
		case "saxo":
			uic, err := strconv.Atoi(c.Query("uic"))
			assetType := strings.TrimSpace(c.Query("asset_type"))
			if err != nil || uic <= 0 || !AssetType.MatchString(assetType) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Valid Saxo UIC and asset type are required"})
				return
			}
			payload["account_key"] = session.AccountKey
			payload["uic"] = uic
			payload["asset_type"] = assetType

		case "ig":
			epic := strings.TrimSpace(c.Query("epic"))
			if epic == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Valid IG epic is required"})
				return
			}
			payload["account_id"] = session.AccountID
			payload["api_key"] = ""
			payload["epic"] = epic
		}

		body, status, err := requestChart(c, broker, payload)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": name + " chart service is unavailable"})
			return
		}
		if status == http.StatusForbidden {
			_ = rdb.Del(c, key).Err()
			c.JSON(http.StatusConflict, gin.H{"error": name + " reconnection required"})
			return
		}
		if status == http.StatusUnauthorized {
			c.JSON(http.StatusBadGateway, gin.H{"error": name + " chart service authentication failed"})
			return
		}
		if status < 200 || status >= 300 {
			c.Data(status, "application/json", body)
			return
		}
		c.Data(http.StatusOK, "application/json", body)
	}
}

func requestChart(ctx context.Context, broker string, payload gin.H) ([]byte, int, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(utils.Cfg.PythonUrl, "/")+"/api/internal/"+broker+"/chart", bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Internal-Secret", utils.Cfg.InternalSecret)
	response, err := pythonBrokerClient.Do(request)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	body, err = io.ReadAll(io.LimitReader(response.Body, 8<<20))
	return body, response.StatusCode, err
}
