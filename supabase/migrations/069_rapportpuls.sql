-- 069: Rapportpuls — hvor mange soppfunn folk registrerte i Artsobservasjoner
-- (via GBIF) per område i uka som gikk, mot samme uke tidligere år og mot uka før.
--
-- Bakgrunn (docs/mikro-prediksjon-gjennomgang.md, 14. sep 2026): GBIF-strømmen
-- er et TIDS-signal, ikke et steds-signal. Alle sopparter per område, ikke per
-- art (kantarell alene: ~8 rapporter i uka for hele Norge). Bare Norge: Sverige
-- leverer til GBIF med ukers etterslep.
--
-- Etterslep målt 14. sep 2026 (Norge, 7-dagersvindu, 2026 mot snitt 2023–25):
-- vindu som slutter i dag 0,22 · for 3 dager siden 0,39 · for 7 dager siden
-- 0,54 · 14–42 dager 0,53–0,67. Tallene fylles altså på i ~en uke — derfor er
-- vinduet [dag−13, dag−7] («uka som gikk», til og med for en uke siden), og
-- trenden mot uka før bruker raden fra sju dager tidligere (samme alder), ikke
-- et nytt GBIF-kall.
--
-- Én rad per område og dag. baseline = snitt av samme vindu de tre foregående
-- årene (rapporteringen vokser år for år, så ikke lenger tilbake). NULL-avvik
-- når grunnlaget er for tynt (< 10). Hentes bare av cron (service role) og
-- leses av soppvarsel-e-posten, X-posten og dagsrapporten som FORKLARING —
-- aldri som utløser for varsel, ellers måler fasiten (som teller de samme
-- rapportene) seg selv.

create table if not exists rapportpuls (
  region       text not null,
  dag          date not null,
  fra          date not null,
  til          date not null,
  siste7       integer not null,
  baseline     numeric,
  avvik_pst    integer,
  aar_brukt    integer not null default 0,
  forrige_uke  integer,
  trend_pst    integer,
  hentet_at    timestamptz not null default now(),
  primary key (region, dag)
);

alter table rapportpuls enable row level security;
-- Ingen policyer med vilje: kun service role.

comment on table rapportpuls is 'Registrerte soppfunn (alle arter, GBIF/Artsobservasjoner) per område i vinduet [dag−13, dag−7] mot samme vindu de tre foregående årene (baseline) og mot raden sju dager før (forrige_uke, samme alder). Forklaring i varsler, aldri utløser.';

notify pgrst, 'reload schema';
