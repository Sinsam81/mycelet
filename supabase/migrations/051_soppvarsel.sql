-- 051: Soppvarsel — e-post når forholdene snur i ditt område.
--
-- Beslutningen om NÅR et varsel sendes ligger i src/lib/alerts/decision.ts, med
-- tester. Denne migrasjonen er bare lagringen den trenger.
--
-- ── HVORFOR EN EGEN TABELL OG IKKE EN KOLONNE PÅ profiles ───────────────────
--
-- Migrasjon 044 droppet notification_preferences fra profiles med en begrunnelse
-- som gjelder like mye her: SELECT-policyen på profiles er «Profiler er synlige
-- for alle» USING (true), og RLS kan ikke begrense KOLONNER. Alt som ligger i
-- profiles er lesbart for hvem som helst med den offentlige anon-nøkkelen.
--
-- Et varselabonnement røper hvilket område en navngitt bruker planlegger å dra
-- til, og inneholder dessuten et avmeldingstoken som må være hemmelig. Ingen av
-- delene tåler en USING (true)-policy. Derfor egen tabell, med policyer som
-- bare slipper eieren til.
--
-- ── AVMELDINGSTOKENET ───────────────────────────────────────────────────────
--
-- En avmeldingslenke må virke uten innlogging. Åpner du e-posten på en telefon
-- der du ikke er logget inn, og eneste vei ut er «logg inn først», er det i
-- praksis ingen vei ut — og da havner vi i søppelposten i stedet.
--
-- Tokenet er derfor en tilfeldig uuid som identifiserer raden alene. Det leses
-- KUN av service-role (avmeldingsruta), aldri av anon eller authenticated:
-- policyene under gir ingen SELECT som eksponerer kolonnen til andre enn eieren
-- selv. Den som har lenka kan melde seg av — og ingenting annet.

create table if not exists alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Navnet på regionen slik det står i src/lib/prediction/tile-regions.ts.
  -- Ingen FK: regionlista bor i koden, ikke i databasen, og en region som
  -- fjernes derfra skal ikke slette brukerens rad — den skal bare slutte å
  -- matche, slik at cron-jobben hopper over den.
  region text not null,

  -- Språket brukeren hadde da abonnementet ble satt opp. Cron-jobben ser aldri
  -- MYCELET_LOCALE-cookien (den kjører uten en request fra brukeren), og
  -- slettevarselet i supabase/functions/_shared/email.ts måtte derfor sende
  -- BEGGE språk i samme e-post. Her vet vi det, så her slipper vi.
  locale text not null default 'nb' check (locale in ('nb', 'sv')),

  active boolean not null default true,

  -- Sist sendte varsel. Karantenen i decision.ts leser denne.
  last_notified_at timestamptz,
  -- Scoren vi meldte fra om sist. Lagres for feilsøking og for å kunne svare
  -- «hva sa vi til denne brukeren» uten å grave i e-postloggen.
  last_notified_score integer,

  unsubscribe_token uuid not null default gen_random_uuid(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Ett abonnement per bruker per region. Vil de ha to områder, blir det to
  -- rader — men samme område to ganger er alltid en feil.
  unique (user_id, region)
);

-- Cron-jobben henter alle aktive abonnementer gruppert på region.
create index if not exists alert_subscriptions_active_region_idx
  on alert_subscriptions (region)
  where active;

-- Avmeldingsruta slår opp på tokenet alene.
create unique index if not exists alert_subscriptions_unsubscribe_token_idx
  on alert_subscriptions (unsubscribe_token);

create trigger alert_subscriptions_updated_at
  before update on alert_subscriptions
  for each row execute function update_updated_at();

alter table alert_subscriptions enable row level security;

-- Eieren, og bare eieren. Service-role går utenom RLS og brukes av cron-jobben
-- og avmeldingsruta.
create policy "Egne varselabonnement er synlige for eieren"
  on alert_subscriptions for select
  using (auth.uid() = user_id);

create policy "Egne varselabonnement kan opprettes av eieren"
  on alert_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Egne varselabonnement kan endres av eieren"
  on alert_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Egne varselabonnement kan slettes av eieren"
  on alert_subscriptions for delete
  using (auth.uid() = user_id);

-- ⚠️ Å UTELATE anon HER ER IKKE NOK — se migrasjon 052.
--
-- Denne linja sto opprinnelig med kommentaren «ingen grants til anon», og den
-- var usann: prosjektet har ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO
-- anon (CLAUDE.md), så nye tabeller får anon-rettigheter automatisk. Verifisert
-- mot produksjon rett etter at denne migrasjonen kjørte. 052 gjør den
-- eksplisitte REVOKE-en. Radene var aldri åpne — RLS holdt — men beskyttelsen
-- hvilte på ett lag der den skal hvile på to.
grant select, insert, update, delete on alert_subscriptions to authenticated;
grant all on alert_subscriptions to service_role;

comment on table alert_subscriptions is
  'Soppvarsel per bruker og region. Beslutningslogikken ligger i src/lib/alerts/decision.ts.';
comment on column alert_subscriptions.unsubscribe_token is
  'Lar avmeldingslenka i e-posten virke uten innlogging. Må aldri eksponeres til anon.';


-- ── Regionens dagsscore, lagret ─────────────────────────────────────────────
--
-- Varselet trenger å vite hva scoren var i går og hva den lavest var den siste
-- uka. Å regne det ut fra prediction_tiles ville krevd åtte dagers rastere:
-- PostgREST kapper på 1000 rader, regionsruta paginerer derfor i inntil 20
-- sider, og åtte dager blir 160 spørringer hver natt for et svar som er 22 tall.
--
-- Denne tabellen er de 22 tallene. Cron-jobben skriver dagens rad når den
-- kjører, og leser historikken herfra. Den er også en gave til /soppforhold,
-- som i dag regner ut det samme på nytt ved hver revalidering.
--
-- SELVSTARTENDE: første natt finnes ingen gårsdag, og decision.ts svarer da
-- «ingen-gaardag» og tier. Etter en uke er historikken full. Det er riktig
-- oppførsel — vi gjetter ikke på brukerens vegne fordi vi mangler data.
create table if not exists region_daily_scores (
  region text not null,
  tile_date date not null,
  -- 90-persentilen blant flisene i regionen — «der det er best i regionen»,
  -- ikke snittet. Se filhodet i src/app/api/prediction/regions/route.ts for
  -- hvorfor snittet ville straffet Bergen for å ha sjø i rutenettet.
  score integer not null check (score between 0 and 100),
  created_at timestamptz not null default now(),
  primary key (region, tile_date)
);

create index if not exists region_daily_scores_date_idx
  on region_daily_scores (tile_date desc);

alter table region_daily_scores enable row level security;

-- Tallene er ikke hemmelige — de samme står på /soppforhold, som er offentlig
-- uten innlogging. Lesetilgang for alle er derfor riktig, og lar en framtidig
-- graf over sesongen hentes rett fra klienten.
create policy "Regionscorer er offentlige"
  on region_daily_scores for select
  using (true);

grant select on region_daily_scores to anon, authenticated;
grant all on region_daily_scores to service_role;

comment on table region_daily_scores is
  'Daglig 90-persentil-score per region. Skrives av /api/cron/soppvarsel, leses av varselet og av /soppforhold.';
