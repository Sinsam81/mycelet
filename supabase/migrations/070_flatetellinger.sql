-- 070: Flatetellinger — anonym dagsteller for skjermene FØR konto i appen.
--
-- Bakgrunn (docs/konvertering-og-gjenbruk-2026-09.md § 2, september 2026):
-- to av tre installasjoner lager aldri konto, og ingen visste om de i det
-- hele tatt så første skjerm. Bruksdager (064) skrives bare for innloggede,
-- så alt før konto var mørkt. Dette er nevneren som manglet: hvor mange
-- ganger første skjerm i skallet (/soppforhold, utlogget) og
-- registreringsskjemaet (/auth/register) ble åpnet, per dag og språk.
--
-- Én rad per dag, flate og språk med et heltall. Ingen bruker-ID, ingen
-- enhets-ID, ingen IP, ikke klokkeslett — det er ikke persondata, og derfor
-- verken i GDPR-eksporten eller i kontosletting. Personvernerklæringen
-- nevner tellingen i én setning under «Bruk av soppforholdene».
--
-- Skrives BARE via funksjonen tell_flate fra /api/tell (service role).
-- RLS er på uten policyer: anon og authenticated kan verken lese eller
-- skrive tabellen direkte, og funksjonen kan bare kjøres av service_role.
-- Leses av dagsrapporten («Før konto i appen»).
--
--   flate   'soppforhold'  første skjerm i skallet, utlogget
--           'register'     registreringsskjemaet åpnet
--   sprak   'nb' | 'sv'    appens språk i økten

create table if not exists flatetellinger (
  dag     date not null,
  flate   text not null check (flate in ('soppforhold', 'register')),
  sprak   text not null check (sprak in ('nb', 'sv')),
  antall  integer not null default 0,
  primary key (dag, flate, sprak)
);

alter table flatetellinger enable row level security;
-- Ingen policyer med vilje: kun service role (via tell_flate under).

-- Én teller opp. security definer så eieren (postgres) skriver uansett RLS;
-- search_path låses så navnet ikke kan kapres via en annen schema.
create or replace function tell_flate(p_dag date, p_flate text, p_sprak text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into flatetellinger (dag, flate, sprak, antall)
  values (p_dag, p_flate, p_sprak, 1)
  on conflict (dag, flate, sprak)
  do update set antall = flatetellinger.antall + 1;
$$;

revoke all on function tell_flate(date, text, text) from public;
revoke all on function tell_flate(date, text, text) from anon;
revoke all on function tell_flate(date, text, text) from authenticated;
grant execute on function tell_flate(date, text, text) to service_role;

comment on table flatetellinger is 'Anonym dagsteller: antall åpninger av første skjerm (utlogget) og registreringsskjemaet i appen, per Oslo-dato og språk. Ingen identifikator. Skrives kun via tell_flate (service role).';

notify pgrst, 'reload schema';
