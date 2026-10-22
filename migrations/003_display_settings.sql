CREATE TABLE display_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    score_percentage_mode INTEGER NOT NULL DEFAULT 0 CHECK (score_percentage_mode IN (0, 1))
);
