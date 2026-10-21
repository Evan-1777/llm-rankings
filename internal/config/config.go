// Package config loads and validates process configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// Config is the validated process configuration.
type Config struct {
	Port              string
	DBPath            string
	AdminPasswordHash string
	SessionSecret     string
	CookieSecure      bool
	TrustProxy        bool
}

// Load reads configuration from the process environment.
func Load() (Config, error) {
	return load(os.Getenv)
}

func load(get func(string) string) (Config, error) {
	port := strings.TrimSpace(get("PORT"))
	if port == "" {
		port = "8080"
	}
	if n, err := strconv.Atoi(port); err != nil || n < 1 || n > 65535 {
		return Config{}, fmt.Errorf("PORT must be an integer between 1 and 65535")
	}

	dbPath := strings.TrimSpace(get("DB_PATH"))
	if dbPath == "" {
		dbPath = "./llm-rank.db"
	}

	hash := strings.TrimSpace(get("ADMIN_PASSWORD_HASH"))
	if hash == "" {
		return Config{}, fmt.Errorf("ADMIN_PASSWORD_HASH is required")
	}
	if _, err := bcrypt.Cost([]byte(hash)); err != nil {
		return Config{}, fmt.Errorf("ADMIN_PASSWORD_HASH is not a valid bcrypt hash")
	}

	secret := get("SESSION_SECRET")
	if len(secret) < 32 {
		return Config{}, fmt.Errorf("SESSION_SECRET must be at least 32 bytes")
	}

	cookieSecure, err := parseBool(get("COOKIE_SECURE"), false)
	if err != nil {
		return Config{}, fmt.Errorf("COOKIE_SECURE: %w", err)
	}
	trustProxy, err := parseBool(get("TRUST_PROXY"), false)
	if err != nil {
		return Config{}, fmt.Errorf("TRUST_PROXY: %w", err)
	}

	return Config{
		Port:              port,
		DBPath:            dbPath,
		AdminPasswordHash: hash,
		SessionSecret:     secret,
		CookieSecure:      cookieSecure,
		TrustProxy:        trustProxy,
	}, nil
}

func parseBool(raw string, fallback bool) (bool, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback, nil
	}
	v, err := strconv.ParseBool(raw)
	if err != nil {
		return false, fmt.Errorf("must be a boolean (true/false)")
	}
	return v, nil
}
