-- 040: gi geo-spørringene en indeks de faktisk kan bruke, og lås
--      search_path på de fire SECURITY DEFINER-funksjonene.
--
-- ⚠️ IKKE KJØRT. Lim inn i Supabase SQL Editor når du vil ha den ute.
-- Idempotent: trygg å lime inn på nytt.
--
-- ── DEL 1: indeksen kartet faktisk trenger ────────────────────────────────
--
-- Alle tre bounds-funksjonene filtrerer med BETWEEN på RÅ lat/lng:
--
--   get_occurrences_in_bounds  (014): so.latitude BETWEEN … AND so.longitude BETWEEN …
--   get_findings_in_bounds     (001): samme mønster
--   get_prediction_tiles_in_bounds (003): samme mønster
--
-- GIST-indeksene fra 003/013 ligger derimot på
-- `ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)`. En GIST-indeks krever
-- en PostGIS-operator (&& / ST_Within) for å bli brukt, og den kommer aldri —
-- spørringene bruker BETWEEN. Indeksene kan altså ikke treffes av den koden vi
-- faktisk kjører, uansett hvor mye data som kommer inn.
--
-- Den sammensatte indeksen idx_occurrences_species_lat_lng har species_id som
-- LEDENDE kolonne, og kartets standardkall sender p_species_id = NULL
-- (MushroomMap.tsx). Uten et likhetsfilter på den ledende kolonnen kan ikke
-- planleggeren gjøre et range-søk; den skanner hele indeksen.
--
-- Denne migrasjonen LEGGER TIL en btree på (latitude, longitude) — den formen
-- BETWEEN faktisk kan bruke. Ingenting droppes: en indeks som ikke brukes koster
-- skriveforsterkning, og species_occurrences skrives bare av importskriptet, så
-- kostnaden ved å la de gamle stå er nær null mens risikoen ved å droppe dem er
-- ekte. Rydd heller når du har målt.
--
-- CONCURRENTLY er bevisst IKKE brukt: den kan ikke kjøre inne i en transaksjon,
-- og SQL Editor kjører alt i én. Tabellen har ~330k rader — bygget tar sekunder.

create index if not exists idx_occurrences_lat_lng
  on species_occurrences (latitude, longitude);

create index if not exists idx_prediction_tiles_date_lat_lng
  on prediction_tiles (tile_date, center_lat, center_lng);

-- ── DEL 2: lås search_path på SECURITY DEFINER-funksjonene ────────────────
--
-- De fire funksjonene under er SECURITY DEFINER og eies av `postgres`, altså
-- kjører de med postgres' rettigheter. Uten en låst search_path avgjør
-- kallerens search_path hvilke objekter et ukvalifisert navn slår opp i — det
-- er den klassiske eskaleringsveien for definer-funksjoner. is_admin,
-- is_moderator, get_user_stats og resten HAR allerede låsingen; disse fire ble
-- glemt.
--
-- ALTER FUNCTION, ikke CREATE OR REPLACE: vi rører ikke kroppen. Skulle en av
-- funksjonene ha drevet fra migrasjonsfilene i produksjon, ville en
-- CREATE OR REPLACE stille rullet den tilbake. Dette kan ikke det.

alter function public.get_findings_in_bounds(
  double precision, double precision, double precision, double precision, int, int
) set search_path to 'public';

alter function public.get_occurrences_in_bounds(
  double precision, double precision, double precision, double precision, int, int
) set search_path to 'public';

alter function public.get_prediction_tiles_in_bounds(
  double precision, double precision, double precision, double precision, date, integer
) set search_path to 'public';

alter function public.search_species(text) set search_path to 'public';

-- ── DEL 3: ta CREATE på schema public fra anon og authenticated ───────────
--
-- pg_namespace.nspacl for public viser `anon=UC/postgres` — C er CREATE, gitt
-- eksplisitt til anon. Gjenopprettingsblokka i CLAUDE.md gir bare USAGE, så
-- dette kommer fra en GRANT ALL ON SCHEMA som er kjørt en gang.
--
-- Ingen målt skade i dag: ingenting i appen lager objekter som anon. Men
-- rettigheten er det som gjør at en framtidig feilkonfigurasjon går fra
-- «ufarlig» til «rettighetseskalering» — anon kan legge et objekt i public som
-- en definer-funksjon kan komme til å slå opp. Sammen med del 2 er hullet
-- lukket fra begge sider.
--
-- service_role beholder alt.

revoke create on schema public from anon;
revoke create on schema public from authenticated;

-- ── Kontroll etter kjøring ─────────────────────────────────────────────────
-- 1) Indeksen skal FAKTISK brukes. Kjør denne før og etter:
--
-- explain (analyze, buffers)
-- select latitude, longitude, species_id
-- from species_occurrences
-- where latitude between 59.7 and 60.1 and longitude between 10.4 and 11.1
-- limit 1000;
--
--    Før: «Index Scan using idx_occurrences_species_lat_lng», ~1200 ms.
--    Etter: skal stå «idx_occurrences_lat_lng» og være vesentlig raskere.
--    Gjør den det IKKE, ikke behold indeksen — da er premisset feil.
--
-- 2) search_path skal være satt på alle fire (proconfig skal ikke være null):
--
-- select p.proname, p.prosecdef, p.proconfig
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.prosecdef
-- order by p.proname;
--
-- 3) anon og authenticated skal ikke lenger ha CREATE:
--
-- select has_schema_privilege('anon', 'public', 'CREATE') as anon_create,
--        has_schema_privilege('authenticated', 'public', 'CREATE') as auth_create;
--    Forventet: false, false.
--
-- 4) Og appen skal virke som før: åpne kartet, panorer, trykk «Lovende steder».
