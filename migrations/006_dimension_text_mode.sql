ALTER TABLE dimensions ADD COLUMN text_mode INTEGER NOT NULL DEFAULT 0 CHECK (text_mode IN (0, 1));

CREATE TABLE dimension_texts (
    model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    dimension_id INTEGER NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (model_id, dimension_id)
);

CREATE INDEX idx_dimension_texts_dimension_id ON dimension_texts(dimension_id);
