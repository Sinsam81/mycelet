-- 014_occurrences_observed_at.sql
-- Surface each occurrence's find date on the map ("Registrert funn · sep. 2021")
-- for credibility. Adds observed_at to the bounds RPC's result.
--
-- A return-type change can't be done with CREATE OR REPLACE, so we DROP the
-- function first, then recreate it with the extra column and re-grant EXECUTE.
-- Idempotent: safe to paste-and-run again. Adding a column is backward
-- compatible — existing callers (grid + species-spots routes) read by name and
-- simply ignore the new field.

DROP FUNCTION IF EXISTS get_occurrences_in_bounds(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT
);

CREATE OR REPLACE FUNCTION get_occurrences_in_bounds(
  min_lat DOUBLE PRECISION,
  min_lng DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  max_lng DOUBLE PRECISION,
  p_species_id INT DEFAULT NULL,
  p_limit INT DEFAULT 4000
)
RETURNS TABLE (
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  species_id INT,
  observed_at DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT so.latitude, so.longitude, so.species_id, so.observed_at
  FROM species_occurrences so
  WHERE so.latitude BETWEEN min_lat AND max_lat
    AND so.longitude BETWEEN min_lng AND max_lng
    AND (p_species_id IS NULL OR so.species_id = p_species_id)
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_occurrences_in_bounds(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT
) TO anon, authenticated, service_role;
