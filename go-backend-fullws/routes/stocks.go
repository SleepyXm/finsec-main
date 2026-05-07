package routes

import (
	"finsec-backend/handlers/stocks"
	"net/http"

	"github.com/redis/go-redis/v9"
)

// RegisterWSRoutes mounts WebSocket routes directly on mux.
//
// mux must be the root http.ServeMux that is set as the
// http.Server.Handler — NOT a gin.Engine. Gin is registered as a
// fallback on "/" after these routes so it still handles every
// non-WS request. Patterns registered on ServeMux are matched
// before the "/" catch-all, so these routes always win.
func RegisterStockRoutes(mux *http.ServeMux, rdb *redis.Client) {
	// Mount each WS endpoint with its full path.
	// Adjust the prefix to match whatever you pass to gin.Group.
	mux.HandleFunc("/api/ws/stockdata", stocks.StockDataHandlerRaw(rdb))
	//mux.HandleFunc("/api/ws/price", stocks.LivePriceHandler(rdb))
}
