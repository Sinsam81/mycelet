-- 060: Fasit-sløyfen, del 1 — loggen over sendte varsler per region.
--
-- Strategivalget bak (2026-08-31): veien til å bli go-to for soppvarsel er å
-- være ETTERPRØVBAR. Hvert varsel skal kunne følges opp med en fasit: «vi
-- varslet omslag i Oslo — uken etter kom det N funn, mot M uken før». For det
-- trengs et sted der selve varselhendelsen står — abonnementstabellen husker
-- bare siste varsel per abonnent, ikke historikken per region.
--
-- Én rad per region per kjøring som faktisk sendte varsler. Ingen RLS-policyer
-- med vilje: tabellen leses av /apenhet (server) og skrives av cron — begge
-- via service-role. Fasit-TALLENE lagres ikke her: de regnes live fra funnene
-- (egne + GBIF) og MODNES etter hvert som Artsobservasjoner publiserer til
-- GBIF med ukers etterslep. En lagret fasit ville frosset det umodne tallet.

create table if not exists varsel_hendelser (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  dato date not null,
  fra_score integer not null,
  til_score integer not null,
  created_at timestamptz not null default now(),
  unique (region, dato)
);

create index if not exists varsel_hendelser_dato_idx on varsel_hendelser (dato desc);

alter table varsel_hendelser enable row level security;
