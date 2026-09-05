-- 064: Bruksdager — så vi vet om noen faktisk BRUKER soppforholdene.
--
-- Bakgrunn (docs/strategi-2026-2027.md, september 2026): 12 registreringer på
-- to dager etter at annonsebudene gikk opp, og null spor etter dem — ingen
-- tabell sa om de noen gang så prognosen igjen. «Aktivert» og «gjenbruk» for
-- innloggede brukere fantes som definisjoner i planen, ikke som data.
--
-- Én rad per bruker, dag og flate. Ingen posisjon, ingen tidspunkt utover
-- dagen (Oslo-dato), ingen innhold — bare at prognosen ble vist. For
-- områdesidene lagres områdenavnet (22 grove regioner), fordi partnerrapporten
-- skal kunne si «abonnentene fra Bergen bruker Bergen-siden».
--
--   flate   'hjem'    forsidens «soppforhold i dag»-kort
--           'kart'    /map (prognoselaget)
--           'omrade'  /soppforhold/<område>
--   omrade  regionslug for 'omrade', tom streng ellers (del av nøkkelen —
--           NULL i en primærnøkkel er ikke lov, og «ingen» er en gyldig verdi)
--
-- Skrives av /api/me/bruksdag med SESJONSKLIENTEN (RLS: egen rad). Slettes
-- med kontoen (cascade). Leses av dagsrapporten (service role) og av
-- GDPR-eksporten (egne rader). Personvernerklæringen beskriver den under
-- «Bruk av soppforholdene».

create table if not exists bruksdager (
  user_id    uuid not null references auth.users(id) on delete cascade,
  dag        date not null,
  flate      text not null check (flate in ('hjem', 'kart', 'omrade')),
  omrade     text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, dag, flate, omrade)
);

alter table bruksdager enable row level security;

drop policy if exists "Brukere registrerer egne bruksdager" on bruksdager;
create policy "Brukere registrerer egne bruksdager"
  on bruksdager for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Brukere leser egne bruksdager" on bruksdager;
create policy "Brukere leser egne bruksdager"
  on bruksdager for select to authenticated
  using (auth.uid() = user_id);

-- Rapporten leser «siste 28 dager» — indeks på dag først.
create index if not exists bruksdager_dag_idx on bruksdager (dag desc);

comment on table bruksdager is 'Én rad per bruker, Oslo-dato og flate der soppforholdene ble vist. Ingen posisjon. Grunnlag for «aktivert» og «gjenbruk» i dagsrapporten.';

notify pgrst, 'reload schema';
