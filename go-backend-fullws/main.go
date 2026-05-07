package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"

	"finsec-backend/routes"
	"finsec-backend/utils"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	"github.com/joho/godotenv"
)

var rdb *redis.Client
var db *sql.DB

func initRedis() {
	rdb = redis.NewClient(&redis.Options{
		Addr:     os.Getenv("REDIS_ADDR"), // e.g. localhost:6379
		PoolSize: 200,                     // tune upward as VU count grows
	})
	log.Println("Redis client initialised")
}

func initDB() {
	var err error
	db, err = sql.Open("pgx", os.Getenv("DATABASE"))
	if err != nil {
		log.Fatal("Failed to open DB:", err)
	}
	if err = db.Ping(); err != nil {
		log.Fatal("DB not reachable:", err)
	}
	log.Println("DB connected")
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found", err)
	}

	utils.Load()
	utils.InitRedis()
	utils.InitResend()
	initDB()

	allowedOrigins := []string{}
	if dev := os.Getenv("DEV_SERVER"); dev != "" {
		allowedOrigins = append(allowedOrigins, dev)
	}
	if prod := os.Getenv("FRONTEND_PROD"); prod != "" {
		allowedOrigins = append(allowedOrigins, prod)
	}
	if len(allowedOrigins) == 0 {
		allowedOrigins = []string{"http://localhost:3000"}
	}

	// --------------------------------------------------------
	// Gin handles all non-WS routes, exactly as before.
	// --------------------------------------------------------
	router := gin.Default()

	if err := router.SetTrustedProxies(nil); err != nil {
		log.Fatal(err)
	}

	router.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "Upgrade", "Connection"},
		AllowCredentials: true,
		AllowWildcard:    true,
	}))

	api := router.Group("/api")
	routes.RegisterAuthRoutes(api.Group("/auth"), db)
	routes.RegisterTradeRoutes(api.Group("/"), db, utils.RDB)
	routes.RegisterBacktestRoutes(api.Group("/"), db)

	// --------------------------------------------------------
	// ServeMux sits in front of Gin as the real server handler.
	//
	// WHY: gobwas/ws needs to call Hijack() on the raw net.Conn.
	// When the upgrade target is gin.ResponseWriter (a buffered
	// wrapper), that Hijack() has to fight through Gin's internal
	// mutex under every concurrent upgrade — that's what caused
	// ws_connecting to blow out from ~15ms to ~2s at 1000 VUs.
	//
	// ServeMux matches the WS paths first (most-specific wins),
	// so those requests never reach Gin at all. Everything else
	// falls through to router (Gin) via the "/" catch-all.
	// --------------------------------------------------------
	mux := http.NewServeMux()

	// WS routes bypass Gin — mounted directly on the raw mux.
	routes.RegisterStockRoutes(mux, utils.RDB)

	// Gin is the catch-all for every non-WS request.
	mux.Handle("/", router)

	// --------------------------------------------------------
	// Start the server with the mux as handler, not router.Run.
	//
	// CHANGE FROM ORIGINAL: router.Run(":9000") started Gin
	// directly as the http.Server handler, so the mux you had
	// constructed just above was never actually used.
	// --------------------------------------------------------
	log.Println("Server listening on :9000")
	if err := http.ListenAndServe(":9000", mux); err != nil {
		log.Fatal(err)
	}
}
