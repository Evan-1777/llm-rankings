// Package auth implements the single-administrator session and login throttling.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	// CookieName is the session cookie name.
	CookieName = "llmrank_session"
	// SessionTTL is the signed cookie lifetime.
	SessionTTL = 24 * time.Hour
)

// Manager validates the administrator password and signs session cookies.
type Manager struct {
	hash   []byte
	secret []byte
	secure bool
	now    func() time.Time
}

// New validates credentials and returns a session manager.
func New(passwordHash, secret string, secure bool) (*Manager, error) {
	if _, err := bcrypt.Cost([]byte(passwordHash)); err != nil {
		return nil, fmt.Errorf("invalid ADMIN_PASSWORD_HASH: %w", err)
	}
	if len(secret) < 32 {
		return nil, fmt.Errorf("SESSION_SECRET must be at least 32 bytes")
	}
	return &Manager{
		hash:   []byte(passwordHash),
		secret: []byte(secret),
		secure: secure,
		now:    time.Now,
	}, nil
}

// CheckPassword compares a submitted password with the configured bcrypt hash.
func (m *Manager) CheckPassword(password string) bool {
	return bcrypt.CompareHashAndPassword(m.hash, []byte(password)) == nil
}

// NewCookie creates a fresh signed session cookie.
func (m *Manager) NewCookie() *http.Cookie {
	expires := m.now().Add(SessionTTL)
	payload := "v1|" + strconv.FormatInt(expires.Unix(), 10)
	value := base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + m.sign(payload)
	return &http.Cookie{
		Name:     CookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  expires,
		MaxAge:   int(SessionTTL.Seconds()),
	}
}

// ClearCookie returns the cookie that removes the session.
func (m *Manager) ClearCookie() *http.Cookie {
	return &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(1, 0),
	}
}

// Authenticated reports whether the request carries a valid, unexpired session.
func (m *Manager) Authenticated(r *http.Request) bool {
	cookie, err := r.Cookie(CookieName)
	if err != nil || cookie.Value == "" {
		return false
	}
	parts := strings.Split(cookie.Value, ".")
	if len(parts) != 2 {
		return false
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}
	if !hmac.Equal(signature, m.signBytes(payloadBytes)) {
		return false
	}
	fields := strings.Split(string(payloadBytes), "|")
	if len(fields) != 2 || fields[0] != "v1" {
		return false
	}
	expires, err := strconv.ParseInt(fields[1], 10, 64)
	if err != nil {
		return false
	}
	return m.now().Before(time.Unix(expires, 0))
}

func (m *Manager) sign(payload string) string {
	return base64.RawURLEncoding.EncodeToString(m.signBytes([]byte(payload)))
}

func (m *Manager) signBytes(payload []byte) []byte {
	mac := hmac.New(sha256.New, m.secret)
	mac.Write(payload)
	return mac.Sum(nil)
}

// ClientIP resolves the caller address, honoring proxy headers only when configured.
func ClientIP(r *http.Request, trustProxy bool) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if trustProxy {
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			first := strings.TrimSpace(strings.Split(forwarded, ",")[0])
			if net.ParseIP(first) != nil {
				return first
			}
		}
		if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); net.ParseIP(realIP) != nil {
			return realIP
		}
	}
	return host
}

// LoginLimiter throttles failed password attempts per client IP.
type LoginLimiter struct {
	mu        sync.Mutex
	entries   map[string]*loginBucket
	window    time.Duration
	max       int
	now       func() time.Time
	lastSweep time.Time
}

type loginBucket struct {
	failures int
	resetAt  time.Time
}

// NewLoginLimiter returns a limiter with the production window and threshold.
func NewLoginLimiter() *LoginLimiter {
	return &LoginLimiter{
		entries: make(map[string]*loginBucket),
		window:  15 * time.Minute,
		max:     5,
		now:     time.Now,
	}
}

// Allow reports whether a login attempt may proceed and how long to wait otherwise.
func (l *LoginLimiter) Allow(ip string) (time.Duration, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	bucket, ok := l.entries[ip]
	if !ok {
		return 0, true
	}
	if !now.Before(bucket.resetAt) {
		delete(l.entries, ip)
		return 0, true
	}
	if bucket.failures >= l.max {
		return bucket.resetAt.Sub(now), false
	}
	return 0, true
}

// Fail records one failed login.
func (l *LoginLimiter) Fail(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	bucket, ok := l.entries[ip]
	if !ok || !now.Before(bucket.resetAt) {
		bucket = &loginBucket{resetAt: now.Add(l.window)}
		l.entries[ip] = bucket
	}
	bucket.failures++
	if len(l.entries) > 1024 && now.Sub(l.lastSweep) > l.window {
		for key, candidate := range l.entries {
			if !now.Before(candidate.resetAt) {
				delete(l.entries, key)
			}
		}
		l.lastSweep = now
	}
}

// Reset clears failures after a successful login.
func (l *LoginLimiter) Reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, ip)
}
