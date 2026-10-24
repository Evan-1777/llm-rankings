package store

import (
	"context"
	"database/sql"
	"errors"
)

// DisplaySettings is the site-wide singleton of display preferences.
type DisplaySettings struct {
	ScorePercentageMode    bool
	ScorePercentageMaxMode bool
	MaintenanceMode        bool
	RankingNotes           string
}

// DisplaySettings returns the site-wide preferences. A missing singleton row
// is the default (all switches off), not an error.
func (s *Store) DisplaySettings(ctx context.Context) (DisplaySettings, error) {
	var percentage, percentageMax, maintenance int
	var notes string
	err := s.db.QueryRowContext(ctx, `SELECT score_percentage_mode, score_percentage_max_mode, maintenance_mode, ranking_notes FROM display_settings WHERE id = 1`).Scan(&percentage, &percentageMax, &maintenance, &notes)
	if errors.Is(err, sql.ErrNoRows) {
		return DisplaySettings{}, nil
	}
	if err != nil {
		return DisplaySettings{}, err
	}
	return DisplaySettings{
		ScorePercentageMode:    percentage == 1,
		ScorePercentageMaxMode: percentageMax == 1,
		MaintenanceMode:        maintenance == 1,
		RankingNotes:           notes,
	}, nil
}

// UpdateDisplaySettings creates the singleton row on first write.
func (s *Store) UpdateDisplaySettings(ctx context.Context, settings DisplaySettings) error {
	percentage, percentageMax, maintenance := 0, 0, 0
	if settings.ScorePercentageMode {
		percentage = 1
	}
	if settings.ScorePercentageMaxMode {
		percentageMax = 1
	}
	if settings.MaintenanceMode {
		maintenance = 1
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO display_settings (id, score_percentage_mode, score_percentage_max_mode, maintenance_mode, ranking_notes) VALUES (1, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET score_percentage_mode = excluded.score_percentage_mode,
			score_percentage_max_mode = excluded.score_percentage_max_mode,
			maintenance_mode = excluded.maintenance_mode,
			ranking_notes = excluded.ranking_notes`,
		percentage, percentageMax, maintenance, settings.RankingNotes)
	return err
}
