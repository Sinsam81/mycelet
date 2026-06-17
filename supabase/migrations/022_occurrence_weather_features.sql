-- 022: occurrence_weather_features
--
-- Historical weather-at-find-time feature cache for GBIF/Artsdatabanken
-- occurrence rows. This is the missing foundation for validating/training the
-- weather response honestly; today's live weather must not be used as a proxy
-- for old finds.
--
-- Populated by scripts/build-occurrence-weather-features.mjs via the service
-- role. Kept private because it is an internal modelling table, not a public
-- product API.

CREATE TABLE IF NOT EXISTS occurrence_weather_features (
  occurrence_id BIGINT PRIMARY KEY REFERENCES species_occurrences(id) ON DELETE CASCADE,
  species_id INT REFERENCES mushroom_species(id) ON DELETE SET NULL,
  observed_at DATE NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  region TEXT NOT NULL CHECK (region IN ('NO', 'SE', 'other')),
  provider TEXT NOT NULL CHECK (provider IN ('met_frost', 'smhi', 'unavailable')),

  temperature_c DOUBLE PRECISION,
  humidity_pct DOUBLE PRECISION CHECK (humidity_pct IS NULL OR (humidity_pct BETWEEN 0 AND 100)),
  rain_3d_mm DOUBLE PRECISION CHECK (rain_3d_mm IS NULL OR rain_3d_mm >= 0),
  rain_7d_mm DOUBLE PRECISION CHECK (rain_7d_mm IS NULL OR rain_7d_mm >= 0),
  rain_14d_mm DOUBLE PRECISION CHECK (rain_14d_mm IS NULL OR rain_14d_mm >= 0),
  min_temp_7d_c DOUBLE PRECISION,
  max_temp_7d_c DOUBLE PRECISION,
  soil_moisture_index DOUBLE PRECISION CHECK (
    soil_moisture_index IS NULL OR (soil_moisture_index BETWEEN 0 AND 1)
  ),

  source_station_ids TEXT[] NOT NULL DEFAULT '{}',
  error TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS occurrence_weather_features_species_idx
  ON occurrence_weather_features (species_id);

CREATE INDEX IF NOT EXISTS occurrence_weather_features_observed_idx
  ON occurrence_weather_features (observed_at);

CREATE INDEX IF NOT EXISTS occurrence_weather_features_region_idx
  ON occurrence_weather_features (region);

CREATE INDEX IF NOT EXISTS occurrence_weather_features_provider_idx
  ON occurrence_weather_features (provider);

ALTER TABLE occurrence_weather_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages occurrence weather features" ON occurrence_weather_features;
CREATE POLICY "Service role manages occurrence weather features"
  ON occurrence_weather_features
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON occurrence_weather_features TO service_role;

COMMENT ON TABLE occurrence_weather_features IS
  'Historical weather features at species_occurrences.observed_at, used for prediction-model validation/training.';
