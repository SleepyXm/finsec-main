package handlers

import (
	"database/sql"
	"fmt"
	"net/http"

	"finsec-backend/structs"
	"finsec-backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func Signup(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req structs.UserCreate
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Check username taken
		var exists string
		err := db.QueryRowContext(c, "SELECT id FROM users WHERE username = $1", req.Username).Scan(&exists)
		if err != sql.ErrNoRows {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Username taken, try another."})
			return
		}

		// Check email taken
		err = db.QueryRowContext(c, "SELECT id FROM users WHERE email = $1", req.Email).Scan(&exists)
		if err != sql.ErrNoRows {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Email already registered"})
			return
		}

		hashed, err := utils.HashPassword(req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not hash password"})
			return
		}

		verificationToken := uuid.NewString()
		userID := uuid.New()

		tx, err := db.BeginTx(c, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not start transaction"})
			return
		}
		defer tx.Rollback()

		_, err = tx.ExecContext(c,
			`INSERT INTO users (id, username, email, password, verification_token, verified, created_at)
             VALUES ($1, $2, $3, $4, $5, false, NOW())`,
			userID, req.Username, req.Email, hashed, verificationToken,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create user"})
			return
		}

		_, err = tx.ExecContext(c,
			`INSERT INTO user_accounts (id, user_id, account_type, balance, currency, status)
             VALUES ($1, $2, DEFAULT, DEFAULT, DEFAULT, DEFAULT)`,
			uuid.New(), userID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create account"})
			return
		}

		if err = tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not commit transaction"})
			return
		}

		if err = utils.SendVerificationEmail(req.Email, verificationToken); err != nil {
			// Non-fatal — user is created, email just didn't send
			c.JSON(http.StatusCreated, gin.H{"message": "User created but verification email failed to send"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"message": "User created successfully"})
	}
}

func Login(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req structs.UserLogin
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var userID, passwordHash string
		err := db.QueryRowContext(c,
			"SELECT id, password FROM users WHERE email = $1", req.Email,
		).Scan(&userID, &passwordHash)

		// Timing-safe — always run bcrypt even if user not found
		if err == sql.ErrNoRows {
			utils.VerifyPassword(req.Password, utils.DummyPasswordHash)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Email or Password Incorrect"})
			return
		}
		if !utils.VerifyPassword(req.Password, passwordHash) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Email or Password Incorrect"})
			return
		}

		accessToken, err := utils.CreateAccessToken(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not generate token"})
			return
		}
		refreshToken, err := utils.CreateRefreshToken(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not generate token"})
			return
		}

		if err = utils.StoreRefreshToken(c, userID, refreshToken); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not store session"})
			return
		}

		// Fetch username for response
		var username, email string
		db.QueryRowContext(c, "SELECT username, email FROM users WHERE id = $1", userID).Scan(&username, &email)

		utils.SetAuthCookies(c, accessToken, refreshToken)
		c.JSON(http.StatusOK, gin.H{
			"message":  "Login successful",
			"email":    email,
			"username": username,
		})
	}
}

func Refresh() gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie("refresh_token")
		fmt.Println("raw cookie value:", token)
		if err != nil || token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing refresh token"})
			return
		}

		userID, err := utils.DecodeRefreshToken(token)
		fmt.Println("decoded userID:", userID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		val, err := utils.GetStoredRefreshToken(c, token)
		fmt.Println("redis lookup result:", val, "error:", err)

		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}
		// Rotate — revoke old, issue new
		if err := utils.RevokeRefreshToken(c, token); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not revoke token"})
			return
		}

		newAccess, err := utils.CreateAccessToken(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not generate token"})
			return
		}
		newRefresh, err := utils.CreateRefreshToken(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not generate token"})
			return
		}

		utils.StoreRefreshToken(c, userID, newRefresh)
		utils.SetAuthCookies(c, newAccess, newRefresh)
		c.JSON(http.StatusOK, gin.H{"message": "Token refreshed"})
	}
}

func VerifyEmail(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Query("token")
		if token == "" {
			c.Redirect(http.StatusFound, utils.Cfg.DevServer+"/login?error=invalid_token")
			return
		}

		result, err := db.ExecContext(c,
			`UPDATE users SET verified = true, verification_token = NULL
             WHERE verification_token = $1`, token,
		)
		if err != nil {
			c.Redirect(http.StatusFound, utils.Cfg.DevServer+"/login?error=invalid_token")
			return
		}
		rows, _ := result.RowsAffected()
		if rows == 0 {
			c.Redirect(http.StatusFound, utils.Cfg.DevServer+"/login?error=invalid_token")
			return
		}

		c.Redirect(http.StatusFound, utils.Cfg.DevServer+"/login?verified=true")
	}
}

func Me(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)

		var username, email string
		err := db.QueryRowContext(c,
			"SELECT username, email FROM users WHERE id = $1", userID,
		).Scan(&username, &email)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		var accountType, currency, status string
		var balance string
		err = db.QueryRowContext(c,
			`SELECT account_type, balance, currency, status
             FROM user_accounts WHERE user_id = $1`, userID,
		).Scan(&accountType, &balance, &currency, &status)

		resp := gin.H{
			"user": gin.H{"username": username, "email": email},
		}
		if err == nil {
			resp["account"] = gin.H{
				"account_type": accountType,
				"balance":      balance,
				"currency":     currency,
				"status":       status,
			}
		}
		c.JSON(http.StatusOK, resp)
	}
}

func Logout() gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie("refresh_token")
		if err == nil && token != "" {
			utils.RevokeRefreshToken(c, token)
		}
		utils.ClearAuthCookies(c)
		c.JSON(http.StatusOK, gin.H{"message": "Logged out"})
	}
}

func Hi() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "Auth router is working!"})
	}
}
