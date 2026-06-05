-- 013_species_occurrences.sql
-- Real-world fungi occurrence records (GBIF / Artsdatabanken) used as an
-- "observasjoner nær her" signal in the prediction, and for validation.
--
-- Public reference data (open biodiversity records) — readable by everyone,
-- written only by the service role (the ingestion script). Depends on PostGIS
-- (extension created in 001).

CREATE TABLE IF NOT EXISTS species_occurrences (
  id BIGSERIAL PRIMARY KEY,
  -- GBIF occurrence key; unique so re-running the import is idempotent.
  gbif_key BIGINT UNIQUE,
  species_id INT REFERENCES mushroom_species(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  observed_at DATE,
  source TEXT NOT NULL DEFAULT 'gbif',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_occurrences_species ON species_occurrences(species_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_species_lat_lng ON species_occurrences(species_id, latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_occurrences_geo ON species_occurrences
  USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

ALTER TABLE species_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Funndata er synlige for alle" ON species_occurrences;
CREATE POLICY "Funndata er synlige for alle" ON species_occurrences FOR SELECT USING (true);

-- Occurrences inside a bounding box, optionally filtered to one species.
-- The route fetches once for the visible bounds, then buckets per cell in JS.
CREATE OR REPLACE FUNCTION get_occurrences_in_bounds(
  min_lat DOUBLE PRECISION,
  min_lng DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  max_lng DOUBLE PRECISION,
  p_species_id INT DEFAULT NULL,
  p_limit INT DEFAULT 4000
)
RETURNS TABLE (latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, species_id INT) AS $$
BEGIN
  RETURN QUERY
  SELECT so.latitude, so.longitude, so.species_id
  FROM species_occurrences so
  WHERE so.latitude BETWEEN min_lat AND max_lat
    AND so.longitude BETWEEN min_lng AND max_lng
    AND (p_species_id IS NULL OR so.species_id = p_species_id)
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT SELECT ON species_occurrences TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE species_occurrences_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION get_occurrences_in_bounds(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT
) TO anon, authenticated, service_role;
