package api

import (
	"net/http"
	"unicode/utf8"
)

type textInput struct {
	Text *string `json:"text"`
}

type textResponse struct {
	ModelSlug   string `json:"modelSlug"`
	DimensionID int64  `json:"dimensionId"`
	Text        string `json:"text"`
}

func (s *Server) handlePutModelText(w http.ResponseWriter, r *http.Request) {
	dimensionID, ok := parseID(w, r, "dimensionId")
	if !ok {
		return
	}
	var input textInput
	if !s.readJSON(w, r, &input) {
		return
	}
	if input.Text == nil {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "请填写文字", map[string]string{"text": "请填写文字"})
		return
	}
	if utf8.RuneCountInString(*input.Text) > 2000 {
		writeFields(w, http.StatusUnprocessableEntity, "validation", "请检查文字", map[string]string{"text": "文字不能超过 2000 个字符"})
		return
	}
	slug := r.PathValue("slug")
	if err := s.store.SetDimensionText(r.Context(), slug, dimensionID, *input.Text); err != nil {
		s.writeStoreError(w, err)
		return
	}
	if *input.Text == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, http.StatusOK, textResponse{ModelSlug: slug, DimensionID: dimensionID, Text: *input.Text})
}
