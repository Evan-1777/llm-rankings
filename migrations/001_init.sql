CREATE TABLE dimensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    weight INTEGER NOT NULL CHECK (weight BETWEEN 0 AND 100),
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL,
    vendor TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE scores (
    model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    dimension_id INTEGER NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
    value REAL NOT NULL CHECK (value >= 0),
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (model_id, dimension_id)
);

CREATE INDEX idx_scores_dimension_id ON scores(dimension_id);
