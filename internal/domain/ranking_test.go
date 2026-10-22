package domain

import (
	"math"
	"testing"
)

func dims(weights ...int) []Dimension {
	out := make([]Dimension, len(weights))
	for i, w := range weights {
		out[i] = Dimension{ID: int64(i + 1), Name: "d", Weight: w}
	}
	return out
}

func scores(modelID int64, values ...float64) []Score {
	out := make([]Score, len(values))
	for i, v := range values {
		out[i] = Score{ModelID: modelID, DimensionID: int64(i + 1), Value: v}
	}
	return out
}

func TestComputeWeightedAverageAndCoverage(t *testing.T) {
	in := Input{
		Dimensions: dims(25, 25, 25, 25),
		Models:     []Model{{ID: 1, Slug: "a", Name: "Alpha"}, {ID: 2, Slug: "b", Name: "Beta"}},
		Scores:     append(scores(1, 8, 9, 10, 7), scores(2, 8)...),
	}
	result := Compute(in)
	if result.TotalWeight != 100 {
		t.Fatalf("totalWeight = %d", result.TotalWeight)
	}
	full := result.Rows[0]
	if full.Slug != "a" || full.Score == nil || *full.Score != 8.5 || full.Coverage != 1 || full.Provisional {
		t.Fatalf("full row wrong: %+v", full)
	}
	partial := result.Rows[1]
	if partial.Score == nil || *partial.Score != 8 || partial.Coverage != 0.25 || !partial.Provisional {
		t.Fatalf("partial row wrong: %+v", partial)
	}
	if full.Rank != 1 || partial.Rank != 2 {
		t.Fatalf("ranks: %d %d", full.Rank, partial.Rank)
	}
}

func TestComputeCoverageBoundary(t *testing.T) {
	build := func(scored int) Result {
		weights := make([]int, 10)
		for i := range weights {
			weights[i] = 100
		}
		weights[9] = 100
		var all []Score
		for i := 0; i < scored; i++ {
			all = append(all, Score{ModelID: 1, DimensionID: int64(i + 1), Value: 8})
		}
		return Compute(Input{Dimensions: dims(weights...), Models: []Model{{ID: 1, Slug: "a", Name: "A"}}, Scores: all})
	}
	eight := build(8)
	if eight.Rows[0].Coverage != 0.8 || eight.Rows[0].Provisional {
		t.Fatalf("80%% must not be provisional: %+v", eight.Rows[0])
	}
	seven := build(7)
	if seven.Rows[0].Coverage != 0.7 || !seven.Rows[0].Provisional {
		t.Fatalf("70%% must be provisional: %+v", seven.Rows[0])
	}
}

func TestComputeZeroWeights(t *testing.T) {
	result := Compute(Input{
		Dimensions: dims(0, 0),
		Models:     []Model{{ID: 1, Slug: "a", Name: "A"}},
		Scores:     scores(1, 10, 10),
	})
	if result.TotalWeight != 0 || result.Rows[0].Score != nil || result.Rows[0].Rank != 0 || result.Rows[0].Coverage != 0 {
		t.Fatalf("zero-weight result must stay empty: %+v", result)
	}
}

func TestComputeUnscoredRowsLast(t *testing.T) {
	result := Compute(Input{
		Dimensions: dims(100),
		Models: []Model{
			{ID: 1, Slug: "unscored", Name: "A Unscored"},
			{ID: 2, Slug: "low", Name: "B Low"},
			{ID: 3, Slug: "high", Name: "C High"},
		},
		Scores: append(scores(2, 2), scores(3, 9)...),
	})
	got := []string{result.Rows[0].Slug, result.Rows[1].Slug, result.Rows[2].Slug}
	want := []string{"high", "low", "unscored"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("order = %v, want %v", got, want)
		}
	}
	if result.Rows[2].Score != nil || result.Rows[2].Rank != 0 {
		t.Fatalf("unscored row must have no score/rank")
	}
}

func TestComputeTieBreakCoverageThenName(t *testing.T) {
	result := Compute(Input{
		Dimensions: dims(50, 50),
		Models: []Model{
			{ID: 1, Slug: "full", Name: "Zeta"},
			{ID: 2, Slug: "partial", Name: "Alpha"},
			{ID: 3, Slug: "partial-b", Name: "Beta"},
		},
		Scores: []Score{
			{ModelID: 1, DimensionID: 1, Value: 8}, {ModelID: 1, DimensionID: 2, Value: 8},
			{ModelID: 2, DimensionID: 1, Value: 8}, {ModelID: 3, DimensionID: 1, Value: 8},
		},
	})
	if result.Rows[0].Slug != "full" {
		t.Fatalf("higher coverage must win: %+v", result.Rows[0])
	}
	if result.Rows[1].Slug != "partial" || result.Rows[2].Slug != "partial-b" {
		t.Fatalf("name tie-break wrong: %+v", result.Rows)
	}
}

func TestComputeNormalizesBeforeMultiplying(t *testing.T) {
	result := Compute(Input{
		Dimensions: dims(50, 50),
		Models:     []Model{{ID: 1, Slug: "a", Name: "A"}},
		Scores:     []Score{{ModelID: 1, DimensionID: 1, Value: 1e308}, {ModelID: 1, DimensionID: 2, Value: 1e308}},
	})
	score := *result.Rows[0].Score
	if math.IsInf(score, 0) || math.IsNaN(score) {
		t.Fatalf("weighted average overflowed: %v", score)
	}
	if score != 1e308 {
		t.Fatalf("score = %v", score)
	}
}

func TestComputeIgnoresInvalidInput(t *testing.T) {
	result := Compute(Input{
		Dimensions: dims(50, 50),
		Models:     []Model{{ID: 1, Slug: "a", Name: "A"}},
		Scores: []Score{
			{ModelID: 1, DimensionID: 1, Value: math.NaN()},
			{ModelID: 1, DimensionID: 2, Value: 8},
			{ModelID: 1, DimensionID: 99, Value: 10},
			{ModelID: 2, DimensionID: 1, Value: 10},
		},
	})
	if *result.Rows[0].Score != 8 || result.Rows[0].Coverage != 0.5 {
		t.Fatalf("invalid inputs leaked into score: %+v", result.Rows[0])
	}
}

func TestComputeEmpty(t *testing.T) {
	result := Compute(Input{})
	if len(result.Rows) != 0 || result.TotalWeight != 0 {
		t.Fatalf("empty input = %+v", result)
	}
}
func TestComputeKeepsScoresAndRanksAcrossDisplayOrder(t *testing.T) {
	dimensions := []Dimension{
		{ID: 1, Name: "A", Weight: 1},
		{ID: 2, Name: "B", Weight: 1},
		{ID: 3, Name: "C", Weight: 1},
	}
	models := []Model{{ID: 1, Slug: "alpha", Name: "Alpha"}, {ID: 2, Slug: "zeta", Name: "Zeta"}}
	allScores := []Score{
		{ModelID: 1, DimensionID: 1, Value: 0.1},
		{ModelID: 1, DimensionID: 2, Value: 0.1},
		{ModelID: 1, DimensionID: 3, Value: 0.4},
		{ModelID: 2, DimensionID: 1, Value: 0.2},
		{ModelID: 2, DimensionID: 2, Value: 0.2},
		{ModelID: 2, DimensionID: 3, Value: 0.2},
	}
	rawAlphaSum := func(order []Dimension) float64 {
		sum := 0.0
		for _, dimension := range order {
			for _, sc := range allScores {
				if sc.ModelID == 1 && sc.DimensionID == dimension.ID {
					sum += (float64(dimension.Weight) / 3) * sc.Value
				}
			}
		}
		return sum
	}
	natural := []Dimension{dimensions[0], dimensions[1], dimensions[2]}
	swapped := []Dimension{dimensions[0], dimensions[2], dimensions[1]}
	if rawAlphaSum(natural) == rawAlphaSum(swapped) {
		t.Fatal("fixture must expose order-dependent summation")
	}
	snapshot := append([]Dimension(nil), natural...)

	for _, result := range []Result{
		Compute(Input{Dimensions: natural, Models: models, Scores: allScores}),
		Compute(Input{Dimensions: swapped, Models: models, Scores: allScores}),
	} {
		if len(result.Rows) != 2 {
			t.Fatalf("rows = %d", len(result.Rows))
		}
		alpha, zeta := result.Rows[0], result.Rows[1]
		if alpha.Slug != "alpha" || zeta.Slug != "zeta" {
			t.Fatalf("order = %s, %s", alpha.Slug, zeta.Slug)
		}
		if alpha.Score == nil || zeta.Score == nil || *alpha.Score != 0.2 || *zeta.Score != 0.2 {
			t.Fatalf("scores changed: %+v %+v", alpha, zeta)
		}
		if alpha.Coverage != 1 || zeta.Coverage != 1 || alpha.Rank != 1 || zeta.Rank != 2 {
			t.Fatalf("coverage/rank changed: %+v %+v", alpha, zeta)
		}
	}
	for i := range snapshot {
		if natural[i] != snapshot[i] {
			t.Fatalf("input dimensions mutated: %+v", natural)
		}
	}
}
