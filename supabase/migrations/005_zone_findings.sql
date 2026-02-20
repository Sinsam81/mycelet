-- ============================================
-- Migration 005: Zone findings (hemmeligsted-vennlig deling)
-- ============================================

ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS is_zone_finding BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS zone_label TEXT,
  ADD COLUMN IF NOT EXISTS zone_precision_km INT NOT NULL DEFAULT 5 CHECK (zone_precision_km BETWEEN 1 AND 50);

CREATE OR REPLACE FUNCTION set_display_location()
RETURNS TRIGGER AS $$
DECLARE
  result RECORD;
  grid_lat DOUBLE PRECISION;
  grid_lng DOUBLE PRECISION;
BEGIN
  IF NEW.visibility = 'private' THEN
    NEW.display_latitude := NULL;
    NEW.display_longitude := NULL;
    RETURN NEW;
  END IF;

  IF NEW.is_zone_finding = TRUE THEN
    -- Del posisjon på sone-nivå: snap til grid i stedet for tilfeldig offset.
    grid_lat := GREATEST(NEW.zone_precision_km, 1) / 111.32;
    grid_lng := GREATEST(NEW.zone_precision_km, 1) / (111.32 * GREATEST(cos(radians(NEW.latitude)), 0.2));
    NEW.display_latitude := round(NEW.latitude / grid_lat) * grid_lat;
    NEW.display_longitude := round(NEW.longitude / grid_lng) * grid_lng;
    RETURN NEW;
  END IF;

  IF NEW.visibility = 'approximate' THEN
    SELECT * INTO result FROM randomize_location(NEW.latitude, NEW.longitude);
    NEW.display_latitude := result.rand_lat;
    NEW.display_longitude := result.rand_lng;
  ELSE
    NEW.display_latitude := NEW.latitude;
    NEW.display_longitude := NEW.longitude;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE VIEW public_findings AS
SELECT
  f.id,
  f.user_id,
  p.username,
  p.avatar_url,
  f.species_id,
  ms.norwegian_name,
  ms.latin_name,
  ms.edibility,
  CASE
    WHEN f.visibility = 'public' AND f.is_zone_finding = false THEN f.latitude
    WHEN f.visibility IN ('public', 'approximate') THEN f.display_latitude
    ELSE NULL
  END as display_lat,
  CASE
    WHEN f.visibility = 'public' AND f.is_zone_finding = false THEN f.longitude
    WHEN f.visibility IN ('public', 'approximate') THEN f.display_longitude
    ELSE NULL
  END as display_lng,
  f.thumbnail_url,
  f.verification_status,
  f.found_at,
  f.quantity,
  f.notes,
  f.is_zone_finding,
  f.zone_label,
  f.zone_precision_km
FROM findings f
JOIN profiles p ON f.user_id = p.id
LEFT JOIN mushroom_species ms ON f.species_id = ms.id
WHERE f.visibility IN ('public', 'approximate');
