ALTER TABLE models ADD COLUMN commentary TEXT NOT NULL DEFAULT '';

ALTER TABLE models ADD COLUMN commentary_public INTEGER NOT NULL DEFAULT 0 CHECK (commentary_public IN (0, 1));

ALTER TABLE models ADD COLUMN commentary_at TEXT NOT NULL DEFAULT '';
