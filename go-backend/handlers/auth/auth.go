package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"finsec-backend/structs"
	"finsec-backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

func Signup(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req structs.UserCreate
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid signup request"})
			return
		}
		if err := normalizeSignup(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
			var postgresError *pgconn.PgError
			if errors.As(err, &postgresError) && postgresError.Code == "23505" {
				message := "Account already exists"
				if strings.Contains(postgresError.ConstraintName, "username") {
					message = "Username taken, try another."
				} else if strings.Contains(postgresError.ConstraintName, "email") {
					message = "Email already registered"
				}
				c.JSON(http.StatusConflict, gin.H{"error": message})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create user"})
			}
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
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid login request"})
			return
		}
		if err := normalizeLogin(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var userID, username, email, passwordHash string
		err := db.QueryRowContext(c,
			"SELECT id, username, email, password FROM users WHERE email = $1", req.Email,
		).Scan(&userID, &username, &email, &passwordHash)

		// Timing-safe — always run bcrypt even if user not found
		if err == sql.ErrNoRows {
			utils.VerifyPassword(req.Password, utils.DummyPasswordHash)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Email or Password Incorrect"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not sign in"})
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
		if err != nil || token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing refresh token"})
			return
		}

		userID, err := utils.DecodeRefreshToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		storedUserID, err := utils.GetStoredRefreshToken(c, token)
		if err != nil || storedUserID != userID {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token invalid or expired"})
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

		if err = utils.StoreRefreshToken(c, userID, newRefresh); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not store session"})
			return
		}
		if err = utils.RevokeRefreshToken(c, token); err != nil {
			_ = utils.RevokeRefreshToken(c, newRefresh)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not rotate session"})
			return
		}
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

		var username, email, subscriptionTier string
		err := db.QueryRowContext(c,
			`SELECT username, email, COALESCE(NULLIF(subscription_tier, ''), 'free')
             FROM users WHERE id = $1`, userID,
		).Scan(&username, &email, &subscriptionTier)
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
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load account"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"user": gin.H{
				"username":          username,
				"email":             email,
				"subscription_tier": subscriptionTier,
			},
			"account": gin.H{
				"account_type": accountType,
				"balance":      balance,
				"currency":     currency,
				"status":       status,
			},
		})
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
