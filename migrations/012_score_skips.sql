CREATE TABLE score_skips (
    model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    dimension_id INTEGER NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (model_id, dimension_id)
);

CREATE INDEX idx_score_skips_dimension_id ON score_skips(dimension_id);
