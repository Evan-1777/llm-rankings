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
	skips      []store.Skip
	updatedAt  *time.Time
}

// loadRanking computes the full board in memory for each request. That is fine
// for a personal deployment; add caching or incremental updates if the number
// of scores grows past the low thousands.
func (s *Server) loadRanking(ctx context.Context) (rankingSnapshot, error) {
	dims, err := s.store.ListDimensions(ctx, false)
	if err != nil {
		return rankingSnapshot{}, err
	}
	models, err := s.store.ListModels(ctx, false)
	if err != nil {
		return rankingSnapshot{}, err
	}
	scores, err := s.store.AllScores(ctx)
	if err != nil {
		return rankingSnapshot{}, err
	}
	skips, err := s.store.AllSkips(ctx)
	if err != nil {
		return rankingSnapshot{}, err
	}
	result := domain.Compute(domain.Input{
		Dimensions: toDomainDimensions(dims),
		Models:     toDomainModels(models),
		Scores:     toDomainScores(scores),
		Skips:      toDomainSkips(skips),
	})
	updatedAt, err := s.store.MaxUpdatedAt(ctx)
	if err != nil {
		return rankingSnapshot{}, err
	}
	return rankingSnapshot{result: result, dimensions: dims, skips: skips, updatedAt: updatedAt}, nil
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
	// GroupName bundles dimensions into one board column; empty means no group.
	GroupName string `json:"groupName"`
	// BaselineMax is the configured fixed baseline; null means automatic.
	BaselineMax *float64 `json:"baselineMax"`
	// EffectiveBaselineMax is the baseline used for this snapshot.
	EffectiveBaselineMax *float64 `json:"effectiveBaselineMax"`
	// SkipMedian is the converted value a skip contributes to the composite.
	SkipMedian *float64 `json:"skipMedian"`
}

type rankingModel struct {
	Slug   string   `json:"slug"`
	Name   string   `json:"name"`
	Vendor string   `json:"vendor"`
	Hidden bool     `json:"hidden"`
	Score  *float64 `json:"score"`
	Rank   *int     `json:"rank"`
	// ScoredCount is the rated, weighted, non-skipped dimension count.
	ScoredCount int                `json:"scoredCount"`
	Scores      map[string]float64 `json:"scores"`
	// Skips lists the dimensions this model does not use.
	Skips []int64 `json:"skips"`
}

func (s *Server) handleRankings(w http.ResponseWriter, r *http.Request) {
	snapshot, err := s.loadRanking(r.Context())
	if err != nil {
		s.internalError(w, err)
		return
	}

	includeHidden := r.URL.Query().Get("includeHidden") == "1"
	if includeHidden && !s.auth.Authenticated(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "请先登录")
		return
	}

	// Text dimensions never hold numeric scores, so they stay out of this table.
	dimensions := make([]rankingDimension, 0, len(snapshot.dimensions))
	for _, d := range snapshot.dimensions {
		if d.TextMode {
			continue
		}
		item := rankingDimension{ID: d.ID, Name: d.Name, Weight: d.Weight, GroupName: d.GroupName, BaselineMax: d.BaselineMax}
		if baseline, ok := snapshot.result.EffectiveBaselines[d.ID]; ok {
			value := baseline
			item.EffectiveBaselineMax = &value
		}
		if median, ok := snapshot.result.SkipMedians[d.ID]; ok {
			value := median
			item.SkipMedian = &value
		}
		dimensions = append(dimensions, item)
	}

	skipsByModel := make(map[int64][]int64, len(snapshot.skips))
	for _, skip := range snapshot.skips {
		skipsByModel[skip.ModelID] = append(skipsByModel[skip.ModelID], skip.DimensionID)
	}

	models := make([]rankingModel, 0, len(snapshot.result.Rows))
	for _, row := range snapshot.result.Rows {
		if row.Hidden && !includeHidden {
			continue
		}
		var rank *int
		if row.Rank > 0 {
			value := row.Rank
			rank = &value
		}
		scores := make(map[string]float64, len(row.DimensionScores))
		for id, value := range row.DimensionScores {
			scores[strconv.FormatInt(id, 10)] = value
		}
		skips := skipsByModel[row.ID]
		if skips == nil {
			skips = []int64{}
		}
		models = append(models, rankingModel{
			Slug:        row.Slug,
			Name:        row.Name,
			Vendor:      row.Vendor,
			Hidden:      row.Hidden,
			Score:       row.Score,
			Rank:        rank,
			ScoredCount: row.ScoredCount,
			Scores:      scores,
			Skips:       skips,
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

func toDomainDimensions(dims []store.Dimension) []domain.Dimension {
	out := make([]domain.Dimension, 0, len(dims))
	for _, d := range dims {
		out = append(out, domain.Dimension{ID: d.ID, Name: d.Name, Weight: d.Weight, BaselineMax: d.BaselineMax})
	}
	return out
}

func toDomainModels(models []store.ModelSummary) []domain.Model {
	out := make([]domain.Model, 0, len(models))
	for _, m := range models {
		out = append(out, domain.Model{ID: m.ID, Slug: m.Slug, Name: m.Name, Vendor: m.Vendor, Hidden: m.Hidden})
	}
	return out
}

func toDomainScores(scores []store.Score) []domain.Score {
	out := make([]domain.Score, 0, len(scores))
	for _, sc := range scores {
		out = append(out, domain.Score{ModelID: sc.ModelID, DimensionID: sc.DimensionID, Value: sc.Value})
	}
	return out
}

func toDomainSkips(skips []store.Skip) []domain.Skip {
	out := make([]domain.Skip, 0, len(skips))
	for _, skip := range skips {
		out = append(out, domain.Skip{ModelID: skip.ModelID, DimensionID: skip.DimensionID})
	}
	return out
}

// effectiveBaselinesFor resolves the baselines exposed by the dimension list
// and the export. Archived models are not part of the ranking snapshot, so
// their scores never raise an automatic baseline.
func effectiveBaselinesFor(dims []store.Dimension, models []store.ModelSummary, scores []store.Score) map[int64]float64 {
	active := make([]store.ModelSummary, 0, len(models))
	for _, m := range models {
		if m.ArchivedAt == nil {
			active = append(active, m)
		}
	}
	return domain.EffectiveBaselines(toDomainDimensions(dims), toDomainModels(active), toDomainScores(scores))
}
