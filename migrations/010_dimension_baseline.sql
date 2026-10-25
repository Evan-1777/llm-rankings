ALTER TABLE dimensions ADD COLUMN baseline_max REAL CHECK (baseline_max IS NULL OR baseline_max > 0);
