// Package api exposes the HTTP surface and serves the embedded frontend.
package api

import (
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"time"

	"llmrank/internal/auth"
	"llmrank/internal/store"
)

// Server wires storage, authentication and HTTP handlers.
type Server struct {
	store      *store.Store
	auth       *auth.Manager
	limiter    *auth.LoginLimiter
	log        *slog.Logger
	static     http.Handler
	trustProxy bool
	now        func() time.Time
}

// New builds the complete HTTP handler, including static assets and SPA fallback.
func New(st *store.Store, mgr *auth.Manager, logger *slog.Logger, dist fs.FS, trustProxy bool) http.Handler {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	s := &Server{
		store:      st,
		auth:       mgr,
		limiter:    auth.NewLoginLimiter(),
		log:        logger,
		static:     newStaticHandler(dist),
		trustProxy: trustProxy,
		now:        time.Now,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/bootstrap", s.handleBootstrap)
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)

	mux.HandleFunc("GET /api/rankings", s.handleRankings)

	mux.HandleFunc("GET /api/dimensions", s.handleListDimensions)
	mux.HandleFunc("POST /api/dimensions", s.admin(s.handleCreateDimension))
	mux.HandleFunc("PATCH /api/dimensions/{id}", s.admin(s.handleUpdateDimension))
	mux.HandleFunc("POST /api/dimensions/{id}/archive", s.admin(s.handleArchiveDimension))
	mux.HandleFunc("POST /api/dimensions/{id}/restore", s.admin(s.handleRestoreDimension))
	mux.HandleFunc("DELETE /api/dimensions/{id}", s.admin(s.handleDeleteDimension))

	mux.HandleFunc("GET /api/models", s.handleListModels)
	mux.HandleFunc("POST /api/models", s.admin(s.handleCreateModel))
	mux.HandleFunc("GET /api/models/{slug}", s.handleGetModel)
	mux.HandleFunc("PATCH /api/models/{slug}", s.admin(s.handleUpdateModel))
	mux.HandleFunc("DELETE /api/models/{slug}", s.admin(s.handleDeleteModel))
	mux.HandleFunc("PUT /api/models/{slug}/scores/{dimensionId}", s.admin(s.handlePutScore))
	mux.HandleFunc("DELETE /api/models/{slug}/scores/{dimensionId}", s.admin(s.handleDeleteScore))

	mux.HandleFunc("GET /api/export", s.admin(s.handleExport))
	mux.HandleFunc("/api/", s.handleAPINotFound)
	mux.HandleFunc("/api", s.handleAPINotFound)
	mux.Handle("/", s.static)

	return chain(mux, s.recoverer, s.securityHeaders, s.logRequests, s.originGuard)
}

func chain(h http.Handler, middleware ...func(http.Handler) http.Handler) http.Handler {
	for i := len(middleware) - 1; i >= 0; i-- {
		h = middleware[i](h)
	}
	return h
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleAPINotFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusNotFound, "not_found", "接口不存在")
}
