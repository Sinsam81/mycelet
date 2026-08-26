-- 054: Årsfilter i get_occurrences_in_bounds + koordinatusikkerhet på funn
--
-- Bakgrunn (konkurrentanalysen 26.08.2026, «fra Mushroom Spot»): ~72 % av de
-- 428 000 GBIF-punktene er fra før 2021 og 74 000 fra før år 2000. Et
-- årsfilter må ligge i RPC-en, ikke i klienten: klient-side filtrering inne i
-- det avkuttede 6000-radersutvalget arver trunkeringsskjevheten kartet
-- allerede advarer mot (paged-rpc.ts). Kartet har en klient-fallback som
-- virker FØR denne migrasjonen er kjørt, men den er nest best — kjør denne.
--
-- Koordinatusikkerhet: importen har siden 2026-06-17 FILTRERT på GBIFs
-- coordinateUncertaintyInMeters (≤1000 m, ukjente droppes) men aldri LAGRET
-- verdien. Kolonnen under fylles av importskriptet fremover; eksisterende
-- rader forblir NULL («ukjent» i kart-popupen — ærlig, siden ~76 % av radene
-- er importert før kvalitetsfilteret fantes). En full backfill er en egen
-- kjøring av importskriptet (upsert på gbif_key fletter inn verdien, samme
-- mekanisme som license-backfillen i 016).
--
-- KJØRES SLIK: lim HELE filen inn i Supabase SQL Editor i én omgang.
-- DROP + CREATE + GRANT hører sammen — stopper du midt i, står kartlaget
-- uten funksjon (SQL Editor kjører uansett hele limingen i én transaksjon).
-- Returtypen endres (ny kolonne), derfor DROP før CREATE — samme mønster som
-- 014. Idempotent: trygg å lime inn på nytt (begge signaturer droppes først).
-- KJØR OGSÅ FØR neste kjøring av scripts/import-gbif-occurrences.mjs — det
-- lagrer nå kolonnen under og nekter å starte uten den.

ALTER TABLE species_occurrences
  ADD COLUMN IF NOT EXISTS coordinate_uncertainty_m INTEGER;

DROP FUNCTION IF EXISTS get_occurrences_in_bounds(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT
);
-- No-op ved første kjøring; gjør re-liming trygg (ellers stopper CREATE på
-- at 7-argumentversjonen alt finnes).
DROP FUNCTION IF EXISTS get_occurrences_in_bounds(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT, INT
);

CREATE FUNCTION get_occurrences_in_bounds(
  min_lat DOUBLE PRECISION,
  min_lng DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  max_lng DOUBLE PRECISION,
  p_species_id INT DEFAULT NULL,
  p_limit INT DEFAULT 4000,
  p_min_year INT DEFAULT NULL
)
RETURNS TABLE (
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  species_id INT,
  observed_at DATE,
  coordinate_uncertainty_m INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT so.latitude, so.longitude, so.species_id, so.observed_at,
         so.coordinate_uncertainty_m
  FROM species_occurrences so
  WHERE so.latitude BETWEEN min_lat AND max_lat
    AND so.longitude BETWEEN min_lng AND max_lng
    AND (p_species_id IS NULL OR so.species_id = p_species_id)
    -- Årsfilteret teller årstall, så år-bare-rader (lagret som YYYY-01-01)
    -- klassifiseres riktig. Udaterte rader (118 stk.) ekskluderes når
    -- filteret er aktivt: ukjent dato kan ikke bevise ferskhet.
    AND (p_min_year IS NULL
         OR (so.observed_at IS NOT NULL
             AND EXTRACT(YEAR FROM so.observed_at) >= p_min_year))
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Behold 043-herdingen: definer-funksjoner skal ha låst search_path.
ALTER FUNCTION get_occurrences_in_bounds(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT, INT
) SET search_path TO 'public';

GRANT EXECUTE ON FUNCTION get_occurrences_in_bounds(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT, INT
) TO anon, authenticated, service_role;
