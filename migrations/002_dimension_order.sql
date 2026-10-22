ALTER TABLE dimensions ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

UPDATE dimensions SET position = id;
