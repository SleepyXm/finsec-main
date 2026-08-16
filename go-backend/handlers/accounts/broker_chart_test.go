package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIGLoginRetainsAPIKeyInEncryptedSessionPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/session" || request.Header.Get("X-IG-API-KEY") != "user-api-key" {
			t.Fatalf("unexpected IG login request: %s", request.URL.Path)
		}
		_ = json.NewEncoder(writer).Encode(map[string]any{
			"oauthToken": map[string]string{
				"access_token": "access-token", "refresh_token": "refresh-token", "expires_in": "1200",
			},
			"currentAccountId": "account-id",
		})
	}))
	defer server.Close()

	previousClient, previousURLs := brokerHTTPClient, igAPIURLs
	brokerHTTPClient = server.Client()
	igAPIURLs = map[string]string{"demo": server.URL, "live": server.URL}
	defer func() { brokerHTTPClient, igAPIURLs = previousClient, previousURLs }()

	session, _, err := igLogin(context.Background(), "demo", "identifier", "password", "user-api-key")
	if err != nil {
		t.Fatal(err)
	}
	if session.APIKey != "user-api-key" {
		t.Fatal("IG API key was discarded before the encrypted session could be saved")
	}
}
