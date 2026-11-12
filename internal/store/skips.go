package store

import (
	"context"
	"database/sql"
	"errors"
)

// Skip records that a dimension does not apply to a model. The composite score
// imputes the dimension's 60th-percentile value instead of a stored rating.
type Skip struct {
	ModelID     int64
	DimensionID int64
}

// SetSkip marks a dimension as skipped for a model. Repeating it is a no-op.
func (s *Store) SetSkip(ctx context.Context, modelSlug string, dimensionID int64) error {
	modelID, err := s.resolveRatingTarget(ctx, modelSlug, dimensionID)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO score_skips (model_id, dimension_id, created_at)
		VALUES (?, ?, ?)
		ON CONFLICT(model_id, dimension_id) DO NOTHING`, modelID, dimensionID, nowStamp())
	if err != nil && isForeignKey(err) {
		return ErrNotFound
	}
	return err
}

// DeleteSkip clears a model's skip. A missing skip is not an error so retried
// saves can converge.
func (s *Store) DeleteSkip(ctx context.Context, modelSlug string, dimensionID int64) error {
	var modelID int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM models WHERE slug = ? COLLATE NOCASE AND archived_at IS NULL`, modelSlug).Scan(&modelID)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM score_skips WHERE model_id = ? AND dimension_id = ?`, modelID, dimensionID)
	return err
}

// AllSkips returns every skip, used by rankings and export.
func (s *Store) AllSkips(ctx context.Context) ([]Skip, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT model_id, dimension_id FROM score_skips ORDER BY model_id, dimension_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Skip{}
	for rows.Next() {
		var skip Skip
		if err := rows.Scan(&skip.ModelID, &skip.DimensionID); err != nil {
			return nil, err
		}
		out = append(out, skip)
	}
	return out, rows.Err()
}

// SkipsForModel returns the skipped dimension ids of one model.
func (s *Store) SkipsForModel(ctx context.Context, modelID int64) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT dimension_id FROM score_skips WHERE model_id = ? ORDER BY dimension_id`, modelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
