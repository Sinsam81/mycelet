-- 040: Lås grovkorningen til raden ved første stempling.
--
-- Lanseringsrevisjon, infra/data-funn 6. Ikke en feil i dag — det finnes ingen
-- oppdateringsvei for funn i appen (ingen .update() mot findings noe sted i
-- src/), og målt mot produksjon er display_* helt stabilt mellom lesninger
-- fordi kolonnene er LAGRET, ikke beregnet ved lesning.
--
-- HULLET
-- Migrasjon 024 gjorde med rette triggeren til BEFORE INSERT OR UPDATE uten
-- kolonnefilter, slik at en endring av is_zone_finding faktisk re-stempler
-- display_*. Bivirkningen er at set_display_location kaller randomize_location()
-- PÅ NYTT ved hver eneste update. For et 'approximate'-funn betyr det et nytt
-- tilfeldig punkt hver gang.
--
-- Hvorfor det er farlig den dagen en «rediger funn»-flate finnes: N uavhengige
-- jitter-punkter rundt samme sanne posisjon har et gjennomsnitt som konvergerer
-- mot sannheten med omtrent 500/sqrt(N) meter. En observatør som lagrer
-- markørposisjonen mellom hver redigering kan altså ringe inn det ekte
-- voksestedet — nøyaktig det grovkorningen skal hindre. RLS gir allerede eieren
-- UPDATE-rett (001:332), så veien er åpen så snart et grensesnitt bruker den.
--
-- FIKSEN
-- Behold eksisterende display_* når ingenting som PÅVIRKER dem er endret.
-- Endres latitude, longitude, visibility, is_zone_finding eller
-- zone_precision_km, stemples raden på nytt som før.
--
-- Bonus: vakten overstyrer også et forsøk på å skrive display_* direkte. Uten
-- den kunne en eier sette display_latitude = latitude på et 'approximate'-funn
-- og dermed publisere sin egen eksakte posisjon gjennom public_findings — eller,
-- verre, gjøre det ved et uhell.
--
-- MERK: en fremtidig «re-stempling» av typen i 024
-- (UPDATE findings SET updated_at = updated_at) er nå en no-op. Skal display_*
-- regnes om for eksisterende rader, må en av de fem kolonnene faktisk endres,
-- eller vakten midlertidig fjernes.
--
-- Idempotent: CREATE OR REPLACE FUNCTION. Trigger og signatur er uendret, så
-- den kan limes inn på nytt uten videre.
--
-- Kontrollspørring — les samme approximate-rad to ganger med en tom update
-- imellom. `for_jitter` og `etter_jitter` skal være IDENTISKE:
--
--   SELECT id, display_latitude AS for_jitter FROM public.findings
--    WHERE visibility = 'approximate' LIMIT 1;
--   UPDATE public.findings SET updated_at = NOW()
--    WHERE id = '<id-en over>';
--   SELECT id, display_latitude AS etter_jitter FROM public.findings
--    WHERE id = '<id-en over>';

CREATE OR REPLACE FUNCTION set_display_location()
RETURNS TRIGGER AS $$
DECLARE
  result RECORD;
  grid_lat DOUBLE PRECISION;
  grid_lng DOUBLE PRECISION;
BEGIN
  -- Vakten: ingen av inndataene til grovkorningen er endret, så svaret skal
  -- heller ikke endre seg. IS NOT DISTINCT FROM behandler NULL = NULL som likt.
  IF TG_OP = 'UPDATE'
     AND NEW.latitude          IS NOT DISTINCT FROM OLD.latitude
     AND NEW.longitude         IS NOT DISTINCT FROM OLD.longitude
     AND NEW.visibility        IS NOT DISTINCT FROM OLD.visibility
     AND NEW.is_zone_finding   IS NOT DISTINCT FROM OLD.is_zone_finding
     AND NEW.zone_precision_km IS NOT DISTINCT FROM OLD.zone_precision_km
  THEN
    NEW.display_latitude  := OLD.display_latitude;
    NEW.display_longitude := OLD.display_longitude;
    RETURN NEW;
  END IF;

  -- Herfra og ned: uendret fra migrasjon 005.
  IF NEW.visibility = 'private' THEN
    NEW.display_latitude := NULL;
    NEW.display_longitude := NULL;
    RETURN NEW;
  END IF;

  IF NEW.is_zone_finding = TRUE THEN
    -- Del posisjon på sone-nivå: snap til grid i stedet for tilfeldig offset.
    grid_lat := GREATEST(NEW.zone_precision_km, 1) / 111.32;
    grid_lng := GREATEST(NEW.zone_precision_km, 1) / (111.32 * GREATEST(cos(radians(NEW.latitude)), 0.2));
    NEW.display_latitude := round(NEW.latitude / grid_lat) * grid_lat;
    NEW.display_longitude := round(NEW.longitude / grid_lng) * grid_lng;
    RETURN NEW;
  END IF;

  IF NEW.visibility = 'approximate' THEN
    SELECT * INTO result FROM randomize_location(NEW.latitude, NEW.longitude);
    NEW.display_latitude := result.rand_lat;
    NEW.display_longitude := result.rand_lng;
  ELSE
    NEW.display_latitude := NEW.latitude;
    NEW.display_longitude := NEW.longitude;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_display_location() IS
  'Stempler findings.display_latitude/longitude ut fra visibility og sone-innstillinger. Ved UPDATE beholdes eksisterende display_* når verken latitude, longitude, visibility, is_zone_finding eller zone_precision_km er endret — ellers ville hver lagring gitt et nytt jitter-punkt, og gjentatte lagringer kunne avsløre det eksakte voksestedet (migrasjon 040).';
