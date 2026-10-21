package api

import (
	"errors"
	"net/http"
	"time"
	"unicode/utf8"

	"llmrank/internal/store"
)

type scoreInput struct {
	Value *float64 `json:"value"`
	Note  string   `json:"note"`
}

type scoreResponse struct {
	ModelSlug   string  `json:"modelSlug"`
	DimensionID int64   `json:"dimensionId"`
	Value       float64 `json:"value"`
	Note        string  `json:"note"`
	UpdatedAt   string  `json:"updatedAt"`
}

func (s *Server) handlePutScore(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	dimensionID, ok := parseID(w, r, "dimensionId")
	if !ok {
		return
	}
	var input scoreInput
	if !s.readJSON(w, r, &input) {
		return
	}
	if input.Value == nil {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "请填写评分", map[string]string{"value": "请填写评分"})
		return
	}
	if utf8.RuneCountInString(input.Note) > 500 {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "请检查评分", map[string]string{"note": "备注不能超过 500 个字符"})
		return
	}
	score, err := s.store.UpsertScore(r.Context(), slug, dimensionID, *input.Value, input.Note)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "模型或维度不存在")
			return
		}
		s.writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, scoreResponse{
		ModelSlug:   slug,
		DimensionID: score.DimensionID,
		Value:       score.Value,
		Note:        score.Note,
		UpdatedAt:   score.UpdatedAt.UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleDeleteScore(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	dimensionID, ok := parseID(w, r, "dimensionId")
	if !ok {
		return
	}
	if err := s.store.DeleteScore(r.Context(), slug, dimensionID); err != nil {
		s.writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
