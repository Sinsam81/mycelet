-- 061: Loggen over hva @mycelet har publisert på X.
--
-- To jobber i én tabell:
--   1. DEDUPE: unik (dato, type) gjør publiseringen idempotent — kjører cron
--      to ganger samme dag (manuell trigger, retry), blir det likevel maks én
--      omslagspost og én ukesoppsummering. Raden settes inn FØR kallet mot X.
--   2. REVISJON: teksten som faktisk gikk ut, med X sin post-id, står her —
--      samme åpenhetskultur som varsel_hendelser (060).
--
-- tweet_id er NULL når innsettingen lyktes men X-kallet feilet. Det er et
-- bevisst valg at det IKKE prøves på nytt samme dag: en halvferdig kjøring
-- skal aldri kunne bli to nesten like poster. Neste dag er en ny rad.
--
-- Ingen RLS-policyer med vilje: skrives og leses kun av cron via service-role.

create table if not exists x_innlegg (
  id uuid primary key default gen_random_uuid(),
  dato date not null,
  type text not null check (type in ('omslag', 'ukesoppsummering')),
  tekst text not null,
  tweet_id text,
  created_at timestamptz not null default now(),
  unique (dato, type)
);

alter table x_innlegg enable row level security;
