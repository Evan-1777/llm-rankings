package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Model is a model profile. Notes are private to the administrator.
type Model struct {
	ID        int64
	Slug      string
	Name      string
	Vendor    string
	Notes     string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ModelSummary adds score count for management lists.
type ModelSummary struct {
	Model
	ScoreCount int
}

// ListModels returns models ordered by name.
func (s *Store) ListModels(ctx context.Context) ([]ModelSummary, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT m.id, m.slug, m.name, m.vendor, m.notes, m.created_at, m.updated_at, COUNT(sc.model_id)
		FROM models m LEFT JOIN scores sc ON sc.model_id = m.id
		GROUP BY m.id ORDER BY m.name COLLATE NOCASE, m.slug`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ModelSummary
	for rows.Next() {
		var m ModelSummary
		var created, updated string
		if err := rows.Scan(&m.ID, &m.Slug, &m.Name, &m.Vendor, &m.Notes, &created, &updated, &m.ScoreCount); err != nil {
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

// ModelBySlug looks up a model case-insensitively.
func (s *Store) ModelBySlug(ctx context.Context, slug string) (Model, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, slug, name, vendor, notes, created_at, updated_at FROM models WHERE slug = ? COLLATE NOCASE`, slug)
	var m Model
	var created, updated string
	err := row.Scan(&m.ID, &m.Slug, &m.Name, &m.Vendor, &m.Notes, &created, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return Model{}, ErrNotFound
	}
	if err != nil {
		return Model{}, err
	}
	if m.CreatedAt, err = parseStamp(created); err != nil {
		return Model{}, err
	}
	if m.UpdatedAt, err = parseStamp(updated); err != nil {
		return Model{}, err
	}
	return m, nil
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

// UpdateModel updates the editable profile fields. Slugs are immutable.
func (s *Store) UpdateModel(ctx context.Context, id int64, name, vendor, notes string) (Model, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE models SET name = ?, vendor = ?, notes = ?, updated_at = ? WHERE id = ?`,
		name, vendor, notes, nowStamp(), id)
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
	row := s.db.QueryRowContext(ctx, `SELECT id, slug, name, vendor, notes, created_at, updated_at FROM models WHERE id = ?`, id)
	var m Model
	var created, updated string
	if err := row.Scan(&m.ID, &m.Slug, &m.Name, &m.Vendor, &m.Notes, &created, &updated); err != nil {
		return Model{}, err
	}
	if m.CreatedAt, err = parseStamp(created); err != nil {
		return Model{}, err
	}
	if m.UpdatedAt, err = parseStamp(updated); err != nil {
		return Model{}, err
	}
	return m, nil
}

// DeleteModel permanently removes a model and cascades its scores.
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
