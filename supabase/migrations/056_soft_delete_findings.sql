-- 056: Brukeren kan slette sine egne funn — med angrevei.
--
-- BAKGRUNNEN
-- RLS har siden migrasjon 001 hatt policyen «Brukere kan slette egne funn»
-- (001:333), men ingenting i appen brukte den: /api/findings eksporterte bare
-- POST, og det fantes ikke ett eneste .delete() mot findings i src/. Et
-- feilregistrert funn — feil koordinat, feil art, dobbeltregistrering, eller
-- et funn brukeren angret på å ha delt offentlig — var permanent. Eneste
-- utvei var å slette HELE kontoen.
--
-- Personvernerklæringen lovet allerede det motsatte («så lenge du har konto,
-- kan du selv slette enkeltfunn, forum-innlegg og kommentarer»), og
-- docs/retention-policy.md sier «Bruker kan slette når som helst». Denne
-- migrasjonen er det som gjør de to setningene sanne.
--
-- HVORFOR SOFT DELETE OG IKKE DELETE
-- Sletting er irreversibel, og det finnes ingen «er du sikker»-dialog som
-- redder et feilklikk på en telefon i skogen. `deleted_at` gir en angreknapp
-- rett etter slettingen, og en 30-dagers frist der en support-henvendelse
-- fortsatt kan redde funnet. Etter fristen hard-slettes raden av
-- /api/cron/purge-deleted-findings, som også rydder bildet i Storage.
--
-- Prisen er at HVERT lesested må filtrere. Det er derfor viewet og
-- get_user_stats endres her, i samme migrasjon som kolonnen: glemmes ett sted,
-- dukker et «slettet» funn opp igjen, og det er verre enn ingen sletting.
-- Lesestedene som IKKE kan filtreres i SQL er filtrert i appen — søk etter
-- `deleted_at` i src/ for hele listen.
--
-- ⚠️ ETT LESESTED FILTRERER MED VILJE IKKE: AI-kvoten i /api/identify teller
-- funn med ai_used = true siste døgn. Et slettet funn skal FORTSATT telle —
-- ellers blir «identifiser → lagre → slett» en gratis omgang til.
--
-- SAMSPILL MED MIGRASJON 042 (viktig)
-- set_display_location beholder eksisterende display_* når verken latitude,
-- longitude, visibility, is_zone_finding eller zone_precision_km er endret. Å
-- sette (og nullstille) deleted_at rører ingen av de fem, så en runde
-- slett → angre → slett → angre gir IKKE nye jitter-punkter. Uten den vakten
-- ville nettopp denne funksjonen åpnet gjennomsnitts-angrepet 042 ble skrevet
-- for å stenge. Rør ikke vakten uten å lese filhodet i 042.
--
-- KJØRES SLIK: lim HELE filen inn i Supabase SQL Editor i én omgang.
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE hele veien.

-- ── 1. Kolonnen ─────────────────────────────────────────────────────────────

ALTER TABLE findings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN findings.deleted_at IS
  'Satt når EIEREN har slettet funnet fra appen. NULL = aktivt funn. Alt som viser funn til noen — public_findings, get_user_stats, /mine-steder, profilen, kartet, GPX-eksporten — må filtrere på deleted_at IS NULL. Raden hard-slettes av /api/cron/purge-deleted-findings 30 dager etter at den ble satt, sammen med bildet i Storage.';

-- Purge-jobben er den eneste spørringen som leter etter IKKE-NULL. Delvis
-- indeks: den dekker nøyaktig de radene jobben skal finne, og koster nesten
-- ingenting siden de aller fleste radene er aktive.
CREATE INDEX IF NOT EXISTS idx_findings_deleted_at
  ON findings(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ── 2. public_findings — det offentlige laget ───────────────────────────────
--
-- Uendret fra migrasjon 029 bortsett fra den siste linjen i WHERE.
-- Kolonnelisten og rekkefølgen MÅ stå urørt (krav ved CREATE OR REPLACE VIEW).
--
-- Dette ene tillegget dekker fire lesesteder på én gang: kartets offentlige
-- lag (get_findings_in_bounds returnerer SETOF public_findings), «Siste funn
-- fra fellesskapet» på forsiden, nabofunn-tellingen i /api/identify, og
-- aktivitetssignalet i /api/prediction.

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
  AND f.is_negative_observation = FALSE
  AND f.deleted_at IS NULL;

-- Viewet ER maskeringslaget — det skal kjøre med eierens privilegier, ikke
-- innkallerens. Gjentas her fordi CREATE OR REPLACE VIEW ikke arver alt.
ALTER VIEW public_findings SET (security_invoker = false);
GRANT SELECT ON public_findings TO anon, authenticated, service_role;

-- ── 3. get_user_stats — profilens tellere ──────────────────────────────────
--
-- Uendret fra migrasjon 029 bortsett fra deleted_at-filteret på de to
-- funn-tellingene. Uten det ville profilen fortsatt sagt «12 funn» etter at
-- brukeren slettet ned til 11.

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
    (SELECT COUNT(*) FROM findings
      WHERE user_id = p_user_id AND is_negative_observation = FALSE AND deleted_at IS NULL),
    (SELECT COUNT(DISTINCT species_id) FROM findings
      WHERE user_id = p_user_id AND species_id IS NOT NULL
        AND is_negative_observation = FALSE AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM forum_posts WHERE user_id = p_user_id),
    (SELECT COALESCE(SUM(likes_count), 0) FROM forum_posts WHERE user_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 4. Kontrollspørringer ──────────────────────────────────────────────────
--
-- Etter liming skal disse to gi 0 rader hver. Gjør de ikke det, er det et
-- lesested som ikke filtrerer:
--
--   -- Slettede funn som fortsatt er synlige offentlig:
--   SELECT pf.id FROM public_findings pf
--     JOIN findings f ON f.id = pf.id
--    WHERE f.deleted_at IS NOT NULL;
--
--   -- Slettede funn som fortsatt telles i profil-statistikken:
--   SELECT f.user_id FROM findings f
--    WHERE f.deleted_at IS NOT NULL AND f.is_negative_observation = FALSE
--      AND (SELECT total_findings FROM get_user_stats(f.user_id))
--          > (SELECT COUNT(*) FROM findings x
--              WHERE x.user_id = f.user_id AND x.is_negative_observation = FALSE
--                AND x.deleted_at IS NULL);
