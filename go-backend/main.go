package main

import (
	"context"
	"database/sql"
	"log"
	"os"
	"os/signal"
	"syscall"

	"finsec-backend/routes"
	"finsec-backend/services"

	//"finsec-backend/hub"
	//"finsec-backend/config"
	"finsec-backend/utils"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	//"github.com/jackc/pgx/v5/stdlib"
	"finsec-backend/handlers/stocks"

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
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found", err)
	}

	utils.Load()
	utils.InitRedis()
	utils.InitResend()
	initDB()

	go stocks.PrewarmFromRedis(utils.RDB, os.Getenv("PYTHON_URL"))

	// Pool init — single instance, lives for the lifetime of the process
	pool := services.NewWorkerPool().WithRedis(utils.RDB)
	pool.StartFlusher(ctx, db)

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
	routes.RegisterStockRoutes(api.Group("/"), utils.RDB)
	routes.RegisterTradeRoutes(api.Group("/"), db, utils.RDB, pool)
	routes.RegisterBacktestRoutes(api.Group("/"), db)
	routes.RegisterProfileRoutes(api.Group("/"), db)
	routes.RegisterAccounteRoutes(api.Group("/account"), db)

	router.Run(":9000")
}
