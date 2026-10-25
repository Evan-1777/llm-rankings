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

func fixedDims(baseline float64, weights ...int) []Dimension {
	out := dims(weights...)
	for i := range out {
		out[i].BaselineMax = ptrFloat(baseline)
	}
	return out
}

func ptrFloat(value float64) *float64 { return &value }

func scores(modelID int64, values ...float64) []Score {
	out := make([]Score, len(values))
	for i, v := range values {
		out[i] = Score{ModelID: modelID, DimensionID: int64(i + 1), Value: v}
	}
	return out
}

func closeEnough(got, want float64) bool {
	return math.Abs(got-want) < 1e-9
}

func TestComputeWeightedAverageAndCoverage(t *testing.T) {
	// Fixed baselines isolate the weighting rules from the baseline source.
	in := Input{
		Dimensions: fixedDims(10, 25, 25, 25, 25),
		Models:     []Model{{ID: 1, Slug: "a", Name: "Alpha"}, {ID: 2, Slug: "b", Name: "Beta"}},
		Scores:     append(scores(1, 8, 9, 10, 7), scores(2, 8)...),
	}
	result := Compute(in)
	if result.TotalWeight != 100 {
		t.Fatalf("totalWeight = %d", result.TotalWeight)
	}
	full := result.Rows[0]
	if full.Slug != "a" || full.Score == nil || !closeEnough(*full.Score, 85) || full.Coverage != 1 || full.Provisional {
		t.Fatalf("full row wrong: %+v", full)
	}
	partial := result.Rows[1]
	if partial.Score == nil || !closeEnough(*partial.Score, 80) || partial.Coverage != 0.25 || !partial.Provisional {
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

func TestComputeTieBreakUnicodeNames(t *testing.T) {
	// Lowercased UTF-8 byte order puts 张 before 李; the frontend compareNames
	// mirrors this so the score preview cannot disagree with the saved rank.
	result := Compute(Input{
		Dimensions: dims(100),
		Models:     []Model{{ID: 1, Slug: "li", Name: "李"}, {ID: 2, Slug: "zhang", Name: "张"}},
		Scores:     []Score{{ModelID: 1, DimensionID: 1, Value: 9}, {ModelID: 2, DimensionID: 1, Value: 9}},
	})
	if result.Rows[0].Slug != "zhang" || result.Rows[1].Slug != "li" {
		t.Fatalf("unicode tie order = %s, %s", result.Rows[0].Slug, result.Rows[1].Slug)
	}
	if result.Rows[0].Rank != 1 || result.Rows[1].Rank != 2 {
		t.Fatalf("ranks = %d, %d", result.Rows[0].Rank, result.Rows[1].Rank)
	}
}

func TestComputeAutoBaselineKeepsConversionBounded(t *testing.T) {
	// With no fixed baseline the highest score becomes the baseline, so even
	// extreme inputs convert into the bounded 0–100 range.
	result := Compute(Input{
		Dimensions: dims(50, 50),
		Models:     []Model{{ID: 1, Slug: "a", Name: "A"}},
		Scores:     []Score{{ModelID: 1, DimensionID: 1, Value: 1e308}, {ModelID: 1, DimensionID: 2, Value: 1e308}},
	})
	score := *result.Rows[0].Score
	if math.IsInf(score, 0) || math.IsNaN(score) {
		t.Fatalf("weighted average overflowed: %v", score)
	}
	if !closeEnough(score, 100) {
		t.Fatalf("score = %v, want 100", score)
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
	if !closeEnough(*result.Rows[0].Score, 100) || result.Rows[0].Coverage != 0.5 {
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
	dimensions := fixedDims(10, 1, 1, 1)
	models := []Model{{ID: 1, Slug: "alpha", Name: "Alpha"}, {ID: 2, Slug: "zeta", Name: "Zeta"}}
	allScores := []Score{
		{ModelID: 1, DimensionID: 1, Value: 1},
		{ModelID: 1, DimensionID: 2, Value: 1},
		{ModelID: 1, DimensionID: 3, Value: 4},
		{ModelID: 2, DimensionID: 1, Value: 1},
		{ModelID: 2, DimensionID: 2, Value: 1},
		{ModelID: 2, DimensionID: 3, Value: 4},
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
		if alpha.Score == nil || zeta.Score == nil || !closeEnough(*alpha.Score, 20) || !closeEnough(*zeta.Score, 20) {
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
func TestComputeHiddenModelsStayLastAndUnranked(t *testing.T) {
	visibleOnly := Compute(Input{
		Dimensions: fixedDims(10, 100),
		Models:     []Model{{ID: 1, Slug: "a", Name: "Alpha"}, {ID: 2, Slug: "b", Name: "Beta"}},
		Scores:     []Score{{ModelID: 1, DimensionID: 1, Value: 9}, {ModelID: 2, DimensionID: 1, Value: 8}},
	})
	withHidden := Compute(Input{
		Dimensions: fixedDims(10, 100),
		Models: []Model{
			{ID: 1, Slug: "a", Name: "Alpha"},
			{ID: 2, Slug: "b", Name: "Beta"},
			{ID: 3, Slug: "h", Name: "Hidden", Hidden: true},
		},
		Scores: []Score{
			{ModelID: 1, DimensionID: 1, Value: 9},
			{ModelID: 2, DimensionID: 1, Value: 8},
			{ModelID: 3, DimensionID: 1, Value: 10},
		},
	})
	if len(withHidden.Rows) != 3 || withHidden.Rows[2].Slug != "h" {
		t.Fatalf("hidden row must sort last: %+v", withHidden.Rows)
	}
	if withHidden.Rows[0].Rank != 1 || withHidden.Rows[1].Rank != 2 || withHidden.Rows[2].Rank != 0 {
		t.Fatalf("hidden row took a rank: %+v", withHidden.Rows)
	}
	for i := 0; i < 2; i++ {
		if visibleOnly.Rows[i].Rank != withHidden.Rows[i].Rank || *visibleOnly.Rows[i].Score != *withHidden.Rows[i].Score {
			t.Fatalf("visible rows changed when hiding a model: %+v vs %+v", visibleOnly.Rows[i], withHidden.Rows[i])
		}
	}
	if withHidden.Rows[2].Score == nil {
		t.Fatal("hidden model must still be scored")
	}
}

func TestComputeAutoBaselineIncludesHiddenModels(t *testing.T) {
	result := Compute(Input{
		Dimensions: dims(100),
		Models: []Model{
			{ID: 1, Slug: "a", Name: "Alpha"},
			{ID: 2, Slug: "b", Name: "Beta"},
			{ID: 3, Slug: "h", Name: "Hidden", Hidden: true},
		},
		Scores: []Score{
			{ModelID: 1, DimensionID: 1, Value: 9},
			{ModelID: 2, DimensionID: 1, Value: 8},
			{ModelID: 3, DimensionID: 1, Value: 10},
		},
	})
	if !closeEnough(result.EffectiveBaselines[1], 10) {
		t.Fatalf("hidden model must set the baseline: %+v", result.EffectiveBaselines)
	}
	bySlug := make(map[string]Row, len(result.Rows))
	for _, row := range result.Rows {
		bySlug[row.Slug] = row
	}
	if !closeEnough(*bySlug["a"].Score, 90) || !closeEnough(*bySlug["b"].Score, 80) {
		t.Fatalf("visible scores must use the hidden maximum: %+v", bySlug)
	}
}

func TestComputeZeroWeightDimensionStaysVisibleOnly(t *testing.T) {
	result := Compute(Input{
		Dimensions: fixedDims(10, 100, 0),
		Models:     []Model{{ID: 1, Slug: "a", Name: "A"}},
		Scores:     []Score{{ModelID: 1, DimensionID: 1, Value: 9}, {ModelID: 1, DimensionID: 2, Value: 10}},
	})
	row := result.Rows[0]
	if row.Score == nil || !closeEnough(*row.Score, 90) || row.Coverage != 1 || row.Rank != 1 || result.TotalWeight != 100 {
		t.Fatalf("zero-weight dimension changed scoring: %+v", row)
	}
	if row.DimensionScores[2] != 10 {
		t.Fatalf("zero-weight value missing from the display snapshot: %+v", row.DimensionScores)
	}
}

func TestEffectiveBaselinesPrefersFixedAndOmitsUnscored(t *testing.T) {
	dimensions := []Dimension{
		{ID: 1, Name: "Fixed", Weight: 50, BaselineMax: ptrFloat(4)},
		{ID: 2, Name: "Auto", Weight: 50},
		{ID: 3, Name: "Idle", Weight: 0},
	}
	models := []Model{{ID: 1, Slug: "a", Name: "A"}, {ID: 2, Slug: "b", Name: "B"}}
	got := EffectiveBaselines(dimensions, models, []Score{
		{ModelID: 1, DimensionID: 1, Value: 9},
		{ModelID: 1, DimensionID: 2, Value: 3},
		{ModelID: 2, DimensionID: 2, Value: 7},
	})
	if !closeEnough(got[1], 4) {
		t.Fatalf("fixed baseline must ignore scores: %v", got[1])
	}
	if !closeEnough(got[2], 7) {
		t.Fatalf("auto baseline must take the highest score: %v", got[2])
	}
	if _, ok := got[3]; ok {
		t.Fatalf("unscored dimension must be absent: %v", got)
	}
}

func TestComputeAutoBaselineTracksHighestScore(t *testing.T) {
	build := func(highest float64) Result {
		return Compute(Input{
			Dimensions: dims(100),
			Models:     []Model{{ID: 1, Slug: "a", Name: "A"}, {ID: 2, Slug: "b", Name: "B"}},
			Scores:     []Score{{ModelID: 1, DimensionID: 1, Value: 8}, {ModelID: 2, DimensionID: 1, Value: highest}},
		})
	}
	scoreOf := func(result Result, slug string) float64 {
		for _, row := range result.Rows {
			if row.Slug == slug {
				return *row.Score
			}
		}
		t.Fatalf("missing row %s", slug)
		return 0
	}
	if got := scoreOf(build(10), "a"); !closeEnough(got, 80) {
		t.Fatalf("auto baseline 10: score = %v, want 80", got)
	}
	if got := scoreOf(build(16), "a"); !closeEnough(got, 50) {
		t.Fatalf("auto baseline 16: score = %v, want 50", got)
	}
}

func TestComputeFixedBaselineIgnoresHigherScores(t *testing.T) {
	build := func(highest float64) Result {
		return Compute(Input{
			Dimensions: fixedDims(10, 100),
			Models:     []Model{{ID: 1, Slug: "a", Name: "A"}, {ID: 2, Slug: "b", Name: "B"}},
			Scores:     []Score{{ModelID: 1, DimensionID: 1, Value: 8}, {ModelID: 2, DimensionID: 1, Value: highest}},
		})
	}
	scoreOf := func(result Result, slug string) float64 {
		for _, row := range result.Rows {
			if row.Slug == slug {
				return *row.Score
			}
		}
		t.Fatalf("missing row %s", slug)
		return 0
	}
	if got := scoreOf(build(9), "a"); !closeEnough(got, 80) {
		t.Fatalf("fixed baseline with score 9: score = %v, want 80", got)
	}
	if got := scoreOf(build(20), "a"); !closeEnough(got, 80) {
		t.Fatalf("fixed baseline with score 20: score = %v, want 80", got)
	}
}

func TestComputeScoresAboveBaselineExceedHundred(t *testing.T) {
	result := Compute(Input{
		Dimensions: fixedDims(5, 100),
		Models:     []Model{{ID: 1, Slug: "a", Name: "A"}},
		Scores:     []Score{{ModelID: 1, DimensionID: 1, Value: 8}},
	})
	if !closeEnough(*result.Rows[0].Score, 160) {
		t.Fatalf("score = %v, want 160", *result.Rows[0].Score)
	}
}

func TestComputeAllZeroDimensionScoresZero(t *testing.T) {
	result := Compute(Input{
		Dimensions: dims(100),
		Models:     []Model{{ID: 1, Slug: "a", Name: "A"}},
		Scores:     []Score{{ModelID: 1, DimensionID: 1, Value: 0}},
	})
	if baseline, ok := result.EffectiveBaselines[1]; !ok || baseline != 0 {
		t.Fatalf("all-zero dimension must have baseline 0: %+v", result.EffectiveBaselines)
	}
	if result.Rows[0].Score == nil || *result.Rows[0].Score != 0 {
		t.Fatalf("score = %+v, want 0", result.Rows[0].Score)
	}
}

func TestEffectiveBaselinesIgnoresScoresOutsideSnapshot(t *testing.T) {
	got := EffectiveBaselines(
		dims(100),
		[]Model{{ID: 1, Slug: "a", Name: "A"}},
		[]Score{{ModelID: 1, DimensionID: 1, Value: 8}, {ModelID: 2, DimensionID: 1, Value: 20}},
	)
	if !closeEnough(got[1], 8) {
		t.Fatalf("archived model score must not raise the baseline: %v", got[1])
	}
}
