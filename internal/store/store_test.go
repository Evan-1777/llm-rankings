package store

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"path/filepath"
	"testing"
	"time"

	"llmrank/migrations"
)

func notePtr(value string) *string { return &value }

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
	if _, err := again.ListModels(ctx, false); err != nil {
		t.Fatalf("list after reopen: %v", err)
	}
}

func TestDimensionLifecycle(t *testing.T) {
	s, _ := openTest(t)
	ctx := context.Background()

	d, err := s.CreateDimension(ctx, "Reasoning", "reasoning quality", 25, false)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if d.Weight != 25 || d.ArchivedAt != nil {
		t.Fatalf("unexpected dimension: %+v", d)
	}
	if _, err := s.CreateDimension(ctx, "reasoning", "", 10, false); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate name (case-insensitive) error = %v", err)
	}
	if _, err := s.CreateDimension(ctx, "Bad", "", -1, false); err == nil {
		t.Fatal("weight -1 must be rejected by the schema")
	}
	if _, err := s.CreateDimension(ctx, "Bad2", "", 101, false); err == nil {
		t.Fatal("weight 101 must be rejected by the schema")
	}

	updated, err := s.UpdateDimension(ctx, d.ID, "Reasoning", "updated", 0, false)
	if err != nil || updated.Weight != 0 {
		t.Fatalf("update weight: %+v %v", updated, err)
	}
	updated, err = s.UpdateDimension(ctx, d.ID, "Reasoning", "updated", 100, false)
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
	if _, err := s.UpsertScore(ctx, m.Slug, d.ID, 8, notePtr("note")); err != nil {
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
	d, _ := s.CreateDimension(ctx, "Quality", "", 100, false)

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
		sc, err := s.UpsertScore(ctx, "gpt-5", d.ID, value, notePtr(""))
		if err != nil {
			t.Fatalf("score %v: %v", value, err)
		}
		if sc.Value != value {
			t.Fatalf("stored %v, want %v", sc.Value, value)
		}
	}
	for _, value := range []float64{-1, math.NaN(), math.Inf(1)} {
		if _, err := s.UpsertScore(ctx, "gpt-5", d.ID, value, notePtr("")); !errors.Is(err, ErrInvalid) {
			t.Fatalf("score %v error = %v, want ErrInvalid", value, err)
		}
	}
	if _, err := s.UpsertScore(ctx, "missing", d.ID, 5, notePtr("")); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing model error = %v", err)
	}
	if _, err := s.SetDimensionArchived(ctx, d.ID, true); err != nil {
		t.Fatalf("archive: %v", err)
	}
	if _, err := s.UpsertScore(ctx, "gpt-5", d.ID, 5, notePtr("")); !errors.Is(err, ErrArchived) {
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

func TestModelCommentaryStorage(t *testing.T) {
	s, _ := openTest(t)
	ctx := context.Background()
	m, err := s.CreateModel(ctx, "voice", "Voice", "Vendor", "private")
	if err != nil {
		t.Fatalf("create model: %v", err)
	}
	if m.Commentary != "" || m.CommentaryPublic || m.CommentaryAt != "" {
		t.Fatalf("new model commentary defaults = %+v", m)
	}
	updated, err := s.SetModelCommentary(ctx, m.ID, "第一段\nsecond line", true, "2026-10-23")
	if err != nil {
		t.Fatalf("set commentary: %v", err)
	}
	if updated.Commentary != "第一段\nsecond line" || !updated.CommentaryPublic || updated.CommentaryAt != "2026-10-23" {
		t.Fatalf("set commentary result = %+v", updated)
	}

	bySlug, err := s.ModelBySlug(ctx, "voice")
	if err != nil || bySlug.Commentary != updated.Commentary || bySlug.CommentaryPublic != updated.CommentaryPublic || bySlug.CommentaryAt != updated.CommentaryAt {
		t.Fatalf("ModelBySlug commentary = %+v, %v", bySlug, err)
	}
	list, err := s.ListModels(ctx, false)
	if err != nil || len(list) != 1 || list[0].Commentary != updated.Commentary || !list[0].CommentaryPublic || list[0].CommentaryAt != updated.CommentaryAt {
		t.Fatalf("ListModels commentary = %+v, %v", list, err)
	}

	overwritten, err := s.SetModelCommentary(ctx, m.ID, "重写", false, "")
	if err != nil || overwritten.Commentary != "重写" || overwritten.CommentaryPublic || overwritten.CommentaryAt != "" {
		t.Fatalf("overwrite commentary = %+v, %v", overwritten, err)
	}
	cleared, err := s.SetModelCommentary(ctx, m.ID, "", false, "")
	if err != nil || cleared.Commentary != "" || cleared.CommentaryPublic || cleared.CommentaryAt != "" {
		t.Fatalf("clear commentary = %+v, %v", cleared, err)
	}
	if _, err := s.SetModelCommentary(ctx, m.ID+999, "x", false, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing model commentary error = %v", err)
	}
}

func TestCommentaryMigrationKeepsLegacyModels(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("open legacy: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{
		"001_init.sql", "002_dimension_order.sql", "003_display_settings.sql",
		"004_maintenance_mode.sql", "005_model_visibility_archive.sql", "006_dimension_text_mode.sql",
	} {
		body, err := migrations.FS.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(string(body)); err != nil {
			t.Fatalf("legacy migration %s: %v", name, err)
		}
		if _, err := db.Exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, name, nowStamp()); err != nil {
			t.Fatal(err)
		}
	}
	now := nowStamp()
	if _, err := db.Exec(`INSERT INTO models (slug, name, vendor, notes, created_at, updated_at) VALUES ('legacy', 'Legacy', '', '', ?, ?)`, now, now); err != nil {
		t.Fatal(err)
	}
	db.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("open migrated store: %v", err)
	}
	defer s.Close()
	m, err := s.ModelBySlug(context.Background(), "legacy")
	if err != nil {
		t.Fatalf("legacy model: %v", err)
	}
	if m.Commentary != "" || m.CommentaryPublic || m.CommentaryAt != "" {
		t.Fatalf("legacy commentary defaults = %+v", m)
	}
}

func TestListModelsCompletenessCountsScoreableDimensions(t *testing.T) {
	s, _ := openTest(t)
	ctx := context.Background()
	active, _ := s.CreateDimension(ctx, "Active", "", 50, false)
	idle, _ := s.CreateDimension(ctx, "Idle", "", 0, false)
	archived, _ := s.CreateDimension(ctx, "Archived", "", 50, false)
	if _, err := s.CreateModel(ctx, "m", "Model", "", ""); err != nil {
		t.Fatalf("create model: %v", err)
	}
	for _, id := range []int64{active.ID, idle.ID, archived.ID} {
		if _, err := s.UpsertScore(ctx, "m", id, 8, notePtr("")); err != nil {
			t.Fatalf("score %d: %v", id, err)
		}
	}
	if _, err := s.SetDimensionArchived(ctx, archived.ID, true); err != nil {
		t.Fatalf("archive: %v", err)
	}
	if _, err := s.CreateModel(ctx, "empty", "Empty", "", ""); err != nil {
		t.Fatalf("create empty model: %v", err)
	}
	models, err := s.ListModels(ctx, false)
	if err != nil {
		t.Fatalf("list models: %v", err)
	}
	bySlug := make(map[string]ModelSummary, len(models))
	for _, m := range models {
		bySlug[m.Slug] = m
	}
	if got := bySlug["m"]; got.ScoreCount != 3 || got.ScoredDimensions != 1 {
		t.Fatalf("m completeness = %d scores / %d scoreable, want 3 / 1", got.ScoreCount, got.ScoredDimensions)
	}
	if got := bySlug["empty"]; got.ScoreCount != 0 || got.ScoredDimensions != 0 {
		t.Fatalf("empty model completeness = %+v", got)
	}
}

func ids(dims []Dimension) []int64 {
	out := make([]int64, len(dims))
	for i, d := range dims {
		out[i] = d.ID
	}
	return out
}

func equalIDs(got []Dimension, want ...int64) bool {
	gotIDs := ids(got)
	if len(gotIDs) != len(want) {
		return false
	}
	for i := range want {
		if gotIDs[i] != want[i] {
			return false
		}
	}
	return true
}

func TestDimensionOrderMigrationKeepsLegacyOrder(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("open legacy: %v", err)
	}
	body, err := migrations.FS.ReadFile("001_init.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(body)); err != nil {
		t.Fatalf("legacy schema: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO schema_migrations (version, applied_at) VALUES ('001_init.sql', ?)`, nowStamp()); err != nil {
		t.Fatal(err)
	}
	now := nowStamp()
	for i, name := range []string{"First", "Second", "Third"} {
		if _, err := db.Exec(`INSERT INTO dimensions (id, name, description, weight, created_at, updated_at) VALUES (?, ?, '', 10, ?, ?)`,
			int64(i+1)*10, name, now, now); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("open migrated store: %v", err)
	}
	defer s.Close()
	dims, err := s.ListDimensions(context.Background(), true)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if !equalIDs(dims, 10, 20, 30) {
		t.Fatalf("legacy order changed: %v", ids(dims))
	}
	if dims[0].Position != 10 || dims[1].Position != 20 || dims[2].Position != 30 {
		t.Fatalf("positions not seeded from ids: %+v", dims)
	}
}

func TestDimensionOrderAppendArchiveRestoreAndRestart(t *testing.T) {
	s, path := openTest(t)
	ctx := context.Background()
	a, _ := s.CreateDimension(ctx, "A", "", 10, false)
	b, _ := s.CreateDimension(ctx, "B", "", 10, false)
	c, _ := s.CreateDimension(ctx, "C", "", 10, false)

	if err := s.ReorderDimensions(ctx, []int64{c.ID, a.ID, b.ID}); err != nil {
		t.Fatalf("reorder: %v", err)
	}
	if _, err := s.SetDimensionArchived(ctx, b.ID, true); err != nil {
		t.Fatalf("archive: %v", err)
	}
	all, _ := s.ListDimensions(ctx, true)
	if !equalIDs(all, c.ID, a.ID, b.ID) {
		t.Fatalf("archive changed order: %v", ids(all))
	}
	if _, err := s.SetDimensionArchived(ctx, b.ID, false); err != nil {
		t.Fatalf("restore: %v", err)
	}
	all, _ = s.ListDimensions(ctx, true)
	if !equalIDs(all, c.ID, a.ID, b.ID) {
		t.Fatalf("restore changed order: %v", ids(all))
	}

	if err := s.DeleteDimension(ctx, c.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	d, _ := s.CreateDimension(ctx, "D", "", 10, false)
	all, _ = s.ListDimensions(ctx, true)
	if !equalIDs(all, a.ID, b.ID, d.ID) {
		t.Fatalf("new dimension not appended: %v", ids(all))
	}

	s.Close()
	again, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer again.Close()
	all, _ = again.ListDimensions(ctx, true)
	if !equalIDs(all, a.ID, b.ID, d.ID) {
		t.Fatalf("order lost on restart: %v", ids(all))
	}
}

func TestDisplaySettingsDefaultsAndPersists(t *testing.T) {
	s, path := openTest(t)
	ctx := context.Background()

	settings, err := s.DisplaySettings(ctx)
	if err != nil || settings != (DisplaySettings{}) {
		t.Fatalf("empty table = %+v, %v; want all switches off without error", settings, err)
	}
	var rows int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM display_settings`).Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("migration seeded display_settings: rows=%d err=%v", rows, err)
	}

	if err := s.UpdateDisplaySettings(ctx, DisplaySettings{ScorePercentageMode: true}); err != nil {
		t.Fatalf("enable percentage: %v", err)
	}
	if settings, err = s.DisplaySettings(ctx); err != nil || !settings.ScorePercentageMode || settings.ScorePercentageMaxMode || settings.MaintenanceMode {
		t.Fatalf("percentage only = %+v, %v", settings, err)
	}
	if err := s.UpdateDisplaySettings(ctx, DisplaySettings{ScorePercentageMode: true, ScorePercentageMaxMode: true}); err != nil {
		t.Fatalf("enable max share: %v", err)
	}
	if settings, err = s.DisplaySettings(ctx); err != nil || !settings.ScorePercentageMode || !settings.ScorePercentageMaxMode || settings.MaintenanceMode {
		t.Fatalf("max share enabled = %+v, %v", settings, err)
	}
	if err := s.UpdateDisplaySettings(ctx, DisplaySettings{MaintenanceMode: true}); err != nil {
		t.Fatalf("enable maintenance: %v", err)
	}
	if settings, err = s.DisplaySettings(ctx); err != nil || settings.ScorePercentageMode || settings.ScorePercentageMaxMode || !settings.MaintenanceMode {
		t.Fatalf("maintenance only = %+v, %v", settings, err)
	}
	if err := s.UpdateDisplaySettings(ctx, DisplaySettings{ScorePercentageMode: true, ScorePercentageMaxMode: true, MaintenanceMode: true}); err != nil {
		t.Fatalf("enable all: %v", err)
	}
	if settings, err = s.DisplaySettings(ctx); err != nil || !settings.ScorePercentageMode || !settings.ScorePercentageMaxMode || !settings.MaintenanceMode {
		t.Fatalf("all enabled = %+v, %v", settings, err)
	}
	if err := s.UpdateDisplaySettings(ctx, DisplaySettings{}); err != nil {
		t.Fatalf("disable: %v", err)
	}
	if settings, err = s.DisplaySettings(ctx); err != nil || settings != (DisplaySettings{}) {
		t.Fatalf("disabled = %+v, %v", settings, err)
	}
	if err := s.UpdateDisplaySettings(ctx, DisplaySettings{MaintenanceMode: true}); err != nil {
		t.Fatalf("re-enable: %v", err)
	}
	s.Close()

	reopened, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer reopened.Close()
	if settings, err = reopened.DisplaySettings(ctx); err != nil || settings.ScorePercentageMode || !settings.MaintenanceMode {
		t.Fatalf("after reopen = %+v, %v", settings, err)
	}
}

func TestReorderDimensionsRejectsMismatch(t *testing.T) {
	s, _ := openTest(t)
	ctx := context.Background()
	if err := s.ReorderDimensions(ctx, nil); err != nil {
		t.Fatalf("empty store should accept empty order: %v", err)
	}
	a, _ := s.CreateDimension(ctx, "A", "", 10, false)
	b, _ := s.CreateDimension(ctx, "B", "", 10, false)
	c, _ := s.CreateDimension(ctx, "C", "", 10, false)
	before, _ := s.ListDimensions(ctx, true)
	beforeStamps := make([]time.Time, len(before))
	for i, dim := range before {
		beforeStamps[i] = dim.UpdatedAt
	}

	for name, order := range map[string][]int64{
		"empty":      {},
		"short":      {c.ID, a.ID},
		"unknown":    {c.ID, a.ID, b.ID, 999},
		"duplicate":  {c.ID, c.ID, a.ID},
		"zero value": {c.ID, a.ID, 0},
	} {
		if err := s.ReorderDimensions(ctx, order); !errors.Is(err, ErrOrderMismatch) {
			t.Fatalf("%s order error = %v, want ErrOrderMismatch", name, err)
		}
	}

	after, _ := s.ListDimensions(ctx, true)
	if !equalIDs(after, a.ID, b.ID, c.ID) {
		t.Fatalf("failed reorder changed positions: %v", ids(after))
	}
	for i := range after {
		if !after[i].UpdatedAt.Equal(beforeStamps[i]) {
			t.Fatalf("failed reorder changed updated_at at %d", i)
		}
	}

	if err := s.ReorderDimensions(ctx, []int64{c.ID, a.ID, b.ID}); err != nil {
		t.Fatalf("valid reorder: %v", err)
	}
	after, _ = s.ListDimensions(ctx, true)
	if !equalIDs(after, c.ID, a.ID, b.ID) {
		t.Fatalf("valid reorder not applied: %v", ids(after))
	}
}
func TestModelVisibilityAndArchive(t *testing.T) {
	s, _ := openTest(t)
	ctx := context.Background()

	m, err := s.CreateModel(ctx, "m", "Model", "", "")
	if err != nil {
		t.Fatalf("create model: %v", err)
	}
	if m.Hidden || m.ArchivedAt != nil {
		t.Fatalf("new model must default to visible and active: %+v", m)
	}
	hidden, err := s.SetModelHidden(ctx, m.ID, true)
	if err != nil || !hidden.Hidden {
		t.Fatalf("hide: %+v %v", hidden, err)
	}
	list, _ := s.ListModels(ctx, false)
	if len(list) != 1 || !list[0].Hidden {
		t.Fatalf("hidden model must stay in the default list: %+v", list)
	}
	counts, _ := s.Counts(ctx)
	if counts.Models != 0 {
		t.Fatalf("hidden model counted in public stats: %+v", counts)
	}

	archived, err := s.SetModelArchived(ctx, m.ID, true)
	if err != nil || archived.ArchivedAt == nil {
		t.Fatalf("archive: %+v %v", archived, err)
	}
	list, _ = s.ListModels(ctx, false)
	if len(list) != 0 {
		t.Fatalf("archived model leaked into the default list: %+v", list)
	}
	list, _ = s.ListModels(ctx, true)
	if len(list) != 1 || list[0].ArchivedAt == nil {
		t.Fatalf("includeArchived = %+v", list)
	}

	restored, err := s.SetModelArchived(ctx, m.ID, false)
	if err != nil || restored.ArchivedAt != nil {
		t.Fatalf("restore: %+v %v", restored, err)
	}
	shown, err := s.SetModelHidden(ctx, m.ID, false)
	if err != nil || shown.Hidden {
		t.Fatalf("show: %+v %v", shown, err)
	}
	counts, _ = s.Counts(ctx)
	if counts.Models != 1 {
		t.Fatalf("visible model missing from counts: %+v", counts)
	}
}

func TestTextDimensionStorageAndCascade(t *testing.T) {
	s, _ := openTest(t)
	ctx := context.Background()

	text, err := s.CreateDimension(ctx, "Notes", "", 0, true)
	if err != nil || !text.TextMode {
		t.Fatalf("create text dimension: %+v %v", text, err)
	}
	numeric, err := s.CreateDimension(ctx, "Quality", "", 50, false)
	if err != nil || numeric.TextMode {
		t.Fatalf("create numeric dimension: %+v %v", numeric, err)
	}
	m, _ := s.CreateModel(ctx, "m", "Model", "", "")

	if err := s.SetDimensionText(ctx, "m", text.ID, "第一行\nsecond line"); err != nil {
		t.Fatalf("set text: %v", err)
	}
	texts, err := s.TextsForModel(ctx, m.ID)
	if err != nil || texts[text.ID] != "第一行\nsecond line" {
		t.Fatalf("texts = %+v %v", texts, err)
	}
	all, err := s.AllTexts(ctx)
	if err != nil || len(all) != 1 || all[0].ModelID != m.ID {
		t.Fatalf("all texts = %+v %v", all, err)
	}

	if _, err := s.UpsertScore(ctx, "m", text.ID, 8, notePtr("")); !errors.Is(err, ErrTextDimension) {
		t.Fatalf("score on text dimension = %v, want ErrTextDimension", err)
	}
	if err := s.SetDimensionText(ctx, "m", numeric.ID, "wrong"); !errors.Is(err, ErrNumericDimension) {
		t.Fatalf("text on numeric dimension = %v, want ErrNumericDimension", err)
	}
	if err := s.SetDimensionText(ctx, "missing", text.ID, "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("text on missing model = %v, want ErrNotFound", err)
	}
	if _, err := s.SetDimensionArchived(ctx, text.ID, true); err != nil {
		t.Fatal(err)
	}
	if err := s.SetDimensionText(ctx, "m", text.ID, "late"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("text on archived dimension = %v, want ErrNotFound", err)
	}
	if _, err := s.SetDimensionArchived(ctx, text.ID, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SetModelArchived(ctx, m.ID, true); err != nil {
		t.Fatal(err)
	}
	if err := s.SetDimensionText(ctx, "m", text.ID, "late"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("text on archived model = %v, want ErrNotFound", err)
	}
	if _, err := s.SetModelArchived(ctx, m.ID, false); err != nil {
		t.Fatal(err)
	}

	if err := s.SetDimensionText(ctx, "m", text.ID, ""); err != nil {
		t.Fatalf("clear text: %v", err)
	}
	texts, _ = s.TextsForModel(ctx, m.ID)
	if len(texts) != 0 {
		t.Fatalf("cleared text still stored: %+v", texts)
	}

	if err := s.SetDimensionText(ctx, "m", text.ID, "cascade"); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteDimension(ctx, text.ID); err != nil {
		t.Fatal(err)
	}
	all, _ = s.AllTexts(ctx)
	if len(all) != 0 {
		t.Fatalf("dimension cascade left texts: %+v", all)
	}
}
