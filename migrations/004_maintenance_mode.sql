ALTER TABLE display_settings ADD COLUMN maintenance_mode INTEGER NOT NULL DEFAULT 0 CHECK (maintenance_mode IN (0, 1));
