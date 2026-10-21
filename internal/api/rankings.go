package api

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"llmrank/internal/domain"
	"llmrank/internal/store"
)

type rankingSnapshot struct {
	result     domain.Result
	dimensions []store.Dimension
	updatedAt  *time.Time
}

func (s *Server) loadRanking(ctx context.Context) (rankingSnapshot, error) {
	dims, err := s.store.ListDimensions(ctx, false)
	if err != nil {
		return rankingSnapshot{}, err
	}
	models, err := s.store.ListModels(ctx)
	if err != nil {
		return rankingSnapshot{}, err
	}
	scores, err := s.store.AllScores(ctx)
	if err != nil {
		return rankingSnapshot{}, err
	}
	domainDims := make([]domain.Dimension, 0, len(dims))
	for _, d := range dims {
		domainDims = append(domainDims, domain.Dimension{ID: d.ID, Name: d.Name, Weight: d.Weight})
	}
	domainModels := make([]domain.Model, 0, len(models))
	for _, m := range models {
		domainModels = append(domainModels, domain.Model{ID: m.ID, Slug: m.Slug, Name: m.Name, Vendor: m.Vendor})
	}
	domainScores := make([]domain.Score, 0, len(scores))
	for _, sc := range scores {
		domainScores = append(domainScores, domain.Score{ModelID: sc.ModelID, DimensionID: sc.DimensionID, Value: sc.Value})
	}
	result := domain.Compute(domain.Input{Dimensions: domainDims, Models: domainModels, Scores: domainScores})
	updatedAt, err := s.store.MaxUpdatedAt(ctx)
	if err != nil {
		return rankingSnapshot{}, err
	}
	return rankingSnapshot{result: result, dimensions: dims, updatedAt: updatedAt}, nil
}

type rankingsResponse struct {
	TotalWeight int                `json:"totalWeight"`
	UpdatedAt   *string            `json:"updatedAt"`
	Dimensions  []rankingDimension `json:"dimensions"`
	Models      []rankingModel     `json:"models"`
}

type rankingDimension struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Weight int    `json:"weight"`
}

type rankingModel struct {
	Slug        string             `json:"slug"`
	Name        string             `json:"name"`
	Vendor      string             `json:"vendor"`
	Score       *float64           `json:"score"`
	Coverage    float64            `json:"coverage"`
	Provisional bool               `json:"provisional"`
	Rank        *int               `json:"rank"`
	Scores      map[string]float64 `json:"scores"`
}

func (s *Server) handleRankings(w http.ResponseWriter, r *http.Request) {
	snapshot, err := s.loadRanking(r.Context())
	if err != nil {
		s.internalError(w, err)
		return
	}

	dimensions := make([]rankingDimension, 0, len(snapshot.dimensions))
	for _, d := range snapshot.dimensions {
		if d.Weight > 0 {
			dimensions = append(dimensions, rankingDimension{ID: d.ID, Name: d.Name, Weight: d.Weight})
		}
	}

	models := make([]rankingModel, 0, len(snapshot.result.Rows))
	for _, row := range snapshot.result.Rows {
		var rank *int
		if row.Rank > 0 {
			value := row.Rank
			rank = &value
		}
		scores := make(map[string]float64, len(row.DimensionScores))
		for id, value := range row.DimensionScores {
			scores[strconv.FormatInt(id, 10)] = value
		}
		models = append(models, rankingModel{
			Slug:        row.Slug,
			Name:        row.Name,
			Vendor:      row.Vendor,
			Score:       row.Score,
			Coverage:    row.Coverage,
			Provisional: row.Provisional,
			Rank:        rank,
			Scores:      scores,
		})
	}

	var updatedAt *string
	if snapshot.updatedAt != nil {
		value := snapshot.updatedAt.UTC().Format(time.RFC3339)
		updatedAt = &value
	}

	writeJSON(w, http.StatusOK, rankingsResponse{
		TotalWeight: snapshot.result.TotalWeight,
		UpdatedAt:   updatedAt,
		Dimensions:  dimensions,
		Models:      models,
	})
}
