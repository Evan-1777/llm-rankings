package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Model is a model profile. Notes are private to the administrator; commentary
// is public only when CommentaryPublic is set.
type Model struct {
	ID               int64
	Slug             string
	Name             string
	Vendor           string
	Notes            string
	Hidden           bool
	ArchivedAt       *time.Time
	Commentary       string
	CommentaryPublic bool
	CommentaryAt     string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// ModelSummary adds stored score totals and scoreable-dimension completeness
// for management lists. ScoreCount includes archived dimensions; ScoredDimensions
// only counts enabled dimensions with a positive weight.
type ModelSummary struct {
	Model
	ScoreCount       int
	ScoredDimensions int
}

// modelColumns is the shared SELECT and Scan order for every model read.
const modelColumns = "id, slug, name, vendor, notes, hidden, archived_at, commentary, commentary_public, commentary_at, created_at, updated_at"

func scanModel(row rowScanner) (Model, error) {
	var m Model
	var archived sql.NullString
	var created, updated string
	if err := row.Scan(&m.ID, &m.Slug, &m.Name, &m.Vendor, &m.Notes, &m.Hidden, &archived, &m.Commentary, &m.CommentaryPublic, &m.CommentaryAt, &created, &updated); err != nil {
		return m, err
	}
	var err error
	if m.ArchivedAt, err = stampOrNil(archived); err != nil {
		return m, err
	}
	if m.CreatedAt, err = parseStamp(created); err != nil {
		return m, err
	}
	if m.UpdatedAt, err = parseStamp(updated); err != nil {
		return m, err
	}
	return m, nil
}

// ListModels returns models ordered by name, excluding archived rows by default.
func (s *Store) ListModels(ctx context.Context, includeArchived bool) ([]ModelSummary, error) {
	query := `SELECT m.id, m.slug, m.name, m.vendor, m.notes, m.hidden, m.archived_at, m.commentary, m.commentary_public, m.commentary_at, m.created_at, m.updated_at,
		COUNT(sc.model_id),
		COUNT(CASE WHEN d.archived_at IS NULL AND d.weight > 0 THEN 1 END)
		FROM models m
		LEFT JOIN scores sc ON sc.model_id = m.id
		LEFT JOIN dimensions d ON d.id = sc.dimension_id`
	if !includeArchived {
		query += ` WHERE m.archived_at IS NULL`
	}
	query += ` GROUP BY m.id ORDER BY m.name COLLATE NOCASE, m.slug`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ModelSummary
	for rows.Next() {
		var m ModelSummary
		var archived sql.NullString
		var created, updated string
		if err := rows.Scan(&m.ID, &m.Slug, &m.Name, &m.Vendor, &m.Notes, &m.Hidden, &archived, &m.Commentary, &m.CommentaryPublic, &m.CommentaryAt, &created, &updated, &m.ScoreCount, &m.ScoredDimensions); err != nil {
			return nil, err
		}
		var err error
		if m.ArchivedAt, err = stampOrNil(archived); err != nil {
			return nil, err
		}
		if m.CreatedAt, err = parseStamp(created); err != nil {
			return nil, err
		}
		if m.UpdatedAt, err = parseStamp(updated); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ModelBySlug looks up a model case-insensitively, including archived rows.
func (s *Store) ModelBySlug(ctx context.Context, slug string) (Model, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+modelColumns+` FROM models WHERE slug = ? COLLATE NOCASE`, slug)
	m, err := scanModel(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Model{}, ErrNotFound
	}
	return m, err
}

func (s *Store) modelByID(ctx context.Context, id int64) (Model, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+modelColumns+` FROM models WHERE id = ?`, id)
	m, err := scanModel(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Model{}, ErrNotFound
	}
	return m, err
}

// CreateModel inserts a model profile.
func (s *Store) CreateModel(ctx context.Context, slug, name, vendor, notes string) (Model, error) {
	now := nowStamp()
	_, err := s.db.ExecContext(ctx, `INSERT INTO models (slug, name, vendor, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		slug, name, vendor, notes, now, now)
	if err != nil {
		if isUnique(err) {
			return Model{}, ErrConflict
		}
		return Model{}, err
	}
	return s.ModelBySlug(ctx, slug)
}

// ModelUpdate carries every mutable model field in one write.
type ModelUpdate struct {
	Name             string
	Vendor           string
	Notes            string
	Hidden           bool
	Commentary       string
	CommentaryPublic bool
	CommentaryAt     string
}

// UpdateModel writes every mutable model field in one statement. Slugs are
// immutable; callers merge partial patches with the current row first.
func (s *Store) UpdateModel(ctx context.Context, id int64, update ModelUpdate) (Model, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE models SET name = ?, vendor = ?, notes = ?, hidden = ?, commentary = ?, commentary_public = ?, commentary_at = ?, updated_at = ? WHERE id = ?`,
		update.Name, update.Vendor, update.Notes, update.Hidden, update.Commentary, update.CommentaryPublic, update.CommentaryAt, nowStamp(), id)
	if err != nil {
		return Model{}, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return Model{}, err
	}
	if affected == 0 {
		return Model{}, ErrNotFound
	}
	return s.modelByID(ctx, id)
}

// SetModelArchived archives or restores a model.
func (s *Store) SetModelArchived(ctx context.Context, id int64, archived bool) (Model, error) {
	var archivedAt sql.NullString
	if archived {
		archivedAt = sql.NullString{String: nowStamp(), Valid: true}
	}
	res, err := s.db.ExecContext(ctx, `UPDATE models SET archived_at = ?, updated_at = ? WHERE id = ?`,
		archivedAt, nowStamp(), id)
	if err != nil {
		return Model{}, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return Model{}, err
	}
	if affected == 0 {
		return Model{}, ErrNotFound
	}
	return s.modelByID(ctx, id)
}

// DeleteModel permanently removes a model and cascades its scores and texts.
func (s *Store) DeleteModel(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM models WHERE id = ?`, id)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}
