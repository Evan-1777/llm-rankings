package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// DimensionText is one model's free-form text for a text dimension.
type DimensionText struct {
	ModelID     int64
	DimensionID int64
	Content     string
	UpdatedAt   time.Time
}

// TextsForModel returns the stored text of every text dimension for a model.
func (s *Store) TextsForModel(ctx context.Context, modelID int64) (map[int64]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT dimension_id, content FROM dimension_texts WHERE model_id = ?`, modelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]string{}
	for rows.Next() {
		var dimensionID int64
		var content string
		if err := rows.Scan(&dimensionID, &content); err != nil {
			return nil, err
		}
		out[dimensionID] = content
	}
	return out, rows.Err()
}

// AllTexts returns every stored text, used by export.
func (s *Store) AllTexts(ctx context.Context) ([]DimensionText, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT model_id, dimension_id, content, updated_at FROM dimension_texts ORDER BY model_id, dimension_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DimensionText
	for rows.Next() {
		var text DimensionText
		var updated string
		if err := rows.Scan(&text.ModelID, &text.DimensionID, &text.Content, &updated); err != nil {
			return nil, err
		}
		if text.UpdatedAt, err = parseStamp(updated); err != nil {
			return nil, err
		}
		out = append(out, text)
	}
	return out, rows.Err()
}

// SetDimensionText writes a model's text for a text dimension. Empty content
// removes the record. Archived models, dimensions and numeric dimensions are
// rejected.
func (s *Store) SetDimensionText(ctx context.Context, modelSlug string, dimensionID int64, content string) error {
	var modelID int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM models WHERE slug = ? COLLATE NOCASE AND archived_at IS NULL`, modelSlug).Scan(&modelID)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	var archived sql.NullString
	var textMode bool
	err = s.db.QueryRowContext(ctx, `SELECT archived_at, text_mode FROM dimensions WHERE id = ?`, dimensionID).Scan(&archived, &textMode)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	// Archived dimensions are treated as missing by the text endpoint so a
	// stale editor cannot resurrect text on a retired dimension.
	if archived.Valid {
		return ErrNotFound
	}
	if !textMode {
		return ErrNumericDimension
	}

	if content == "" {
		_, err = s.db.ExecContext(ctx, `DELETE FROM dimension_texts WHERE model_id = ? AND dimension_id = ?`, modelID, dimensionID)
		return err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO dimension_texts (model_id, dimension_id, content, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(model_id, dimension_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
		modelID, dimensionID, content, nowStamp())
	return err
}
