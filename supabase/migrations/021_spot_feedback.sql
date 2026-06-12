-- 021: spot_feedback — calibration data for the prediction engine.
--
-- Every "Var du her? Fant du sopp?" answer on a Beste steder-pin lands here
-- together with the score we showed. This is the ground truth that lets us
-- calibrate species-scoring/cell-score against reality (the hand-tuned
-- multipliers in species-scoring.ts have never been validated).
--
-- RLS: users insert/read their OWN rows. Calibration jobs read everything via
-- the service role (bypasses RLS) — no public read policy on purpose, so the
-- raw feedback can't be scraped as a "where is the mushroom" dataset.

CREATE TABLE IF NOT EXISTS spot_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  species_id INT REFERENCES mushroom_species(id) ON DELETE SET NULL,
  found BOOLEAN NOT NULL,
  score_shown INT CHECK (score_shown BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE spot_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own spot feedback" ON spot_feedback;
CREATE POLICY "Users insert own spot feedback"
  ON spot_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own spot feedback" ON spot_feedback;
CREATE POLICY "Users read own spot feedback"
  ON spot_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS spot_feedback_created_idx ON spot_feedback (created_at);
CREATE INDEX IF NOT EXISTS spot_feedback_geo_idx ON spot_feedback (latitude, longitude);
CREATE INDEX IF NOT EXISTS spot_feedback_species_idx ON spot_feedback (species_id) WHERE species_id IS NOT NULL;
