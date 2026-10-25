package api

import (
	"encoding/json"
	"net/http"
	"time"
)

type exportResponse struct {
	Version    int                 `json:"version"`
	ExportedAt string              `json:"exportedAt"`
	Dimensions []dimensionResponse `json:"dimensions"`
	Models     []exportModel       `json:"models"`
	Scores     []exportScore       `json:"scores"`
	Texts      []exportText        `json:"texts"`
}

type exportModel struct {
	Slug             string  `json:"slug"`
	Name             string  `json:"name"`
	Vendor           string  `json:"vendor"`
	Notes            string  `json:"notes"`
	Hidden           bool    `json:"hidden"`
	ArchivedAt       *string `json:"archivedAt"`
	Commentary       string  `json:"commentary"`
	CommentaryPublic bool    `json:"commentaryPublic"`
	CommentaryAt     string  `json:"commentaryAt"`
	CreatedAt        string  `json:"createdAt"`
	UpdatedAt        string  `json:"updatedAt"`
}

type exportScore struct {
	ModelSlug   string  `json:"modelSlug"`
	DimensionID int64   `json:"dimensionId"`
	Value       float64 `json:"value"`
	Note        string  `json:"note"`
	UpdatedAt   string  `json:"updatedAt"`
}

type exportText struct {
	ModelSlug   string `json:"modelSlug"`
	DimensionID int64  `json:"dimensionId"`
	Content     string `json:"content"`
	UpdatedAt   string `json:"updatedAt"`
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	dims, err := s.store.ListDimensions(ctx, true)
	if err != nil {
		s.internalError(w, err)
		return
	}
	models, err := s.store.ListModels(ctx, true)
	if err != nil {
		s.internalError(w, err)
		return
	}
	scores, err := s.store.AllScores(ctx)
	if err != nil {
		s.internalError(w, err)
		return
	}
	texts, err := s.store.AllTexts(ctx)
	if err != nil {
		s.internalError(w, err)
		return
	}

	slugByID := make(map[int64]string, len(models))
	dimensions := toDimensionResponses(dims, effectiveBaselinesFor(dims, models, scores))
	exportModels := make([]exportModel, 0, len(models))
	for _, m := range models {
		slugByID[m.ID] = m.Slug
		exportModels = append(exportModels, exportModel{
			Slug:             m.Slug,
			Name:             m.Name,
			Vendor:           m.Vendor,
			Notes:            m.Notes,
			Hidden:           m.Hidden,
			ArchivedAt:       stampString(m.ArchivedAt),
			Commentary:       m.Commentary,
			CommentaryPublic: m.CommentaryPublic,
			CommentaryAt:     m.CommentaryAt,
			CreatedAt:        m.CreatedAt.UTC().Format(time.RFC3339),
			UpdatedAt:        m.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}
	exportScores := make([]exportScore, 0, len(scores))
	for _, sc := range scores {
		exportScores = append(exportScores, exportScore{
			ModelSlug:   slugByID[sc.ModelID],
			DimensionID: sc.DimensionID,
			Value:       sc.Value,
			Note:        sc.Note,
			UpdatedAt:   sc.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}

	exportTexts := make([]exportText, 0, len(texts))
	for _, text := range texts {
		exportTexts = append(exportTexts, exportText{
			ModelSlug:   slugByID[text.ModelID],
			DimensionID: text.DimensionID,
			Content:     text.Content,
			UpdatedAt:   text.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}

	now := s.now().UTC()
	payload, err := json.MarshalIndent(exportResponse{
		Version:    1,
		ExportedAt: now.Format(time.RFC3339),
		Dimensions: dimensions,
		Models:     exportModels,
		Scores:     exportScores,
		Texts:      exportTexts,
	}, "", "  ")
	if err != nil {
		s.internalError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=llm-rank-"+now.Format("2006-01-02")+".json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}
