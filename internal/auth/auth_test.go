package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func newManager(t *testing.T) *Manager {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte("correct horse"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	m, err := New(string(hash), strings.Repeat("k", 32), false)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func TestPasswordAndCookie(t *testing.T) {
	m := newManager(t)
	if !m.CheckPassword("correct horse") || m.CheckPassword("wrong") {
		t.Fatal("password validation failed")
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if m.Authenticated(req) {
		t.Fatal("request without cookie must be anonymous")
	}
	req.AddCookie(m.NewCookie())
	if !m.Authenticated(req) {
		t.Fatal("fresh cookie must authenticate")
	}

	tampered := *m.NewCookie()
	tampered.Value = tampered.Value + "x"
	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	req2.AddCookie(&tampered)
	if m.Authenticated(req2) {
		t.Fatal("tampered cookie must be rejected")
	}
}

func TestCookieExpiry(t *testing.T) {
	m := newManager(t)
	cookie := m.NewCookie()
	base := m.now()
	m.now = func() time.Time { return base.Add(SessionTTL + time.Minute) }
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(cookie)
	if m.Authenticated(req) {
		t.Fatal("expired cookie must be rejected")
	}
}

func TestNewRejectsWeakSecrets(t *testing.T) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("x"), bcrypt.MinCost)
	if _, err := New(string(hash), "short", false); err == nil {
		t.Fatal("short secret accepted")
	}
	if _, err := New("not-bcrypt", strings.Repeat("k", 32), false); err == nil {
		t.Fatal("invalid hash accepted")
	}
}

func TestClientIP(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.9:1234"
	req.Header.Set("X-Forwarded-For", "198.51.100.7, 10.0.0.1")
	if got := ClientIP(req, false); got != "203.0.113.9" {
		t.Fatalf("direct IP = %q", got)
	}
	if got := ClientIP(req, true); got != "198.51.100.7" {
		t.Fatalf("forwarded IP = %q", got)
	}
}

func TestLoginLimiter(t *testing.T) {
	l := NewLoginLimiter()
	now := time.Unix(1000, 0)
	l.now = func() time.Time { return now }
	for i := 0; i < 5; i++ {
		if _, ok := l.Allow("ip"); !ok {
			t.Fatalf("attempt %d unexpectedly blocked", i+1)
		}
		l.Fail("ip")
	}
	if _, ok := l.Allow("ip"); ok {
		t.Fatal("sixth attempt must be blocked")
	}
	now = now.Add(l.window + time.Second)
	if _, ok := l.Allow("ip"); !ok {
		t.Fatal("window must reset")
	}
	l.Fail("ip")
	l.Reset("ip")
	now = now.Add(l.window + time.Second)
	l.Fail("ip")
	if _, ok := l.Allow("ip"); !ok {
		t.Fatal("successful reset must clear failures")
	}
}
