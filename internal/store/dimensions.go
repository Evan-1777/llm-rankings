package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Dimension is a scoring axis with its single global weight.
type Dimension struct {
	ID          int64
	Name        string
	Description string
	Weight      int
	ArchivedAt  *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// ListDimensions returns dimensions ordered by id, optionally including archived ones.
func (s *Store) ListDimensions(ctx context.Context, includeArchived bool) ([]Dimension, error) {
	query := `SELECT id, name, description, weight, archived_at, created_at, updated_at FROM dimensions`
	if !includeArchived {
		query += ` WHERE archived_at IS NULL`
	}
	query += ` ORDER BY id`
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
	if err := row.Scan(&d.ID, &d.Name, &d.Description, &d.Weight, &archived, &created, &updated); err != nil {
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
	row := s.db.QueryRowContext(ctx, `SELECT id, name, description, weight, archived_at, created_at, updated_at FROM dimensions WHERE id = ?`, id)
	d, err := scanDimension(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Dimension{}, ErrNotFound
	}
	return d, err
}

// CreateDimension inserts a dimension.
func (s *Store) CreateDimension(ctx context.Context, name, description string, weight int) (Dimension, error) {
	now := nowStamp()
	res, err := s.db.ExecContext(ctx, `INSERT INTO dimensions (name, description, weight, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		name, description, weight, now, now)
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
func (s *Store) UpdateDimension(ctx context.Context, id int64, name, description string, weight int) (Dimension, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE dimensions SET name = ?, description = ?, weight = ?, updated_at = ? WHERE id = ?`,
		name, description, weight, nowStamp(), id)
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
