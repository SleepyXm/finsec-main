package stocks

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestStockDataHandlerRejectsNoDataBeforeCreatingPool(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var query url.Values
	python := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query = r.URL.Query()
		http.Error(w, "no data", http.StatusNotFound)
	}))
	defer python.Close()

	t.Cleanup(func() {
		pools = sync.Map{}
	})
	t.Setenv("PYTHON_URL", python.URL)
	pools = sync.Map{}

	router := gin.New()
	router.GET("/charts/:ticker", StockDataHandler(nil))

	request := httptest.NewRequest(http.MethodGet, "/charts/BOMBOCLAT?provider=finsec&interval=1m", nil)
	request.Header.Set("Connection", "Upgrade")
	request.Header.Set("Upgrade", "websocket")
	request.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	request.Header.Set("Sec-WebSocket-Version", "13")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, expected %d", response.Code, http.StatusNotFound)
	}
	if query.Get("provider") != "finsec" || query.Get("ticker") != "BOMBOCLAT" || query.Get("interval") != "1m" {
		t.Fatalf("unexpected provider request: %v", query)
	}

	poolCount := 0
	pools.Range(func(_, _ any) bool {
		poolCount++
		return true
	})
	if poolCount != 0 {
		t.Fatalf("created %d pools for a no-data ticker", poolCount)
	}
}
