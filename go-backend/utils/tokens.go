package utils

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

// --- JWT ---

func CreateAccessToken(userID string) (string, error) {
	claims := Claims{
		Sub: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(
				time.Duration(Cfg.AccessTokenExpireMinutes) * time.Minute,
			)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).
		SignedString([]byte(Cfg.SecretKey))
}

func CreateRefreshToken(userID string) (string, error) {
	claims := Claims{
		Sub:  userID,
		Type: "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(
				time.Duration(Cfg.RefreshTokenExpireDays) * 24 * time.Hour,
			)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).
		SignedString([]byte(Cfg.SecretKey))
}

func VerifyToken(tokenStr string) (string, error) {
	tokenStr = strings.TrimPrefix(tokenStr, "Bearer+")
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(Cfg.SecretKey), nil
	})
	if err != nil || !token.Valid {
		return "", fmt.Errorf("invalid token")
	}
	claims, ok := token.Claims.(*Claims)
	if !ok {
		return "", fmt.Errorf("invalid claims")
	}
	return claims.Sub, nil
}

func DecodeRefreshToken(tokenStr string) (string, error) {
	tokenStr = strings.TrimPrefix(tokenStr, "Bearer+")
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(Cfg.SecretKey), nil
	})
	if err != nil || !token.Valid {
		return "", fmt.Errorf("invalid or expired refresh token")
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || claims.Type != "refresh" {
		return "", fmt.Errorf("invalid token type")
	}
	return claims.Sub, nil
}

// --- Redis refresh token store ---

func StoreRefreshToken(ctx context.Context, userID, token string) error {
	key := fmt.Sprintf("refresh:%s", token)
	ttl := time.Duration(Cfg.RefreshTokenExpireDays) * 24 * time.Hour
	return RDB.SetEx(ctx, key, userID, ttl).Err()
}

func GetStoredRefreshToken(ctx context.Context, token string) (string, error) {
	key := fmt.Sprintf("refresh:%s", token)
	val, err := RDB.Get(ctx, key).Result()
	if err == redis.Nil {
		return "", fmt.Errorf("refresh token invalid or expired")
	}
	return val, err
}

func RevokeRefreshToken(ctx context.Context, token string) error {
	return RDB.Del(ctx, fmt.Sprintf("refresh:%s", token)).Err()
}

// --- Cookies ---

func SetAuthCookies(c *gin.Context, accessToken, refreshToken string) {
	c.SetCookie(
		"access_token",
		"Bearer "+accessToken,
		60*Cfg.AccessTokenExpireMinutes,
		"/",
		"",
		true,
		true,
	)
	c.SetCookie(
		"refresh_token",
		refreshToken,
		60*60*24*Cfg.RefreshTokenExpireDays,
		"/",
		"",
		true,
		true,
	)
}

func ClearAuthCookies(c *gin.Context) {
	c.SetCookie("access_token", "", -1, "/", "", true, true)
	c.SetCookie("refresh_token", "", -1, "/", "", true, true)
}
