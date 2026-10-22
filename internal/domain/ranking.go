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

// Input is the complete snapshot used for one ranking calculation.
type Input struct {
	Dimensions []Dimension
	Models     []Model
	Scores     []Score
}

// Row is one model's computed result.
type Row struct {
	Model
	Score           *float64
	Coverage        float64
	Provisional     bool
	Rank            int
	DimensionScores map[int64]float64
}

// Result is the ordered ranking.
type Result struct {
	Rows        []Row
	TotalWeight int
}

// ProvisionalThreshold is the coverage below which a ranking is provisional.
const ProvisionalThreshold = 0.8

// Compute ranks models with the single global set of dimension weights.
// Dimensions with weight 0 keep their stored values in DimensionScores but stay
// out of the composite score, coverage and ordering. Hidden models are scored
// the same way, sorted after every visible model and never receive a rank.
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

	scoresByModel := make(map[int64]map[int64]float64, len(in.Models))
	for _, sc := range in.Scores {
		if !known[sc.DimensionID] || math.IsNaN(sc.Value) || math.IsInf(sc.Value, 0) || sc.Value < 0 {
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
			if !scored {
				continue
			}
			row.DimensionScores[dimension.ID] = value
			weight, weighted := weights[dimension.ID]
			if !weighted || weight == 0 {
				continue
			}
			scoredWeight += weight
			// Normalize before multiplying so finite extreme values cannot overflow.
			weightedSum += (float64(weight) / float64(totalWeight)) * value
		}
		if totalWeight > 0 && scoredWeight > 0 {
			score := weightedSum / (float64(scoredWeight) / float64(totalWeight))
			row.Score = &score
			row.Coverage = float64(scoredWeight) / float64(totalWeight)
			row.Provisional = row.Coverage < ProvisionalThreshold
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

	return Result{Rows: rows, TotalWeight: totalWeight}
}

func sortRows(rows []Row) {
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		if (a.Score == nil) != (b.Score == nil) {
			return a.Score != nil
		}
		if a.Score != nil {
			if *a.Score != *b.Score {
				return *a.Score > *b.Score
			}
			if a.Coverage != b.Coverage {
				return a.Coverage > b.Coverage
			}
		}
		an, bn := strings.ToLower(a.Name), strings.ToLower(b.Name)
		if an != bn {
			return an < bn
		}
		return a.Slug < b.Slug
	})
}
