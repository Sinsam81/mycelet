-- 023: Mask user-authored free text in the public_findings view.
--
-- Pre-launch audit finding (RLS/data-exposure, HIGH): the view masks the
-- coordinates of 'approximate'/zone findings but passed f.notes and
-- f.location_name through unmasked to anon. A user who hides a secret patch via
-- zone/approximate visibility still leaked their free-text note (possible PII)
-- to anyone with the public anon key (and via get_findings_in_bounds, which
-- returns SETOF public_findings). Fix: only expose notes/location_name for
-- fully public, non-zone findings — same condition as the precise-coordinate
-- branch. zone_label stays visible (it is the intentional coarse zone name).
--
-- Owners keep full access to their own notes via the owner-only SELECT policy on
-- the findings table (used by /mine-steder and /profile), so this does not
-- affect the owner's own views.

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
  -- Only reveal free-text notes for fully public, non-zone findings.
  CASE WHEN f.visibility = 'public' AND f.is_zone_finding = false THEN f.notes ELSE NULL END as notes,
  f.is_zone_finding,
  f.zone_label,
  f.zone_precision_km,
  -- Same masking for the precise place name (latent today, but a footgun).
  CASE WHEN f.visibility = 'public' AND f.is_zone_finding = false THEN f.location_name ELSE NULL END as location_name,
  ms.primary_image_url
FROM findings f
JOIN profiles p ON f.user_id = p.id
LEFT JOIN mushroom_species ms ON f.species_id = ms.id
WHERE f.visibility IN ('public', 'approximate');

ALTER VIEW public_findings SET (security_invoker = false);
GRANT SELECT ON public_findings TO anon, authenticated, service_role;
