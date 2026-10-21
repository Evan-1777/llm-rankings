package store

import (
	"context"
	"errors"
	"math"
	"path/filepath"
	"testing"
)

func openTest(t *testing.T) (*Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s, path
}

func TestMigrationCreatesEmptySchema(t *testing.T) {
	s, path := openTest(t)
	ctx := context.Background()
	counts, err := s.Counts(ctx)
	if err != nil {
		t.Fatalf("counts: %v", err)
	}
	if counts.Models != 0 || counts.Dimensions != 0 || counts.ScoredModels != 0 {
		t.Fatalf("expected empty schema, got %+v", counts)
	}
	s.Close()

	again, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer again.Close()
	if _, err := again.ListModels(ctx); err != nil {
		t.Fatalf("list after reopen: %v", err)
	}
}

func TestDimensionLifecycle(t *testing.T) {
	s, _ := openTest(t)
	ctx := context.Background()

	d, err := s.CreateDimension(ctx, "Reasoning", "reasoning quality", 25)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if d.Weight != 25 || d.ArchivedAt != nil {
		t.Fatalf("unexpected dimension: %+v", d)
	}
	if _, err := s.CreateDimension(ctx, "reasoning", "", 10); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate name (case-insensitive) error = %v", err)
	}
	if _, err := s.CreateDimension(ctx, "Bad", "", -1); err == nil {
		t.Fatal("weight -1 must be rejected by the schema")
	}
	if _, err := s.CreateDimension(ctx, "Bad2", "", 101); err == nil {
		t.Fatal("weight 101 must be rejected by the schema")
	}

	updated, err := s.UpdateDimension(ctx, d.ID, "Reasoning", "updated", 0)
	if err != nil || updated.Weight != 0 {
		t.Fatalf("update weight: %+v %v", updated, err)
	}
	updated, err = s.UpdateDimension(ctx, d.ID, "Reasoning", "updated", 100)
	if err != nil || updated.Weight != 100 {
		t.Fatalf("update weight 100: %+v %v", updated, err)
	}

	archived, err := s.SetDimensionArchived(ctx, d.ID, true)
	if err != nil || archived.ArchivedAt == nil {
		t.Fatalf("archive: %+v %v", archived, err)
	}
	active, _ := s.ListDimensions(ctx, false)
	all, _ := s.ListDimensions(ctx, true)
	if len(active) != 0 || len(all) != 1 {
		t.Fatalf("archive visibility active=%d all=%d", len(active), len(all))
	}
	restored, err := s.SetDimensionArchived(ctx, d.ID, false)
	if err != nil || restored.ArchivedAt != nil {
		t.Fatalf("restore: %+v %v", restored, err)
	}

	m, err := s.CreateModel(ctx, "m1", "Model", "", "")
	if err != nil {
		t.Fatalf("model: %v", err)
	}
	if _, err := s.UpsertScore(ctx, m.Slug, d.ID, 8, "note"); err != nil {
		t.Fatalf("score: %v", err)
	}
	if err := s.DeleteDimension(ctx, d.ID); err != nil {
		t.Fatalf("delete dimension: %v", err)
	}
	scores, _ := s.ScoresForModel(ctx, m.ID)
	if len(scores) != 0 {
		t.Fatalf("cascade left %d scores", len(scores))
	}
}

func TestModelAndScoreLifecycle(t *testing.T) {
	s, _ := openTest(t)
	ctx := context.Background()
	d, _ := s.CreateDimension(ctx, "Quality", "", 100)

	m, err := s.CreateModel(ctx, "gpt-5", "GPT-5", "OpenAI", "private")
	if err != nil {
		t.Fatalf("create model: %v", err)
	}
	if _, err := s.CreateModel(ctx, "GPT-5", "Other", "", ""); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate slug error = %v", err)
	}
	if _, err := s.UpdateModel(ctx, m.ID, "GPT-5", "OpenAI", "updated private"); err != nil {
		t.Fatalf("update model: %v", err)
	}
	updated, _ := s.ModelBySlug(ctx, "gpt-5")
	if updated.Notes != "updated private" {
		t.Fatalf("notes not updated: %+v", updated)
	}

	for _, value := range []float64{0, 10, 12.5, 100} {
		sc, err := s.UpsertScore(ctx, "gpt-5", d.ID, value, "")
		if err != nil {
			t.Fatalf("score %v: %v", value, err)
		}
		if sc.Value != value {
			t.Fatalf("stored %v, want %v", sc.Value, value)
		}
	}
	for _, value := range []float64{-1, math.NaN(), math.Inf(1)} {
		if _, err := s.UpsertScore(ctx, "gpt-5", d.ID, value, ""); !errors.Is(err, ErrInvalid) {
			t.Fatalf("score %v error = %v, want ErrInvalid", value, err)
		}
	}
	if _, err := s.UpsertScore(ctx, "missing", d.ID, 5, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing model error = %v", err)
	}
	if _, err := s.SetDimensionArchived(ctx, d.ID, true); err != nil {
		t.Fatalf("archive: %v", err)
	}
	if _, err := s.UpsertScore(ctx, "gpt-5", d.ID, 5, ""); !errors.Is(err, ErrArchived) {
		t.Fatalf("archived dimension error = %v", err)
	}

	scores, _ := s.ScoresForModel(ctx, m.ID)
	if len(scores) != 1 {
		t.Fatalf("expected one score, got %d", len(scores))
	}
	if _, err := s.MaxUpdatedAt(ctx); err != nil || s == nil {
		t.Fatalf("updatedAt: %v", err)
	}
	if err := s.DeleteModel(ctx, m.ID); err != nil {
		t.Fatalf("delete model: %v", err)
	}
	scores, _ = s.ScoresForModel(ctx, m.ID)
	if len(scores) != 0 {
		t.Fatalf("model cascade left scores")
	}
}
