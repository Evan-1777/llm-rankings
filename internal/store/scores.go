package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"time"
)

// Score is one model × dimension rating.
type Score struct {
	ModelID     int64
	DimensionID int64
	Value       float64
	Note        string
	UpdatedAt   time.Time
}

// ScoresForModel returns every stored score for a model.
func (s *Store) ScoresForModel(ctx context.Context, modelID int64) ([]Score, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT model_id, dimension_id, value, note, updated_at FROM scores WHERE model_id = ? ORDER BY dimension_id`, modelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Score
	for rows.Next() {
		var sc Score
		var updated string
		if err := rows.Scan(&sc.ModelID, &sc.DimensionID, &sc.Value, &sc.Note, &updated); err != nil {
			return nil, err
		}
		if sc.UpdatedAt, err = parseStamp(updated); err != nil {
			return nil, err
		}
		out = append(out, sc)
	}
	return out, rows.Err()
}

// AllScores returns every score, used by rankings and export.
func (s *Store) AllScores(ctx context.Context) ([]Score, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT model_id, dimension_id, value, note, updated_at FROM scores ORDER BY model_id, dimension_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Score
	for rows.Next() {
		var sc Score
		var updated string
		if err := rows.Scan(&sc.ModelID, &sc.DimensionID, &sc.Value, &sc.Note, &updated); err != nil {
			return nil, err
		}
		if sc.UpdatedAt, err = parseStamp(updated); err != nil {
			return nil, err
		}
		out = append(out, sc)
	}
	return out, rows.Err()
}

// UpsertScore writes a rating for an enabled dimension.
func (s *Store) UpsertScore(ctx context.Context, modelSlug string, dimensionID int64, value float64, note string) (Score, error) {
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
		return Score{}, fmt.Errorf("%w: score must be finite and not negative", ErrInvalid)
	}
	value = math.Round(value*10) / 10

	var modelID int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM models WHERE slug = ? COLLATE NOCASE`, modelSlug).Scan(&modelID)
	if errors.Is(err, sql.ErrNoRows) {
		return Score{}, ErrNotFound
	}
	if err != nil {
		return Score{}, err
	}

	var archived sql.NullString
	err = s.db.QueryRowContext(ctx, `SELECT archived_at FROM dimensions WHERE id = ?`, dimensionID).Scan(&archived)
	if errors.Is(err, sql.ErrNoRows) {
		return Score{}, ErrNotFound
	}
	if err != nil {
		return Score{}, err
	}
	if archived.Valid {
		return Score{}, ErrArchived
	}

	now := nowStamp()
	_, err = s.db.ExecContext(ctx, `INSERT INTO scores (model_id, dimension_id, value, note, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(model_id, dimension_id) DO UPDATE SET value = excluded.value, note = excluded.note, updated_at = excluded.updated_at`,
		modelID, dimensionID, value, note, now)
	if err != nil {
		if isForeignKey(err) {
			return Score{}, ErrNotFound
		}
		return Score{}, err
	}
	updated, err := parseStamp(now)
	if err != nil {
		return Score{}, err
	}
	return Score{ModelID: modelID, DimensionID: dimensionID, Value: value, Note: note, UpdatedAt: updated}, nil
}

// DeleteScore removes a model's rating for one dimension.
func (s *Store) DeleteScore(ctx context.Context, modelSlug string, dimensionID int64) error {
	var modelID int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM models WHERE slug = ? COLLATE NOCASE`, modelSlug).Scan(&modelID)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx, `DELETE FROM scores WHERE model_id = ? AND dimension_id = ?`, modelID, dimensionID)
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
