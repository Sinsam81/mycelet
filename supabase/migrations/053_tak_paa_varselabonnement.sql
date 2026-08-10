-- 053: Tak på antall varselabonnement per bruker.
--
-- /api/me/soppvarsel validerer regionnavnet og rate-limiter, men tabellen kan
-- også nås DIREKTE via PostgREST med authenticated-rollen — det er hele
-- poenget med RLS-designet i 051, og ruta bruker sesjonsklienten med vilje.
-- Prisen er at valideringen i ruta kan omgås: unique er (user_id, region), og
-- region har ingen FK eller CHECK (lista bor i koden), så én innlogget bruker
-- kan legge inn tusenvis av rader med oppdiktede regionnavn i én array-INSERT
-- og blåse opp tabellen cron-jobben leser hver natt.
--
-- Taket lukker det uten å røre RLS-designet. 20 er romslig: grensesnittet
-- tilbyr ETT område, og selv en framtidig flervalgs-UI kommer ikke i nærheten.
--
-- Ingen SECURITY DEFINER: for authenticated teller RLS-synlige rader, som
-- nettopp er brukerens egne (policyene i 051 er auth.uid() = user_id), og
-- service_role ser alt og teller riktig uansett.

create or replace function enforce_alert_subscription_cap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from alert_subscriptions where user_id = new.user_id) >= 20 then
    raise exception 'For mange varselabonnement for brukeren (maks 20)';
  end if;
  return new;
end;
$$;

drop trigger if exists alert_subscriptions_cap on alert_subscriptions;
create trigger alert_subscriptions_cap
  before insert on alert_subscriptions
  for each row execute function enforce_alert_subscription_cap();

comment on function enforce_alert_subscription_cap() is
  'Maks 20 varselabonnement per bruker. Stopper array-INSERT-flom via PostgREST — se migrasjon 053.';
