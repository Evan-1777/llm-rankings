package store

import (
	"context"
	"database/sql"
	"errors"
)

// DisplaySettings returns the site-wide percentage mode. A missing singleton
// row is the default (off), not an error.
func (s *Store) DisplaySettings(ctx context.Context) (bool, error) {
	var enabled int
	err := s.db.QueryRowContext(ctx, `SELECT score_percentage_mode FROM display_settings WHERE id = 1`).Scan(&enabled)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return enabled == 1, nil
}

// UpdateDisplaySettings creates the singleton row on first write.
func (s *Store) UpdateDisplaySettings(ctx context.Context, enabled bool) error {
	value := 0
	if enabled {
		value = 1
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO display_settings (id, score_percentage_mode) VALUES (1, ?)
		ON CONFLICT(id) DO UPDATE SET score_percentage_mode = excluded.score_percentage_mode`, value)
	return err
}
