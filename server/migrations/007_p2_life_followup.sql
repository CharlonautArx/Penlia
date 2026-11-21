ALTER TABLE p2_items ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '';
ALTER TABLE p2_items DROP CONSTRAINT IF EXISTS p2_items_check;
ALTER TABLE p2_items DROP CONSTRAINT IF EXISTS p2_items_coordinates;
ALTER TABLE p2_items ADD CONSTRAINT p2_items_coordinates CHECK (
  (latitude IS NULL AND longitude IS NULL) OR
  (kind='place' AND latitude IS NOT NULL AND longitude IS NOT NULL
    AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);
