package main

import (
	"database/sql"
	"log"
	"os"

	"finsec-backend/routes"
	//"finsec-backend/hub"
	//"finsec-backend/config"
	"finsec-backend/utils"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	//"github.com/jackc/pgx/v5/stdlib"
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

	//jwtSecret := []byte(os.Getenv("SECRET_KEY"))

	//wsHub := hub.NewHub(rdb) // hub gets the Redis client, not the router
	//go wsHub.Run()           // starts the fan-out goroutine

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
	routes.RegisterTradeRoutes(api.Group("/"), db, utils.RDB)
	routes.RegisterBacktestRoutes(api.Group("/"), db)

	//ws := router.Group("/ws")
	//routes.RegisterWSRoutes(ws, wsHub, jwtSecret)

	//assets := router.Group("/assets")
	//routes.RegisterAssetRoutes(assets, db, rdb, jwtSecret)

	//orders := router.Group("/orders")
	//routes.RegisterOrderRoutes(orders, db, rdb, jwtSecret)

	router.Run(":9000")
}
