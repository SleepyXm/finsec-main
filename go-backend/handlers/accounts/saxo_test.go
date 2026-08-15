package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"finsec-backend/utils"
)

func TestSaxoAuthorizationExchangesCodeAndLoadsAccountIdentity(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/token":
			username, password, ok := request.BasicAuth()
			if !ok || username != "app-key" || password != "app-secret" {
				t.Fatal("Saxo application credentials were not sent")
			}
			if err := request.ParseForm(); err != nil || request.Form.Get("code") != "authorization-code" {
				t.Fatalf("unexpected Saxo token form: %v", err)
			}
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"access_token": "access-token", "refresh_token": "must-not-be-retained", "expires_in": 1200,
			})
		case "/port/v1/clients/me":
			if request.Header.Get("Authorization") != "Bearer access-token" {
				t.Fatal("Saxo access token was not used to identify the account")
			}
			_ = json.NewEncoder(writer).Encode(map[string]string{
				"ClientId": "client-id", "Name": "Saxo User",
				"DefaultAccountId": "account-id", "DefaultAccountKey": "account-key",
			})
		default:
			t.Fatalf("unexpected Saxo request: %s", request.URL.Path)
		}
	}))
	defer server.Close()

	previousConfig, previousClient := utils.Cfg, saxoClient
	previousAuthURLs, previousAPIURLs := saxoAuthURLs, saxoAPIURLs
	utils.Cfg.SaxoAppKey = "app-key"
	utils.Cfg.SaxoAppSecret = "app-secret"
	utils.Cfg.SaxoRedirectURI = "https://finsec.test/callback"
	saxoClient = server.Client()
	saxoAuthURLs = map[string]string{"demo": server.URL, "live": server.URL}
	saxoAPIURLs = map[string]string{"demo": server.URL, "live": server.URL}
	defer func() {
		utils.Cfg, saxoClient = previousConfig, previousClient
		saxoAuthURLs, saxoAPIURLs = previousAuthURLs, previousAPIURLs
	}()

	token, err := exchangeSaxoCode(context.Background(), "demo", "authorization-code")
	if err != nil {
		t.Fatal(err)
	}
	identity, err := loadSaxoIdentity(context.Background(), "demo", token.AccessToken)
	if err != nil {
		t.Fatal(err)
	}
	if identity.DefaultAccountID != "account-id" || identity.DefaultAccountKey != "account-key" {
		t.Fatalf("unexpected Saxo identity: %+v", identity)
	}
	encoded, _ := json.Marshal(token)
	if strings.Contains(string(encoded), "refresh") {
		t.Fatal("Saxo refresh token was retained")
	}
}

func TestSaxoSessionIsEncryptedAndRejectsTampering(t *testing.T) {
	previous := utils.Cfg
	utils.Cfg.EncryptionKey = "test-encryption-key"
	defer func() { utils.Cfg = previous }()

	session := saxoSession{
		AccessToken: "access-token", Environment: "demo", AccountKey: "account-key",
		ExpiresAt: time.Now().UTC().Add(20 * time.Minute),
	}
	encoded, err := encryptSaxoSession(session)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(encoded, session.AccessToken) {
		t.Fatal("Saxo access token was stored in plaintext")
	}
	decoded, err := decryptSaxoSession(encoded)
	if err != nil || decoded.AccessToken != session.AccessToken || decoded.AccountKey != session.AccountKey {
		t.Fatalf("unexpected decrypted Saxo session: %+v error=%v", decoded, err)
	}
	if _, err = decryptSaxoSession(encoded + "x"); err == nil {
		t.Fatal("tampered Saxo session was accepted")
	}
}

func TestSaxoOAuthStateIsBoundToFinsecUser(t *testing.T) {
	value, _ := json.Marshal(pendingSaxoOAuth{
		UserID: "user-one", AccountID: "account-one", Environment: "demo",
	})
	if _, err := validateSaxoOAuth(string(value), "user-two"); err == nil {
		t.Fatal("Saxo OAuth state was accepted for a different Finsec user")
	}
	pending, err := validateSaxoOAuth(string(value), "user-one")
	if err != nil || pending.AccountID != "account-one" {
		t.Fatalf("valid Saxo OAuth state was rejected: %+v error=%v", pending, err)
	}
}

func TestSaxoChartRequestUsesOnlyShortLivedAccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/api/internal/saxo/chart" || request.Header.Get("X-Internal-Secret") != "internal-secret" {
			t.Fatalf("unexpected Python request: %s", request.URL.Path)
		}
		var payload map[string]any
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload["access_token"] != "access-token" || payload["account_key"] != "account-key" {
			t.Fatalf("missing Saxo access material: %+v", payload)
		}
		if _, present := payload["refresh_token"]; present {
			t.Fatal("refresh token crossed the Python boundary")
		}
		_, _ = writer.Write([]byte(`{"Data":[]}`))
	}))
	defer server.Close()

	previousConfig, previousClient := utils.Cfg, pythonBrokerClient
	utils.Cfg.PythonUrl = server.URL
	utils.Cfg.InternalSecret = "internal-secret"
	pythonBrokerClient = server.Client()
	defer func() { utils.Cfg, pythonBrokerClient = previousConfig, previousClient }()

	body, status, err := requestSaxoChart(context.Background(), saxoSession{
		AccessToken: "access-token", Environment: "demo", AccountKey: "account-key",
	}, 21, "FxSpot", "5m")
	if err != nil || status != http.StatusOK || string(body) != `{"Data":[]}` {
		t.Fatalf("unexpected Python response: status=%d body=%s error=%v", status, body, err)
	}
}
