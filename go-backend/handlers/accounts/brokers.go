package handlers

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"finsec-backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

var brokerHTTPClient = &http.Client{Timeout: 12 * time.Second}
var brokerPythonClient = &http.Client{Timeout: 15 * time.Second}

var saxoAuthURLs = map[string]string{
	"demo": "https://sim.logonvalidation.net",
	"live": "https://live.logonvalidation.net",
}

var saxoAPIURLs = map[string]string{
	"demo": "https://gateway.saxobank.com/sim/openapi",
	"live": "https://gateway.saxobank.com/openapi",
}

var igAPIURLs = map[string]string{
	"demo": "https://demo-api.ig.com/gateway/deal",
	"live": "https://api.ig.com/gateway/deal",
}

type brokerSession struct {
	Broker       string    `json:"broker"`
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token,omitempty"`
	APIKey       string    `json:"api_key,omitempty"`
	Environment  string    `json:"environment"`
	AccountKey   string    `json:"account_key,omitempty"`
	AccountID    string    `json:"account_id"`
	ExpiresAt    time.Time `json:"expires_at"`
}

type brokerConnection struct {
	AccountID   string
	Broker      sql.NullString
	Environment sql.NullString
	ExternalID  sql.NullString
	ConnectedAt sql.NullTime
}

type pendingSaxoOAuth struct {
	UserID      string `json:"user_id"`
	AccountID   string `json:"account_id"`
	Environment string `json:"environment"`
}

func Authorize(db *sql.DB, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		switch brokerName(c) {
		case "saxo":
			authorizeSaxo(c, db, rdb)
		case "ig":
			authorizeIG(c, db, rdb)
		default:
			c.JSON(http.StatusNotFound, gin.H{"error": "Unsupported broker"})
		}
	}
}

func Callback(db *sql.DB, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		callbackSaxo(c, db, rdb)
	}
}

func Status(db *sql.DB, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		broker := brokerName(c)
		if !supportedBroker(broker) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Unsupported broker"})
			return
		}

		conn, err := loadBrokerConnection(c, db, c.GetString("userID"))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load broker connection"})
			return
		}

		writeBrokerStatus(c, rdb, conn, broker)
	}
}

func Disconnect(db *sql.DB, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		broker := brokerName(c)
		if !supportedBroker(broker) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Unsupported broker"})
			return
		}

		userID := c.GetString("userID")
		conn, err := loadBrokerConnection(c, db, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load broker connection"})
			return
		}

		if !conn.Broker.Valid || conn.Broker.String != broker {
			c.Status(http.StatusNoContent)
			return
		}

		if err := rdb.Del(c, brokerSessionKey(broker, conn.AccountID)).Err(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Could not disconnect broker"})
			return
		}

		if err := clearBrokerConnection(c, db, conn.AccountID, userID, broker); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not disconnect broker"})
			return
		}

		c.Status(http.StatusNoContent)
	}
}

func brokerName(c *gin.Context) string {
	return strings.ToLower(strings.TrimSpace(c.Param("broker")))
}

func supportedBroker(broker string) bool {
	return broker == "saxo" || broker == "ig"
}

func brokerReconnectMessage(broker string) string {
	if broker == "saxo" {
		return "Saxo reconnection required"
	}

	return "IG reconnection required"
}

func brokerSessionKey(broker, accountID string) string {
	return fmt.Sprintf("broker:%s:%s", broker, accountID)
}

func saveSession(ctx context.Context, rdb *redis.Client, key string, session brokerSession) error {
	payload, err := json.Marshal(session)
	if err != nil {
		return err
	}

	encKey := sha256.Sum256([]byte(utils.Cfg.EncryptionKey))
	block, err := aes.NewCipher(encKey[:])
	if err != nil {
		return err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return err
	}

	sealed := base64.RawURLEncoding.EncodeToString(gcm.Seal(nonce, nonce, payload, nil))
	ttl := time.Until(session.ExpiresAt)
	if ttl <= 0 {
		return errors.New("session already expired")
	}

	return rdb.SetEx(ctx, key, sealed, ttl).Err()
}

func loadSession(ctx context.Context, rdb *redis.Client, key string) (brokerSession, error) {
	value, err := rdb.Get(ctx, key).Result()
	if err != nil {
		return brokerSession{}, err
	}

	payload, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return brokerSession{}, errors.New("invalid session encoding")
	}

	encKey := sha256.Sum256([]byte(utils.Cfg.EncryptionKey))
	block, err := aes.NewCipher(encKey[:])
	if err != nil {
		return brokerSession{}, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return brokerSession{}, err
	}

	if len(payload) < gcm.NonceSize() {
		return brokerSession{}, errors.New("invalid session")
	}

	plain, err := gcm.Open(nil, payload[:gcm.NonceSize()], payload[gcm.NonceSize():], nil)
	if err != nil {
		return brokerSession{}, errors.New("invalid session")
	}

	var session brokerSession
	if err := json.Unmarshal(plain, &session); err != nil {
		return brokerSession{}, err
	}

	return session, nil
}

func loadBrokerConnection(ctx context.Context, db *sql.DB, userID string) (brokerConnection, error) {
	var conn brokerConnection

	err := db.QueryRowContext(ctx, `
		SELECT id::text, broker, broker_environment, broker_account_id, broker_connected_at
		FROM user_accounts
		WHERE user_id = $1
	`, userID).Scan(&conn.AccountID, &conn.Broker, &conn.Environment, &conn.ExternalID, &conn.ConnectedAt)

	return conn, err
}

func saveBrokerConnection(ctx context.Context, db *sql.DB, accountID, userID, broker, environment, externalID string) error {
	result, err := db.ExecContext(ctx, `
		UPDATE user_accounts
		SET broker = $3, broker_environment = $4, broker_account_id = $5, broker_connected_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, accountID, userID, broker, environment, externalID)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rows != 1 {
		return errors.New("account not found")
	}

	return nil
}

func clearBrokerConnection(ctx context.Context, db *sql.DB, accountID, userID, broker string) error {
	_, err := db.ExecContext(ctx, `
		UPDATE user_accounts
		SET broker = NULL, broker_environment = NULL, broker_account_id = NULL, broker_connected_at = NULL
		WHERE id = $1 AND user_id = $2 AND broker = $3
	`, accountID, userID, broker)

	return err
}

func writeBrokerStatus(c *gin.Context, rdb *redis.Client, conn brokerConnection, broker string) {
	status := "disconnected"

	if conn.Broker.Valid && conn.Broker.String == broker {
		key := brokerSessionKey(broker, conn.AccountID)
		session, err := loadSession(c, rdb, key)

		switch {
		case errors.Is(err, redis.Nil):
			status = "reconnect_required"
		case err != nil:
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Could not verify broker connection"})
			return
		case session.ExpiresAt.After(time.Now()):
			status = "connected"
		default:
			_ = rdb.Del(c, key).Err()
			status = "reconnect_required"
		}
	}

	response := gin.H{
		"status":       status,
		"environment":  nil,
		"account_id":   nil,
		"connected_at": nil,
	}

	if conn.Broker.Valid && conn.Broker.String == broker {
		if conn.Environment.Valid {
			response["environment"] = conn.Environment.String
		}
		if conn.ExternalID.Valid {
			response["account_id"] = conn.ExternalID.String
		}
		if conn.ConnectedAt.Valid {
			response["connected_at"] = conn.ConnectedAt.Time
		}
	}

	c.JSON(http.StatusOK, response)
}

func authorizeSaxo(c *gin.Context, db *sql.DB, rdb *redis.Client) {
	environment := strings.ToLower(c.DefaultQuery("environment", "demo"))
	if environment != "demo" && environment != "live" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "environment must be demo or live"})
		return
	}

	if utils.Cfg.SaxoAppKey == "" || utils.Cfg.SaxoAppSecret == "" || utils.Cfg.SaxoRedirectURI == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Saxo OAuth is not configured"})
		return
	}

	userID := c.GetString("userID")
	conn, err := loadBrokerConnection(c, db, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load trading account"})
		return
	}

	stateBytes := make([]byte, 32)
	if _, err := rand.Read(stateBytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not start Saxo connection"})
		return
	}

	state := base64.RawURLEncoding.EncodeToString(stateBytes)
	pending, err := json.Marshal(pendingSaxoOAuth{
		UserID:      userID,
		AccountID:   conn.AccountID,
		Environment: environment,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not start Saxo connection"})
		return
	}

	if err := rdb.SetEx(c, "broker:oauth:saxo:"+state, pending, 10*time.Minute).Err(); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Could not start Saxo connection"})
		return
	}

	query := url.Values{
		"response_type": {"code"},
		"client_id":     {utils.Cfg.SaxoAppKey},
		"redirect_uri":  {utils.Cfg.SaxoRedirectURI},
		"state":         {state},
	}

	c.JSON(http.StatusOK, gin.H{
		"authorization_url": saxoAuthURLs[environment] + "/authorize?" + query.Encode(),
	})
}

func callbackSaxo(c *gin.Context, db *sql.DB, rdb *redis.Client) {
	redirect := func(status string) {
		c.Redirect(
			http.StatusFound,
			strings.TrimRight(utils.Cfg.DevServer, "/")+
				"/profile?tab=connections&broker=saxo&status="+status,
		)
	}

	code := strings.TrimSpace(c.Query("code"))
	state := strings.TrimSpace(c.Query("state"))

	if code == "" || state == "" || c.Query("error") != "" {
		redirect("error")
		return
	}

	raw, err := rdb.GetDel(c, "broker:oauth:saxo:"+state).Result()
	if err != nil {
		redirect("error")
		return
	}

	var pending pendingSaxoOAuth
	if err := json.Unmarshal([]byte(raw), &pending); err != nil ||
		pending.UserID == "" ||
		pending.AccountID == "" ||
		(pending.Environment != "demo" && pending.Environment != "live") {
		redirect("error")
		return
	}

	form := url.Values{
		"grant_type":   {"authorization_code"},
		"code":         {code},
		"redirect_uri": {utils.Cfg.SaxoRedirectURI},
	}

	tokenReq, err := http.NewRequestWithContext(
		c,
		http.MethodPost,
		saxoAuthURLs[pending.Environment]+"/token",
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		redirect("error")
		return
	}

	tokenReq.SetBasicAuth(utils.Cfg.SaxoAppKey, utils.Cfg.SaxoAppSecret)
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	tokenResp, err := brokerHTTPClient.Do(tokenReq)
	if err != nil {
		log.Printf("broker_oauth broker=saxo action=exchange outcome=failed user_id=%s", pending.UserID)
		redirect("error")
		return
	}
	defer tokenResp.Body.Close()

	var token struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}

	if tokenResp.StatusCode < 200 ||
		tokenResp.StatusCode >= 300 ||
		json.NewDecoder(tokenResp.Body).Decode(&token) != nil ||
		token.AccessToken == "" ||
		token.ExpiresIn <= 0 {
		redirect("error")
		return
	}

	idReq, err := http.NewRequestWithContext(
		c,
		http.MethodGet,
		saxoAPIURLs[pending.Environment]+"/port/v1/clients/me",
		nil,
	)
	if err != nil {
		redirect("error")
		return
	}

	idReq.Header.Set("Authorization", "Bearer "+token.AccessToken)

	idResp, err := brokerHTTPClient.Do(idReq)
	if err != nil {
		log.Printf("broker_oauth broker=saxo action=identity outcome=failed user_id=%s", pending.UserID)
		redirect("error")
		return
	}
	defer idResp.Body.Close()

	var identity struct {
		DefaultAccountID  string `json:"DefaultAccountId"`
		DefaultAccountKey string `json:"DefaultAccountKey"`
	}

	if idResp.StatusCode < 200 ||
		idResp.StatusCode >= 300 ||
		json.NewDecoder(idResp.Body).Decode(&identity) != nil ||
		identity.DefaultAccountID == "" ||
		identity.DefaultAccountKey == "" {
		redirect("error")
		return
	}

	session := brokerSession{
		Broker:      "saxo",
		AccessToken: token.AccessToken,
		Environment: pending.Environment,
		AccountKey:  identity.DefaultAccountKey,
		AccountID:   identity.DefaultAccountID,
		ExpiresAt:   time.Now().UTC().Add(time.Duration(token.ExpiresIn) * time.Second),
	}

	key := brokerSessionKey("saxo", pending.AccountID)
	if err := saveSession(c, rdb, key, session); err != nil {
		redirect("error")
		return
	}

	if err := saveBrokerConnection(
		c,
		db,
		pending.AccountID,
		pending.UserID,
		"saxo",
		pending.Environment,
		identity.DefaultAccountID,
	); err != nil {
		_ = rdb.Del(c, key).Err()
		redirect("error")
		return
	}

	log.Printf("broker_oauth broker=saxo action=connect outcome=connected user_id=%s", pending.UserID)
	redirect("connected")
}

func authorizeIG(c *gin.Context, db *sql.DB, rdb *redis.Client) {
	environment := strings.ToLower(c.DefaultQuery("environment", "demo"))
	if environment != "demo" && environment != "live" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "environment must be demo or live"})
		return
	}

	var body struct {
		Identifier string `json:"identifier"`
		Password   string `json:"password"`
		APIKey     string `json:"api_key"`
	}

	if err := c.ShouldBindJSON(&body); err != nil ||
		body.Identifier == "" ||
		body.Password == "" ||
		body.APIKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "identifier, password, and api_key are required",
		})
		return
	}

	userID := c.GetString("userID")
	conn, err := loadBrokerConnection(c, db, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load trading account"})
		return
	}

	session, externalID, err := igLogin(c, environment, body.Identifier, body.Password, body.APIKey)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	key := brokerSessionKey("ig", conn.AccountID)
	if err := saveSession(c, rdb, key, session); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save IG session"})
		return
	}

	if err := saveBrokerConnection(
		c,
		db,
		conn.AccountID,
		userID,
		"ig",
		environment,
		externalID,
	); err != nil {
		_ = rdb.Del(c, key).Err()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save IG connection"})
		return
	}

	log.Printf("broker_connect broker=ig outcome=connected user_id=%s", userID)
	c.JSON(http.StatusOK, gin.H{"status": "connected"})
}

func igLogin(ctx context.Context, environment, identifier, password, apiKey string) (brokerSession, string, error) {
	reqBody, err := json.Marshal(map[string]any{
		"identifier":        identifier,
		"password":          password,
		"encryptedPassword": false,
	})
	if err != nil {
		return brokerSession{}, "", err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		igAPIURLs[environment]+"/session",
		bytes.NewReader(reqBody),
	)
	if err != nil {
		return brokerSession{}, "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-IG-API-KEY", apiKey)
	req.Header.Set("Version", "3")

	resp, err := brokerHTTPClient.Do(req)
	if err != nil {
		return brokerSession{}, "", errors.New("IG login service is unavailable")
	}
	defer resp.Body.Close()

	var result struct {
		OAuthToken struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
			ExpiresIn    string `json:"expires_in"`
		} `json:"oauthToken"`

		CurrentAccountID string `json:"currentAccountId"`
	}

	if resp.StatusCode < 200 ||
		resp.StatusCode >= 300 ||
		json.NewDecoder(resp.Body).Decode(&result) != nil ||
		result.OAuthToken.AccessToken == "" ||
		result.CurrentAccountID == "" {
		return brokerSession{}, "", errors.New("IG login failed")
	}

	var expiresIn int
	fmt.Sscanf(result.OAuthToken.ExpiresIn, "%d", &expiresIn)
	if expiresIn <= 0 {
		expiresIn = 60
	}

	session := brokerSession{
		Broker:       "ig",
		AccessToken:  result.OAuthToken.AccessToken,
		RefreshToken: result.OAuthToken.RefreshToken,
		APIKey:       apiKey,
		Environment:  environment,
		AccountID:    result.CurrentAccountID,
		ExpiresAt:    time.Now().UTC().Add(time.Duration(expiresIn) * time.Second),
	}

	return session, result.CurrentAccountID, nil
}

func igRefresh(ctx context.Context, session brokerSession) (brokerSession, error) {
	if session.RefreshToken == "" {
		return brokerSession{}, errors.New("no refresh token")
	}

	reqBody, err := json.Marshal(map[string]string{
		"refresh_token": session.RefreshToken,
	})
	if err != nil {
		return brokerSession{}, err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		igAPIURLs[session.Environment]+"/session/refresh-token",
		bytes.NewReader(reqBody),
	)
	if err != nil {
		return brokerSession{}, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Version", "1")

	resp, err := brokerHTTPClient.Do(req)
	if err != nil {
		return brokerSession{}, errors.New("IG refresh service is unavailable")
	}
	defer resp.Body.Close()

	var result struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    string `json:"expires_in"`
	}

	if resp.StatusCode < 200 ||
		resp.StatusCode >= 300 ||
		json.NewDecoder(resp.Body).Decode(&result) != nil ||
		result.AccessToken == "" {
		return brokerSession{}, errors.New("IG token refresh failed")
	}

	var expiresIn int
	fmt.Sscanf(result.ExpiresIn, "%d", &expiresIn)
	if expiresIn <= 0 {
		expiresIn = 60
	}

	session.AccessToken = result.AccessToken
	session.RefreshToken = result.RefreshToken
	session.ExpiresAt = time.Now().UTC().Add(time.Duration(expiresIn) * time.Second)

	return session, nil
}
