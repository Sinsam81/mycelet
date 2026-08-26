-- 055: saved_places — brukerens egne markerte steder.
--
-- Bakgrunn og alternativvurdering: docs/gpx-import-design.md.
--
-- ── HVORFOR IKKE BARE PRIVATE FUNN ──────────────────────────────────────────
--
-- Det nærliggende var å la et importert GPX-veipunkt bli en findings-rad med
-- visibility='private'. Fire ting i den eksisterende koden gjorde det galt:
--
--   1. findings har ingen skrivbar stedsnavn-kolonne. location_name LESES fire
--      steder, men parseFindingRequest (src/lib/findings/request.ts) kjenner
--      den ikke, så ingenting i appen SKRIVER den. Veipunktnavnet — hele
--      verdien i en import — hadde havnet i notes.
--   2. /api/findings slår opp vær og skog LIVE per innsetting
--      (src/app/api/findings/route.ts). En nål fra 2019 hadde fått dagens vær
--      stemplet på seg, i tabellen feltkonteksten leser.
--   3. get_user_stats (migrasjon 029) og forsida teller alle egne funn, også
--      private. En import på 300 punkter hadde gjort «312 funn, 4 arter» av en
--      bruker som har funnet sopp tolv ganger.
--   4. Ingenting i appen kan slette et funn. RLS tillater det (001), men
--      /api/findings har bare POST. En feilimport hadde vært permanent.
--
-- Et sted er dessuten en annen ting enn et funn: koordinat + navn, uten art,
-- uten observasjonsdato, uten værsnapshot. Egen tabell, egne begreper.
--
-- ── PERSONVERN: STERKERE ENN FUNN, MED VILJE ────────────────────────────────
--
-- Et funn har en synlighetsmodell (public/approximate/private) og en trigger
-- som regner ut display_latitude. Et sted har INGEN av delene: ingen
-- synlighetskolonne, ingen display-kolonner, intet offentlig view, ingen RPC.
-- Det er privat ved konstruksjon, ikke ved standardvalg — et hemmelig soppsted
-- skal ikke kunne bli offentlig ved et feilklikk. Stedene skal aldri inn i
-- public_findings, prediksjonsmodellen eller noe aggregat.
--
-- FK-en peker på auth.users, ikke profiles: findings peker på profiles og får
-- derfor 23503 for kontoer uten profilrad — en feil /api/findings må reparere
-- seg ut av ved hver innsetting (se «findings.missing_profile_repair»). Den
-- svakheten arves ikke hit; et sted trenger ingen profil.

create table if not exists saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Navnet brukeren selv ga stedet — «Kantarellskogen», «Bak hytta».
  -- 120 tegn er samme tak som zone_label på findings. Kappingen skjer i
  -- klienten og i ruta; checken her er siste skanse mot direkte PostgREST-kall.
  name text not null check (char_length(btrim(name)) between 1 and 120),

  -- <desc> fra GPX-fila, eller brukerens eget notat. Ikke maskert noe sted,
  -- fordi raden aldri vises til andre enn eieren.
  note text check (note is null or char_length(note) <= 500),

  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),

  -- <time> fra veipunktet, hvis fila hadde et. Lagres for å kunne skrive det
  -- tilbake ved eksport, slik at en runde ut og inn igjen ikke taper data.
  -- Sier IKKE når noen fant sopp — som regel er det da nåla ble satt.
  waypoint_time timestamptz,

  -- Åpen for flere kilder senere («parkert bil»-markøren fra stjelelista hører
  -- hjemme her, ikke i findings). v1 skriver bare disse to.
  source text not null default 'manual' check (source in ('manual', 'gpx_import')),

  -- Filnavnet importen kom fra, så en angreknapp kan navngi det den fjerner.
  source_file text check (source_file is null or char_length(source_file) <= 200),

  -- Én import = én uuid = én angreknapp. Null for manuelt opprettede steder.
  import_batch_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Listevisningen og kartlaget henter alltid på user_id.
create index if not exists saved_places_user_idx
  on saved_places (user_id, created_at desc);

-- «Slett alle N steder fra denne importen».
create index if not exists saved_places_batch_idx
  on saved_places (user_id, import_batch_id)
  where import_batch_id is not null;

drop trigger if exists saved_places_updated_at on saved_places;
create trigger saved_places_updated_at
  before update on saved_places
  for each row execute function update_updated_at();

alter table saved_places enable row level security;

create policy "Egne steder er synlige for eieren"
  on saved_places for select
  using (auth.uid() = user_id);

create policy "Egne steder kan opprettes av eieren"
  on saved_places for insert
  with check (auth.uid() = user_id);

create policy "Egne steder kan endres av eieren"
  on saved_places for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Egne steder kan slettes av eieren"
  on saved_places for delete
  using (auth.uid() = user_id);

-- ── TAK PER BRUKER ──────────────────────────────────────────────────────────
--
-- Importruta validerer og ratelimiter, men tabellen kan også nås DIREKTE via
-- PostgREST med authenticated-rollen — det er hele poenget med RLS-designet, og
-- ruta bruker sesjonsklienten med vilje. Prisen er at et tak i ruta bare er en
-- høflig anmodning: én innlogget bruker kan sende én array-INSERT med 100 000
-- rader utenom ruta.
--
-- Samme mønster som migrasjon 053 (varselabonnement). Triggeren er per rad, så
-- en bulk-insert som krysser taket stopper på raden som krysser det — hele
-- innsettingen rulles tilbake, og brukeren får en feilmelding i stedet for en
-- halv import.
--
-- 1000 er romslig: importen tillater 500 veipunkter per fil, og en plukker med
-- over tusen markerte steder er ikke et bruksmønster vi har sett.
create or replace function enforce_saved_places_cap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from saved_places where user_id = new.user_id) >= 1000 then
    raise exception 'For mange lagrede steder for brukeren (maks 1000)';
  end if;
  return new;
end;
$$;

drop trigger if exists saved_places_cap on saved_places;
create trigger saved_places_cap
  before insert on saved_places
  for each row execute function enforce_saved_places_cap();

-- ⚠️ REVOKE-EN ER IKKE VALGFRI — se migrasjon 052.
--
-- Prosjektet har ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon
-- stående (gjenopprettingsblokka i CLAUDE.md). En ny tabell får derfor anon-
-- rettigheter AUTOMATISK, og en migrasjon som bare unnlater å nevne anon endrer
-- ingenting. RLS ville holdt radene skjult uansett, men hemmelige soppsteder
-- skal hvile på to lag, ikke ett.
revoke all on saved_places from anon;
grant select, insert, update, delete on saved_places to authenticated;
grant all on saved_places to service_role;

comment on table saved_places is
  'Brukerens egne markerte steder (GPX-import + manuelt). Kun eieren, alltid. '
  'anon har INGEN rettigheter — se migrasjon 052 for hvorfor det må stå eksplisitt. '
  'Skal aldri inn i public_findings, prediksjonsmodellen eller noe aggregat.';
comment on column saved_places.waypoint_time is
  'Tidspunktet fra GPX-fila. Er IKKE en observasjonsdato — som regel da nåla ble satt.';
comment on column saved_places.import_batch_id is
  'Grupperer én import, slik at den kan angres i sin helhet.';

-- ── KONTROLL ────────────────────────────────────────────────────────────────
-- Kjør etterpå. Forventet: 1 tabell, 4 policyer, 2 triggere, 0 anon-grants.
--
-- select
--   (select count(*) from information_schema.tables
--      where table_schema = 'public' and table_name = 'saved_places')            as tabell,
--   (select count(*) from pg_policies
--      where schemaname = 'public' and tablename = 'saved_places')               as policyer,
--   (select count(*) from information_schema.triggers
--      where event_object_table = 'saved_places')                                as triggere,
--   (select count(*) from information_schema.role_table_grants
--      where table_name = 'saved_places' and grantee = 'anon')                   as anon_grants;
