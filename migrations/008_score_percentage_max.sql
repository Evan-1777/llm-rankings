ALTER TABLE display_settings ADD COLUMN score_percentage_max_mode INTEGER NOT NULL DEFAULT 0 CHECK (score_percentage_max_mode IN (0, 1));
