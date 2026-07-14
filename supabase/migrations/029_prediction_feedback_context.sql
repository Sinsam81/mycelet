-- 029: Make field feedback usable as prediction-training data.
--
-- 1. Preserve when a predicted spot was actually visited and which model/data
--    produced the displayed score. Context is JSONB so new non-sensitive model
--    inputs can be added without a migration per feature.
-- 2. Negative observations are training data, not community "finds". Exclude
--    them from the public_findings view while owners retain access through the
--    owner-only findings policy.
--
-- Backward-compatible: all added feedback columns are nullable/defaulted and
-- the public view keeps its existing column order and shape.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE spot_feedback
  ADD COLUMN IF NOT EXISTS visited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS model_version TEXT,
  ADD COLUMN IF NOT EXISTS prediction_source TEXT,
  ADD COLUMN IF NOT EXISTS weather_source TEXT,
  ADD COLUMN IF NOT EXISTS score_components JSONB,
  ADD COLUMN IF NOT EXISTS context JSONB;

UPDATE spot_feedback
SET visited_at = created_at
WHERE visited_at IS NULL;

ALTER TABLE spot_feedback
  ALTER COLUMN visited_at SET DEFAULT NOW(),
  ALTER COLUMN visited_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS spot_feedback_visited_idx
  ON spot_feedback (visited_at DESC);

COMMENT ON COLUMN spot_feedback.visited_at IS
  'When the user visited/searched the predicted spot; distinct from submission time.';
COMMENT ON COLUMN spot_feedback.model_version IS
  'Prediction model version that produced score_shown.';
COMMENT ON COLUMN spot_feedback.prediction_source IS
  'Product path that produced the prediction, for example computed_top_spots.';
COMMENT ON COLUMN spot_feedback.score_components IS
  'Non-sensitive score inputs captured when feedback was submitted.';
COMMENT ON COLUMN spot_feedback.context IS
  'Non-sensitive field context used for calibration and model evaluation.';

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
  CASE WHEN f.visibility = 'public' AND f.is_zone_finding = false THEN f.notes ELSE NULL END as notes,
  f.is_zone_finding,
  f.zone_label,
  f.zone_precision_km,
  CASE WHEN f.visibility = 'public' AND f.is_zone_finding = false THEN f.location_name ELSE NULL END as location_name,
  ms.primary_image_url
FROM findings f
JOIN profiles p ON f.user_id = p.id
LEFT JOIN mushroom_species ms ON f.species_id = ms.id
WHERE f.visibility IN ('public', 'approximate')
  AND f.is_negative_observation = FALSE;

ALTER VIEW public_findings SET (security_invoker = false);
GRANT SELECT ON public_findings TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS TABLE(
  total_findings BIGINT,
  unique_species BIGINT,
  total_posts BIGINT,
  total_likes_received BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM findings WHERE user_id = p_user_id AND is_negative_observation = FALSE),
    (SELECT COUNT(DISTINCT species_id) FROM findings WHERE user_id = p_user_id AND species_id IS NOT NULL AND is_negative_observation = FALSE),
    (SELECT COUNT(*) FROM forum_posts WHERE user_id = p_user_id),
    (SELECT COALESCE(SUM(likes_count), 0) FROM forum_posts WHERE user_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
