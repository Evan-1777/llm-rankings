package store

import (
	"context"
	"database/sql"
	"errors"
)

// DisplaySettings is the site-wide singleton of display preferences.
type DisplaySettings struct {
	ScorePercentageMode bool
	MaintenanceMode     bool
}

// DisplaySettings returns the site-wide preferences. A missing singleton row
// is the default (all switches off), not an error.
func (s *Store) DisplaySettings(ctx context.Context) (DisplaySettings, error) {
	var percentage, maintenance int
	err := s.db.QueryRowContext(ctx, `SELECT score_percentage_mode, maintenance_mode FROM display_settings WHERE id = 1`).Scan(&percentage, &maintenance)
	if errors.Is(err, sql.ErrNoRows) {
		return DisplaySettings{}, nil
	}
	if err != nil {
		return DisplaySettings{}, err
	}
	return DisplaySettings{
		ScorePercentageMode: percentage == 1,
		MaintenanceMode:     maintenance == 1,
	}, nil
}

// UpdateDisplaySettings creates the singleton row on first write.
func (s *Store) UpdateDisplaySettings(ctx context.Context, settings DisplaySettings) error {
	percentage, maintenance := 0, 0
	if settings.ScorePercentageMode {
		percentage = 1
	}
	if settings.MaintenanceMode {
		maintenance = 1
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO display_settings (id, score_percentage_mode, maintenance_mode) VALUES (1, ?, ?)
		ON CONFLICT(id) DO UPDATE SET score_percentage_mode = excluded.score_percentage_mode, maintenance_mode = excluded.maintenance_mode`,
		percentage, maintenance)
	return err
}
