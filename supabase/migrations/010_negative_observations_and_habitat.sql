-- ============================================
-- Migration 010: Negative observations + habitat tagging on findings
-- ============================================
--
-- Backbone for the prediction feedback loop documented in docs/roadmap.md
-- ("Feedback-loop = forretningsmodellen"). Building this BEFORE beta means
-- the data model is right from day one — every find/no-find a user logs
-- becomes ML training data without retroactive cleanup.
--
-- Four new columns on `findings`:
--
--   1. is_negative_observation BOOLEAN
--      TRUE means "I went here and didn't find what I was looking for".
--      As valuable to the model as positive finds — negative space is
--      where most of the country actually is.
--
--      species_id is already nullable (no NOT NULL constraint), so:
--        - is_negative_observation = TRUE + species_id NULL  → "no
--          mushrooms found at all here today"
--        - is_negative_observation = TRUE + species_id = X   → "looked
--          for X here, didn't find any"
--        - is_negative_observation = FALSE                   → normal find
--
--   2. habitat_tags TEXT[]
--      Free-form (but conventional) tags describing what the user
--      observed in the field: 'granskog', 'moserik', 'sørvendt',
--      'kalkrik', etc. Supplements the NIBIO-derived habitat-score
--      with ground-truth user input.
--
--   3. weather_at_observation JSONB
--      Snapshot of fetchWeatherSummary() output at log time.
--      Cheap to capture now, expensive to reconstruct historically.
--      Required for offline ML training in v2.
--
--   4. quantity_estimate TEXT
--      Categorical, not free-form. Five buckets so we can compare
--      across users without normalization headaches. NULL when
--      irrelevant (e.g. for negative observations).
--
-- Privacy: the existing set_display_location trigger from migration 005
-- still applies. Negative observations get the same privacy treatment
-- as positive ones — randomized for 'approximate', NULL for 'private'.
-- Logging "I was here" still reveals user movement, even without a find.
--
-- RLS: no policy changes. Negative observations are still user-owned
-- findings; the existing "users can insert/update/delete their own"
-- policies cover them.

ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS is_negative_observation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS habitat_tags TEXT[],
  ADD COLUMN IF NOT EXISTS weather_at_observation JSONB,
  ADD COLUMN IF NOT EXISTS quantity_estimate TEXT
    CHECK (quantity_estimate IS NULL OR quantity_estimate IN ('just_one', 'few', 'several', 'many', 'lots'));

-- Partial index — most rows will be positive observations (the default),
-- so we only index the small subset that's negative. Used by the
-- prediction-tile generator to weight cells where users have reported
-- non-finds.
CREATE INDEX IF NOT EXISTS idx_findings_negative
  ON findings(species_id, found_at DESC)
  WHERE is_negative_observation = TRUE;

-- GIN index on habitat_tags for "find all observations tagged 'granskog'"
-- queries the prediction-tile generator and analytics will run.
CREATE INDEX IF NOT EXISTS idx_findings_habitat_tags
  ON findings USING GIN (habitat_tags);

COMMENT ON COLUMN findings.is_negative_observation IS
  'TRUE when the user logged "I looked here and didn''t find what I was searching for". As valuable to the prediction model as positive finds.';
COMMENT ON COLUMN findings.habitat_tags IS
  'User-observed habitat descriptors (granskog, moserik, sørvendt, etc.). Supplements NIBIO-derived habitat-score with ground-truth.';
COMMENT ON COLUMN findings.weather_at_observation IS
  'Snapshot of fetchWeatherSummary() output at log time. Captured now because reconstructing historical weather is expensive.';
COMMENT ON COLUMN findings.quantity_estimate IS
  'Categorical bucket (just_one, few, several, many, lots) so users can compare without normalization headaches. NULL for negative observations.';
