// Package store owns the SQLite schema, queries and transaction boundaries.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"llmrank/migrations"

	_ "modernc.org/sqlite"
)

// Sentinel errors mapped to HTTP responses by the api package.
var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
	ErrArchived = errors.New("dimension is archived")
	ErrInvalid  = errors.New("invalid value")
	// ErrOrderMismatch means a reorder payload is not the current dimension set.
	ErrOrderMismatch = errors.New("dimension order mismatch")
)

const timeLayout = "2006-01-02T15:04:05.000000000Z07:00"

// Store is a handle to the SQLite database.
type Store struct {
	db *sql.DB
}

// Open opens the database, applies pending migrations and returns a store.
func Open(path string) (*Store, error) {
	dsn := "file:" + path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	// ponytail: one connection keeps SQLite write contention out of the picture;
	// a pool only matters if this personal service ever needs concurrent writers.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	if err := migrate(context.Background(), db); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

// Close closes the underlying database.
func (s *Store) Close() error { return s.db.Close() }

func migrate(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version TEXT PRIMARY KEY,
		applied_at TEXT NOT NULL
	)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	entries, err := fs.ReadDir(migrations.FS, ".")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var applied int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, name).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if applied > 0 {
			continue
		}
		body, err := migrations.FS.ReadFile(name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx, string(body)); err != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, name, nowStamp()); err != nil {
			tx.Rollback()
			return fmt.Errorf("record migration %s: %w", name, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", name, err)
		}
	}
	return nil
}

func nowStamp() string { return time.Now().UTC().Format(timeLayout) }

func parseStamp(raw string) (time.Time, error) {
	return time.Parse(timeLayout, raw)
}

func stampOrNil(raw sql.NullString) (*time.Time, error) {
	if !raw.Valid || raw.String == "" {
		return nil, nil
	}
	t, err := parseStamp(raw.String)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func isUnique(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "unique constraint")
}

func isForeignKey(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "foreign key constraint")
}

type rowScanner interface {
	Scan(dest ...any) error
}

// Counts is the small summary used by the bootstrap response.
type Counts struct {
	Models       int
	Dimensions   int
	ScoredModels int
}

// MaxUpdatedAt returns the newest model or score timestamp, or nil when empty.
func (s *Store) MaxUpdatedAt(ctx context.Context) (*time.Time, error) {
	var modelMax, scoreMax sql.NullString
	if err := s.db.QueryRowContext(ctx, `SELECT MAX(updated_at) FROM models`).Scan(&modelMax); err != nil {
		return nil, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT MAX(updated_at) FROM scores`).Scan(&scoreMax); err != nil {
		return nil, err
	}
	var newest *time.Time
	for _, raw := range []sql.NullString{modelMax, scoreMax} {
		t, err := stampOrNil(raw)
		if err != nil {
			return nil, err
		}
		if t != nil && (newest == nil || t.After(*newest)) {
			newest = t
		}
	}
	return newest, nil
}

// Counts returns model, enabled-dimension and scored-model counts.
func (s *Store) Counts(ctx context.Context) (Counts, error) {
	var c Counts
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM models`).Scan(&c.Models); err != nil {
		return c, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM dimensions WHERE archived_at IS NULL`).Scan(&c.Dimensions); err != nil {
		return c, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT s.model_id)
		FROM scores s JOIN dimensions d ON d.id = s.dimension_id
		WHERE d.archived_at IS NULL AND d.weight > 0`).Scan(&c.ScoredModels); err != nil {
		return c, err
	}
	return c, nil
}
