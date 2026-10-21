package api

import (
	"math"
	"net/http"
	"strconv"
	"time"

	"llmrank/internal/auth"
)

type loginRequest struct {
	Password string `json:"password"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	ip := auth.ClientIP(r, s.trustProxy)
	if retryAfter, ok := s.limiter.Allow(ip); !ok {
		w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(retryAfter.Seconds()))))
		writeError(w, http.StatusTooManyRequests, "rate_limited", "登录尝试过于频繁，请稍后再试")
		return
	}

	var input loginRequest
	if !s.readJSON(w, r, &input) {
		return
	}
	if input.Password == "" {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "请填写密码", map[string]string{"password": "请填写密码"})
		return
	}
	if !s.auth.CheckPassword(input.Password) {
		s.limiter.Fail(ip)
		s.log.Warn("login failed", "ip", ip)
		writeError(w, http.StatusUnauthorized, "unauthorized", "密码不正确")
		return
	}

	s.limiter.Reset(ip)
	http.SetCookie(w, s.auth.NewCookie())
	writeJSON(w, http.StatusOK, map[string]bool{"authenticated": true})
}

func (s *Server) handleLogout(w http.ResponseWriter, _ *http.Request) {
	http.SetCookie(w, s.auth.ClearCookie())
	writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
}

func (s *Server) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	dims, err := s.store.ListDimensions(r.Context(), false)
	if err != nil {
		s.internalError(w, err)
		return
	}
	counts, err := s.store.Counts(r.Context())
	if err != nil {
		s.internalError(w, err)
		return
	}
	dimensions := make([]dimensionResponse, 0, len(dims))
	totalWeight := 0
	for _, d := range dims {
		dimensions = append(dimensions, toDimensionResponse(d))
		totalWeight += d.Weight
	}
	writeJSON(w, http.StatusOK, bootstrapResponse{
		Authenticated: s.auth.Authenticated(r),
		Dimensions:    dimensions,
		Counts: countsResponse{
			Models:       counts.Models,
			ScoredModels: counts.ScoredModels,
			Dimensions:   counts.Dimensions,
		},
		TotalWeight: totalWeight,
		Now:         s.now().UTC().Format(time.RFC3339),
	})
}
