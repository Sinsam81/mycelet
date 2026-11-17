-- 075: Sone-ruta skal ikke røpe breddegraden.
--
-- ⚠️ HASTER. Hullet gjelder hvert sone-funn som lagres fra kartet. 16. november
-- 2026 fantes det ingen offentlige sone-funn (0 av 19 i public_findings), så
-- ingenting har lekket ennå — lim inn FØR det første lagres. Fila er ikke
-- avhengig av noen utgivelse av appen, og kan kjøres både før og etter.
--
-- KJØRES SLIK: lim HELE fila inn i Supabase SQL Editor i én omgang, uten å
-- merke noe av teksten først. Går noe galt underveis, er ingenting endret.
--
-- HULLET
-- Et sone-funn («hemmeligsted-vennlig») skal bare vise hvilken rute funnet
-- ligger i. Triggeren set_display_location (005, videreført i 042) regnet ruta
-- slik:
--
--   grid_lat := p / 111.32
--   grid_lng := p / (111.32 * cos(radians(NEW.latitude)))     ← ekte breddegrad
--   display_latitude  := round(latitude  / grid_lat) * grid_lat
--   display_longitude := round(longitude / grid_lng) * grid_lng
--
-- Lengdesteget er altså regnet av den EKSAKTE breddegraden. Dermed er
--
--   display_longitude = k * p / (111.32 * cos(ekte breddegrad))
--
-- der k er et heltall. public_findings og get_findings_in_bounds gir
-- display_lat, display_lng og zone_precision_km (p) til alle, med full
-- presisjon. Den som leser én rad, finner k ved å runde av
-- display_lng * 111.32 * cos(display_lat) / p, og har da cos(ekte breddegrad)
-- — og breddegraden selv. Regnet gjennom for 20 000 nordiske punkter: riktig
-- hver gang, med en feil på langt under en millimeter
-- (src/lib/findings/__tests__/sonerute-migrasjon.test.ts spiller det gjennom).
--
-- Ruta skjulte med andre ord bare øst–vest. Et funn i en 5 km-rute lå på en
-- kjent linje, 5 km lang.
--
-- FIKSEN
-- Regn display_latitude FØRST, og regn lengdesteget av DEN — den avrundede
-- breddegraden, som uansett er offentlig. Da avhenger stempelet bare av
-- hvilken rute funnet ligger i: to funn i samme rute får nøyaktig samme
-- punkt, og det er ingenting igjen å regne seg tilbake fra.
--
-- display_latitude blir det samme tallet som før. Bare display_longitude
-- flytter seg: rutenettet forskyves litt øst–vest, så punktet på kartet havner
-- høyst én rutebredde fra der det sto.
--
-- Utregningen ligger i én funksjon, zone_grid_location, som både triggeren og
-- omstemplingen under bruker. Slik kan de to ikke komme i utakt.
--
-- EKSISTERENDE SONE-FUNN STEMPLES PÅ NYTT HER
-- Vakten fra 042 lar display_* stå i fred når verken posisjon, synlighet eller
-- sone er endret, og overstyrer et forsøk på å skrive display_* direkte. En
-- vanlig UPDATE kan derfor ikke rette radene som alt ligger der. Blokka i del
-- 3 slår triggeren av, skriver de nye rutepunktene og slår den på igjen — i
-- ÉN setning, så den ikke kan bli stående av: enten skjer alt, eller ingenting.
-- updated_at røres ikke (findings_updated_at er også av i mellomtiden): funnet
-- er ikke endret av eieren, og klokka delingskarantenen leser
-- (src/lib/findings/delingsendring.ts) skal ikke starte for en migrasjon.
--
-- DET DENNE IKKE KAN RETTE
-- Breddegrader som alt er hentet ut, er ute. Migrasjonen stopper lekkasjen
-- framover; den kan ikke ta tilbake det noen har lest.
--
-- ⚠️ LIM ALDRI INN 042 ETTER DENNE. 042 erstatter den samme funksjonen med den
-- gamle utregningen, og hullet er tilbake for hvert sone-funn som lagres
-- etterpå. Funksjonen under INNEHOLDER vakten fra 042, så når 075 er kjørt,
-- står også raden 042 i hovedboka som `true` — da skal 042 ikke limes inn.
-- Skjer det likevel: raden 075 blir `false`. Lim inn denne fila på nytt.
--
-- ETTERPÅ
-- «Endre deling» på Mine steder lar ikke et funn bli sone-funn før denne er
-- bekreftet kjørt. Bryteren heter SONE_OMGJORING_AAPEN og står i
-- src/lib/findings/delingsendring.ts; en test nekter den å stå på før raden
-- 075 i docs/migrasjoner-a-kjore.md er merket «kjørt».
--
-- Idempotent: CREATE OR REPLACE, og omstemplingen gir samme svar hver gang.

BEGIN;

-- ── 1: ruta regnes ut ETT sted ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.zone_grid_location(
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  precision_km INT
) RETURNS TABLE(zone_lat DOUBLE PRECISION, zone_lng DOUBLE PRECISION) AS $$
DECLARE
  step_lat DOUBLE PRECISION;
  step_lng DOUBLE PRECISION;
BEGIN
  step_lat := GREATEST(precision_km, 1) / 111.32;
  zone_lat := round(lat / step_lat) * step_lat;
  -- Lengdesteget regnes av zone_lat — den AVRUNDEDE breddegraden — og aldri av
  -- lat. Brukes den ekte breddegraden her, kan den regnes ut av zone_lng.
  step_lng := GREATEST(precision_km, 1) / (111.32 * GREATEST(cos(radians(zone_lat)), 0.2));
  zone_lng := round(lng / step_lng) * step_lng;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = '';

COMMENT ON FUNCTION public.zone_grid_location(DOUBLE PRECISION, DOUBLE PRECISION, INT) IS
  'Rutepunktet et sone-funn vises på. Lengdesteget regnes av den avrundede breddegraden (zone_lat), aldri av den ekte: ellers kan den ekte breddegraden regnes ut av zone_lng (migrasjon 075). Brukes av set_display_location.';

-- Triggeren kjører med rettighetene til den som lagrer funnet.
GRANT EXECUTE ON FUNCTION public.zone_grid_location(DOUBLE PRECISION, DOUBLE PRECISION, INT)
  TO authenticated, service_role;

-- ── 2: triggeren ────────────────────────────────────────────────────────────
--
-- Uendret fra 042 bortsett fra sone-grenen. Vakten øverst MÅ stå: det er den
-- som holder jitter-punktet til et omtrentlig funn i ro (se filhodet i 042).

CREATE OR REPLACE FUNCTION public.set_display_location()
RETURNS TRIGGER AS $$
DECLARE
  result RECORD;
  grid RECORD;
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

  IF NEW.visibility = 'private' THEN
    NEW.display_latitude := NULL;
    NEW.display_longitude := NULL;
    RETURN NEW;
  END IF;

  IF NEW.is_zone_finding = TRUE THEN
    -- Del posisjon på sone-nivå: snap til grid i stedet for tilfeldig offset.
    SELECT * INTO grid
      FROM public.zone_grid_location(NEW.latitude, NEW.longitude, NEW.zone_precision_km);
    NEW.display_latitude := grid.zone_lat;
    NEW.display_longitude := grid.zone_lng;
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

COMMENT ON FUNCTION public.set_display_location() IS
  'Stempler findings.display_latitude/longitude ut fra visibility og sone-innstillinger. Ved UPDATE beholdes eksisterende display_* når verken latitude, longitude, visibility, is_zone_finding eller zone_precision_km er endret — ellers ville hver lagring gitt et nytt jitter-punkt (migrasjon 042). Sone-ruta regnes av zone_grid_location, som ikke røper breddegraden (migrasjon 075).';

-- ── 3: stemple eksisterende sone-funn på nytt ───────────────────────────────
--
-- Én setning med vilje. Sto «slå av», «oppdater» og «slå på» som hver sin
-- setning, kunne en delvis kjøring etterlatt triggeren avslått — og da
-- stemples ingenting: et funn som gjøres om fra eksakt til omtrentlig, ville
-- blitt stående med det eksakte punktet.

DO $$
BEGIN
  ALTER TABLE public.findings DISABLE TRIGGER findings_set_display_location;
  ALTER TABLE public.findings DISABLE TRIGGER findings_updated_at;

  -- Samme rader som sone-grenen i triggeren treffer: sone-flagget satt, og
  -- ikke privat (private funn har ikke noe punkt). Slettede funn er med — de
  -- kan gjenopprettes.
  UPDATE public.findings AS f
     SET (display_latitude, display_longitude) = (
           SELECT g.zone_lat, g.zone_lng
             FROM public.zone_grid_location(f.latitude, f.longitude, f.zone_precision_km) AS g
         )
   WHERE f.is_zone_finding = TRUE
     AND f.visibility IS DISTINCT FROM 'private';

  ALTER TABLE public.findings ENABLE TRIGGER findings_updated_at;
  ALTER TABLE public.findings ENABLE TRIGGER findings_set_display_location;
END;
$$;

COMMIT;

-- ── Kontroll etter kjøring ─────────────────────────────────────────────────
-- Alle tre leser bare. Raden 075 i hovedbokas spørring
-- (docs/migrasjoner-a-kjore.md) svarer på 1 og 2 i ett.
--
-- 1) Skal gi true: triggeren bruker den nye utregningen.
--
-- SELECT prosrc LIKE '%zone_grid_location%' AS ny_utregning
--   FROM pg_proc WHERE oid = to_regproc('public.set_display_location');
--
-- 2) Skal gi to rader, begge med true: triggerne på findings står på.
--
-- SELECT tgname, tgenabled = 'O' AS staar_paa
--   FROM pg_trigger
--  WHERE tgrelid = to_regclass('public.findings')
--    AND tgname IN ('findings_set_display_location', 'findings_updated_at');
--
-- 3) Skal gi 0: ingen sone-funn står igjen med et punkt fra den gamle
--    utregningen. Blir tallet større enn 0 senere, er 042 (eller 005) limt inn
--    etter denne — lim da inn denne fila på nytt.
--
-- SELECT count(*) AS soner_med_gammelt_punkt
--   FROM public.findings AS f
--  CROSS JOIN LATERAL public.zone_grid_location(f.latitude, f.longitude, f.zone_precision_km) AS g
--  WHERE f.is_zone_finding = TRUE
--    AND f.visibility IS DISTINCT FROM 'private'
--    AND (f.display_latitude IS DISTINCT FROM g.zone_lat
--         OR f.display_longitude IS DISTINCT FROM g.zone_lng);
