package api

import (
	"errors"
	"net/http"

	"llmrank/internal/store"
)

func (s *Server) handlePutSkip(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	dimensionID, ok := parseID(w, r, "dimensionId")
	if !ok {
		return
	}
	if err := s.store.SetSkip(r.Context(), slug, dimensionID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "模型或维度不存在")
			return
		}
		s.writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleDeleteSkip(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	dimensionID, ok := parseID(w, r, "dimensionId")
	if !ok {
		return
	}
	if err := s.store.DeleteSkip(r.Context(), slug, dimensionID); err != nil {
		s.writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
