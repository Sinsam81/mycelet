-- 015_lock_down_location_data.sql
-- SECURITY (K1 + M2 fra sikkerhetsrevisjonen 2026-06-09): tett to lekkasjer.
--
-- K1: findings-policyen "Offentlige funn er synlige for alle" ga radtilgang til
--     HELE raden for public/approximate-funn via REST — inkludert rå
--     latitude/longitude. Det opphever hele poenget med display-maskeringen:
--     hvem som helst (anon-nøkkelen er offentlig) kunne hente eksakte
--     koordinater for alle "omtrentlige" funn med ett kall.
--     Fiks: direkte tabell-lesing er nå KUN for eieren. All offentlig lesing
--     går via public_findings-viewet / get_findings_in_bounds-RPC-en, som
--     allerede maskerer riktig (begge kjører med eier-privilegier).
--
-- M2: prediction_tiles hadde SELECT USING (true) — hele det forhåndsberegnede
--     premium-rasteret kunne scrapes gratis via REST, utenom API-ets
--     betalings-gating. Direkte lesing fjernes; get_prediction_tiles_in_bounds
--     er SECURITY DEFINER og fortsetter å virke for API + kart. Admin-siden
--     (/admin/prediction) leser tabellen med moderator-sesjon → egen policy.
--
-- Idempotent: trygt å lime inn på nytt.

-- ── K1: findings — kun eieren kan lese tabellen direkte ──────────────────────
DROP POLICY IF EXISTS "Offentlige funn er synlige for alle" ON findings;
DROP POLICY IF EXISTS "Brukere kan lese egne funn" ON findings;
CREATE POLICY "Brukere kan lese egne funn" ON findings
  FOR SELECT USING (auth.uid() = user_id);

-- public_findings: legg til kolonnene forsiden trenger (location_name +
-- artens bilde), slik at "Siste funn fra fellesskapet" kan lese VIEWET i
-- stedet for tabellen. Nye kolonner er lagt til SIST (krav ved CREATE OR
-- REPLACE VIEW); maskerings-CASE-ene er identiske med migrasjon 005.
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
  f.zone_precision_km,
  f.location_name,
  ms.primary_image_url
FROM findings f
JOIN profiles p ON f.user_id = p.id
LEFT JOIN mushroom_species ms ON f.species_id = ms.id
WHERE f.visibility IN ('public', 'approximate');

-- Viewet ER maskeringslaget — det skal kjøre med eierens privilegier (definer),
-- ikke innkallerens. Gjør det eksplisitt så en fremtidig default-endring ikke
-- stenger offentlig lesing.
ALTER VIEW public_findings SET (security_invoker = false);
GRANT SELECT ON public_findings TO anon, authenticated, service_role;

-- ── M2: prediction_tiles — ingen åpen direkte lesing ─────────────────────────
DROP POLICY IF EXISTS "Prediction tiles er synlige for alle" ON prediction_tiles;
DROP POLICY IF EXISTS "Moderatorer kan lese prediction tiles" ON prediction_tiles;
CREATE POLICY "Moderatorer kan lese prediction tiles" ON prediction_tiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM moderator_roles mr WHERE mr.user_id = auth.uid())
  );
