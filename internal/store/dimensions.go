package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Dimension is a scoring axis with its single global weight. A text dimension
// stores free-form text per model instead of a numeric score and has weight 0.
type Dimension struct {
	ID          int64
	Name        string
	Description string
	Weight      int
	TextMode    bool
	Position    int
	ArchivedAt  *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// dimensionColumns is the shared SELECT and Scan order for every dimension read.
const dimensionColumns = "id, name, description, weight, text_mode, position, archived_at, created_at, updated_at"

// ListDimensions returns dimensions in display order, optionally including archived ones.
func (s *Store) ListDimensions(ctx context.Context, includeArchived bool) ([]Dimension, error) {
	query := `SELECT ` + dimensionColumns + ` FROM dimensions`
	if !includeArchived {
		query += ` WHERE archived_at IS NULL`
	}
	query += ` ORDER BY position, id`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Dimension
	for rows.Next() {
		d, err := scanDimension(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func scanDimension(row rowScanner) (Dimension, error) {
	var d Dimension
	var archived sql.NullString
	var created, updated string
	if err := row.Scan(&d.ID, &d.Name, &d.Description, &d.Weight, &d.TextMode, &d.Position, &archived, &created, &updated); err != nil {
		return d, err
	}
	var err error
	if d.ArchivedAt, err = stampOrNil(archived); err != nil {
		return d, err
	}
	if d.CreatedAt, err = parseStamp(created); err != nil {
		return d, err
	}
	if d.UpdatedAt, err = parseStamp(updated); err != nil {
		return d, err
	}
	return d, nil
}

// DimensionByID returns one dimension.
func (s *Store) DimensionByID(ctx context.Context, id int64) (Dimension, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+dimensionColumns+` FROM dimensions WHERE id = ?`, id)
	d, err := scanDimension(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Dimension{}, ErrNotFound
	}
	return d, err
}

// CreateDimension inserts a dimension.
func (s *Store) CreateDimension(ctx context.Context, name, description string, weight int, textMode bool) (Dimension, error) {
	now := nowStamp()
	res, err := s.db.ExecContext(ctx, `INSERT INTO dimensions (name, description, weight, text_mode, position, created_at, updated_at)
		VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM dimensions), ?, ?)`,
		name, description, weight, textMode, now, now)
	if err != nil {
		if isUnique(err) {
			return Dimension{}, ErrConflict
		}
		return Dimension{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Dimension{}, err
	}
	return s.DimensionByID(ctx, id)
}

// UpdateDimension replaces the editable fields of a dimension.
func (s *Store) UpdateDimension(ctx context.Context, id int64, name, description string, weight int, textMode bool) (Dimension, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE dimensions SET name = ?, description = ?, weight = ?, text_mode = ?, updated_at = ? WHERE id = ?`,
		name, description, weight, textMode, nowStamp(), id)
	if err != nil {
		if isUnique(err) {
			return Dimension{}, ErrConflict
		}
		return Dimension{}, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return Dimension{}, err
	}
	if affected == 0 {
		return Dimension{}, ErrNotFound
	}
	return s.DimensionByID(ctx, id)
}

// SetDimensionArchived archives or restores a dimension.
func (s *Store) SetDimensionArchived(ctx context.Context, id int64, archived bool) (Dimension, error) {
	var archivedAt sql.NullString
	if archived {
		archivedAt = sql.NullString{String: nowStamp(), Valid: true}
	}
	res, err := s.db.ExecContext(ctx, `UPDATE dimensions SET archived_at = ?, updated_at = ? WHERE id = ?`,
		archivedAt, nowStamp(), id)
	if err != nil {
		return Dimension{}, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return Dimension{}, err
	}
	if affected == 0 {
		return Dimension{}, ErrNotFound
	}
	return s.DimensionByID(ctx, id)
}

// DeleteDimension permanently removes a dimension and cascades its scores.
func (s *Store) DeleteDimension(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM dimensions WHERE id = ?`, id)
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

// ReorderDimensions replaces the display order with a complete permutation of ids.
func (s *Store) ReorderDimensions(ctx context.Context, ids []int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	rows, err := tx.QueryContext(ctx, `SELECT id FROM dimensions`)
	if err != nil {
		return err
	}
	current := make(map[int64]bool)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		current[id] = true
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	if len(ids) != len(current) {
		return ErrOrderMismatch
	}
	seen := make(map[int64]bool, len(ids))
	for _, id := range ids {
		if !current[id] || seen[id] {
			return ErrOrderMismatch
		}
		seen[id] = true
	}

	now := nowStamp()
	for index, id := range ids {
		if _, err := tx.ExecContext(ctx, `UPDATE dimensions SET position = ?, updated_at = ? WHERE id = ?`, index+1, now, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}
