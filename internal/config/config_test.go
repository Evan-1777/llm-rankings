package config

import (
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func validEnv() map[string]string {
	hash, _ := bcrypt.GenerateFromPassword([]byte("secret-password"), bcrypt.MinCost)
	return map[string]string{
		"ADMIN_PASSWORD_HASH": string(hash),
		"SESSION_SECRET":      strings.Repeat("s", 32),
	}
}

func getFrom(env map[string]string) func(string) string {
	return func(key string) string { return env[key] }
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := load(getFrom(validEnv()))
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if cfg.Port != "8080" || cfg.DBPath != "./llm-rank.db" {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if cfg.CookieSecure || cfg.TrustProxy {
		t.Fatalf("expected security flags to default false: %+v", cfg)
	}
}

func TestLoadRequiredAndInvalid(t *testing.T) {
	tests := []struct {
		name string
		env  func() map[string]string
		want string
	}{
		{"missing hash", func() map[string]string { e := validEnv(); delete(e, "ADMIN_PASSWORD_HASH"); return e }, "ADMIN_PASSWORD_HASH"},
		{"invalid hash", func() map[string]string { e := validEnv(); e["ADMIN_PASSWORD_HASH"] = "nope"; return e }, "bcrypt"},
		{"short secret", func() map[string]string { e := validEnv(); e["SESSION_SECRET"] = "short"; return e }, "32 bytes"},
		{"bad port", func() map[string]string { e := validEnv(); e["PORT"] = "nope"; return e }, "PORT"},
		{"bad bool", func() map[string]string { e := validEnv(); e["TRUST_PROXY"] = "maybe"; return e }, "TRUST_PROXY"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := load(getFrom(tc.env()))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("got %v, want error containing %q", err, tc.want)
			}
		})
	}
}

func TestLoadOverrides(t *testing.T) {
	env := validEnv()
	env["PORT"] = "9090"
	env["DB_PATH"] = "/tmp/x.db"
	env["COOKIE_SECURE"] = "true"
	env["TRUST_PROXY"] = "1"
	cfg, err := load(getFrom(env))
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if cfg.Port != "9090" || cfg.DBPath != "/tmp/x.db" || !cfg.CookieSecure || !cfg.TrustProxy {
		t.Fatalf("overrides not applied: %+v", cfg)
	}
}
