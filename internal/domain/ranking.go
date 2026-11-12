// Package domain contains pure scoring and ranking rules.
package domain

import (
	"math"
	"sort"
	"strings"
)

// Dimension is an enabled scoring axis with its global weight.
type Dimension struct {
	ID     int64
	Name   string
	Weight int
	// BaselineMax converts scores into percentages. Nil derives the baseline
	// from the highest valid score inside the ranking snapshot.
	BaselineMax *float64
}

// Model is the minimal model identity needed for ranking.
type Model struct {
	ID     int64
	Slug   string
	Name   string
	Vendor string
	Hidden bool
}

// Score is a stored rating.
type Score struct {
	ModelID     int64
	DimensionID int64
	Value       float64
}

// Skip marks a dimension a model does not use. The composite score imputes the
// dimension's 60th-percentile value instead of a stored rating.
type Skip struct {
	ModelID     int64
	DimensionID int64
}

// Input is the complete snapshot used for one ranking calculation.
type Input struct {
	Dimensions []Dimension
	Models     []Model
	Scores     []Score
	Skips      []Skip
}

// Row is one model's computed result. DimensionScores keeps every stored
// rating, including on skipped dimensions, so the editor can restore a value
// after a skip is cleared; ScoredCount only counts the dimensions that carry
// weight and are actually rated.
type Row struct {
	Model
	Score           *float64
	Rank            int
	ScoredCount     int
	DimensionScores map[int64]float64
}

// Result is the ordered ranking.
type Result struct {
	Rows        []Row
	TotalWeight int
	// EffectiveBaselines maps every dimension with a usable baseline to the
	// value used for conversion. Dimensions without a fixed baseline and
	// without any valid score are absent.
	EffectiveBaselines map[int64]float64
	// SkipMedians maps every numeric dimension to the converted value a skipped
	// dimension contributes to a composite score; 0 when it has no candidate.
	SkipMedians map[int64]float64
}

// Compute ranks models with the single global set of dimension weights.
// Dimensions with weight 0 keep their stored values in DimensionScores but stay
// out of the composite score and ordering. Skipped dimensions keep their weight
// in the composite denominator and contribute the imputed median. Hidden models
// are scored the same way, sorted after every visible model and never receive a
// rank.
func Compute(in Input) Result {
	weights := make(map[int64]int, len(in.Dimensions))
	known := make(map[int64]bool, len(in.Dimensions))
	totalWeight := 0
	for _, d := range in.Dimensions {
		known[d.ID] = true
		if d.Weight > 0 {
			weights[d.ID] = d.Weight
			totalWeight += d.Weight
		}
	}

	baselines := EffectiveBaselines(in.Dimensions, in.Models, in.Scores)
	skips := skipIndex(in.Skips)
	medians := skipMedians(in.Dimensions, in.Models, in.Scores, skips, baselines)

	scoresByModel := make(map[int64]map[int64]float64, len(in.Models))
	for _, sc := range in.Scores {
		if !known[sc.DimensionID] || !validScore(sc.Value) {
			continue
		}
		if scoresByModel[sc.ModelID] == nil {
			scoresByModel[sc.ModelID] = make(map[int64]float64)
		}
		scoresByModel[sc.ModelID][sc.DimensionID] = sc.Value
	}

	// Accumulate in stable id order so the display order never changes the
	// floating-point result.
	ordered := make([]Dimension, len(in.Dimensions))
	copy(ordered, in.Dimensions)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].ID < ordered[j].ID })

	visible := make([]Row, 0, len(in.Models))
	hidden := make([]Row, 0, len(in.Models))
	for _, m := range in.Models {
		row := Row{Model: m, DimensionScores: map[int64]float64{}}
		scoredWeight := 0
		weightedSum := 0.0
		for _, dimension := range ordered {
			value, scored := scoresByModel[m.ID][dimension.ID]
			skipped := skips[m.ID][dimension.ID]
			if !scored && !skipped {
				continue
			}
			if scored {
				row.DimensionScores[dimension.ID] = value
			}
			weight, weighted := weights[dimension.ID]
			if !weighted {
				continue
			}
			scoredWeight += weight
			if scored && !skipped {
				row.ScoredCount++
			}
			// Convert to the percentage scale first; a skipped dimension takes
			// the imputed median, a missing or zero baseline contributes 0,
			// mirroring the frontend formula.
			converted := 0.0
			switch {
			case skipped:
				converted = medians[dimension.ID]
			case baselines[dimension.ID] > 0:
				converted = value / baselines[dimension.ID] * 100
			}
			// Normalize before multiplying so finite extreme values cannot overflow.
			weightedSum += (float64(weight) / float64(totalWeight)) * converted
		}
		if totalWeight > 0 && scoredWeight > 0 {
			score := weightedSum / (float64(scoredWeight) / float64(totalWeight))
			row.Score = &score
		}
		if m.Hidden {
			hidden = append(hidden, row)
		} else {
			visible = append(visible, row)
		}
	}

	sortRows(visible)
	sortRows(hidden)
	rows := append(visible, hidden...)

	rank := 0
	for i := range rows {
		if rows[i].Hidden || rows[i].Score == nil {
			continue
		}
		rank++
		rows[i].Rank = rank
	}

	return Result{Rows: rows, TotalWeight: totalWeight, EffectiveBaselines: baselines, SkipMedians: medians}
}

// skipMedians resolves the value a skipped dimension contributes to a composite
// score: the 60th percentile (index floor(n*0.6)) of the converted ratings from
// every snapshot model that did not skip the dimension. A dimension without
// candidates imputes 0 and keeps its weight.
func skipMedians(dimensions []Dimension, models []Model, scores []Score, skips map[int64]map[int64]bool, baselines map[int64]float64) map[int64]float64 {
	inSnapshot := make(map[int64]bool, len(models))
	for _, m := range models {
		inSnapshot[m.ID] = true
	}
	ratings := make(map[int64][]float64, len(dimensions))
	for _, sc := range scores {
		if !inSnapshot[sc.ModelID] || skips[sc.ModelID][sc.DimensionID] || !validScore(sc.Value) {
			continue
		}
		ratings[sc.DimensionID] = append(ratings[sc.DimensionID], sc.Value)
	}

	out := make(map[int64]float64, len(dimensions))
	for _, d := range dimensions {
		converted := make([]float64, 0, len(ratings[d.ID]))
		baseline := baselines[d.ID]
		for _, value := range ratings[d.ID] {
			if baseline > 0 {
				converted = append(converted, value/baseline*100)
			} else {
				converted = append(converted, 0)
			}
		}
		if len(converted) == 0 {
			out[d.ID] = 0
			continue
		}
		sort.Float64s(converted)
		out[d.ID] = converted[len(converted)*6/10]
	}
	return out
}

// skipIndex groups skips by model for the composite loop.
func skipIndex(skips []Skip) map[int64]map[int64]bool {
	out := make(map[int64]map[int64]bool, len(skips))
	for _, skip := range skips {
		if out[skip.ModelID] == nil {
			out[skip.ModelID] = make(map[int64]bool)
		}
		out[skip.ModelID][skip.DimensionID] = true
	}
	return out
}

// EffectiveBaselines resolves the baseline of every dimension: the configured
// value wins; otherwise the highest valid score inside the snapshot is used.
// Hidden models participate, scores from models outside the snapshot (archived
// ones in practice) are ignored, and the result never contains a dimension
// without a usable baseline.
func EffectiveBaselines(dimensions []Dimension, models []Model, scores []Score) map[int64]float64 {
	known := make(map[int64]bool, len(dimensions))
	for _, d := range dimensions {
		known[d.ID] = true
	}
	inSnapshot := make(map[int64]bool, len(models))
	for _, m := range models {
		inSnapshot[m.ID] = true
	}
	highest := make(map[int64]float64, len(dimensions))
	scored := make(map[int64]bool, len(dimensions))
	for _, sc := range scores {
		if !known[sc.DimensionID] || !inSnapshot[sc.ModelID] || !validScore(sc.Value) {
			continue
		}
		if !scored[sc.DimensionID] || sc.Value > highest[sc.DimensionID] {
			highest[sc.DimensionID] = sc.Value
		}
		scored[sc.DimensionID] = true
	}

	out := make(map[int64]float64, len(dimensions))
	for _, d := range dimensions {
		if d.BaselineMax != nil && validBaseline(*d.BaselineMax) {
			out[d.ID] = *d.BaselineMax
			continue
		}
		if scored[d.ID] {
			out[d.ID] = highest[d.ID]
		}
	}
	return out
}

func validScore(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= 0
}

func validBaseline(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value > 0
}

func sortRows(rows []Row) {
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		if (a.Score == nil) != (b.Score == nil) {
			return a.Score != nil
		}
		if a.Score != nil && *a.Score != *b.Score {
			return *a.Score > *b.Score
		}
		an, bn := strings.ToLower(a.Name), strings.ToLower(b.Name)
		if an != bn {
			return an < bn
		}
		return a.Slug < b.Slug
	})
}
