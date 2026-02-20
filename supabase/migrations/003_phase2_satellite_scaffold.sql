-- ============================================
-- Migration 003: Phase 2 Satellite Scaffold
-- ============================================

CREATE TABLE IF NOT EXISTS prediction_tiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tile_date DATE NOT NULL,
  species_id INT REFERENCES mushroom_species(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'mvp_baseline'
    CHECK (source IN ('mvp_baseline', 'sentinel_batch', 'hybrid')),
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  radius_meters INT NOT NULL DEFAULT 500 CHECK (radius_meters > 0),
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  confidence INT CHECK (confidence BETWEEN 0 AND 100),
  components JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER prediction_tiles_updated_at
  BEFORE UPDATE ON prediction_tiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_prediction_tiles_date ON prediction_tiles(tile_date DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_tiles_species_date ON prediction_tiles(species_id, tile_date DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_tiles_score ON prediction_tiles(score DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_tiles_geo ON prediction_tiles
  USING GIST (ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326));

ALTER TABLE prediction_tiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Prediction tiles er synlige for alle" ON prediction_tiles
  FOR SELECT USING (true);

CREATE POLICY "Kun service role kan skrive prediction tiles" ON prediction_tiles
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION get_prediction_tiles_in_bounds(
  min_lat DOUBLE PRECISION,
  min_lng DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  max_lng DOUBLE PRECISION,
  p_tile_date DATE DEFAULT CURRENT_DATE,
  p_species_id INT DEFAULT NULL
)
RETURNS SETOF prediction_tiles AS $$
BEGIN
  RETURN QUERY
  SELECT pt.*
  FROM prediction_tiles pt
  WHERE pt.center_lat BETWEEN min_lat AND max_lat
    AND pt.center_lng BETWEEN min_lng AND max_lng
    AND pt.tile_date = p_tile_date
    AND (p_species_id IS NULL OR pt.species_id = p_species_id)
  ORDER BY pt.score DESC
  LIMIT 2000;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
