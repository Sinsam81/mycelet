-- 031: utvide meldegrunnene på reports.
--
-- Bakgrunn: vilkårene har fått et punkt om melding av ulovlig innhold, og
-- forbudslisten dekker nå narkotiske sopper, andres personopplysninger i bilder
-- og salg av plukket sopp. Rapporter-knappen kunne ikke uttrykke noen av dem —
-- grunnene var 'spam', 'inappropriate', 'misinformation', 'dangerous_advice',
-- 'harassment' og 'other'. Meldekanalen kunne altså ikke fange opp nettopp det
-- innholdet vilkårene forbyr, og alt havnet under «annet».
--
-- Additiv: ingen eksisterende verdi fjernes, så rader som finnes fra før består.
-- Constraint-navnet slås opp framfor å gjettes, siden det ble generert av
-- Postgres da tabellen ble laget i 001.

begin;

do $$
declare
  c_name text;
begin
  -- Finn den eksisterende sjekken på reason, uansett hva den heter.
  select con.conname into c_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'reports'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%reason%'
  limit 1;

  if c_name is not null then
    execute format('alter table public.reports drop constraint %I', c_name);
  end if;
end $$;

alter table public.reports
  add constraint reports_reason_check check (reason in (
    -- Fra før:
    'spam',
    'inappropriate',
    'misinformation',
    'dangerous_advice',
    'harassment',
    'other',
    -- Nye, speiler forbudslisten i vilkårene punkt 5 og meldepunktet i punkt 7:
    'illegal_content',        -- ulovlig innhold generelt
    'controlled_substances',  -- narkotiske sopper, voksesteder, dyrking, salg
    'privacy',                -- personopplysninger eller bilde av noen uten samtykke
    'protected_species',      -- vernet art eller verneområde
    'sale'                    -- salg av plukket sopp gjennom tjenesten
  ));

commit;

-- Kontroll: skal liste 11 tillatte verdier.
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'reports_reason_check';
