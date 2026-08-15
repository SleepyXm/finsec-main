package utils

import "github.com/golang-jwt/jwt/v5"

type Config struct {
	DatabaseURL              string
	SecretKey                string
	Algorithm                string
	AccessTokenExpireMinutes int
	RefreshTokenExpireDays   int
	EncryptionKey            string
	DevServer                string
	DevServerBackend         string
	ResendAPIKey             string
	RedisAddr                string
	PythonUrl                string
	InternalSecret           string
	SaxoAppKey               string
	SaxoAppSecret            string
	SaxoRedirectURI          string
}

type Claims struct {
	Sub  string `json:"sub"`
	Type string `json:"type,omitempty"`
	jwt.RegisteredClaims
}
