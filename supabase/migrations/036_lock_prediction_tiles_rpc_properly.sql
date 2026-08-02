-- 036: lukk prediksjons-RPC-en for anon PÅ ORDENTLIG.
--
-- HVORFOR 033 IKKE VIRKET
-- Migrasjon 033 gjorde `revoke execute ... from anon`. Den kjørte uten feil, og
-- lukket likevel ingenting: anon hentet fortsatt 763 fliser i ett kall etterpå.
--
-- Årsaken er en Postgres-standard som er lett å gå i: **enhver ny funksjon får
-- automatisk `EXECUTE` til rollen `PUBLIC`**. Alle roller arver fra PUBLIC, så
-- å ta rettigheten fra `anon` alene endrer ingenting så lenge PUBLIC beholder
-- den. Revoken var ikke feil — den var utilstrekkelig.
--
-- (Det samme gjelder trolig `GRANT ALL ON ALL FUNCTIONS ... TO anon` fra
-- gjenopprettingsblokka i CLAUDE.md, som kan ha gitt anon en direkte
-- rettighet i tillegg. Denne migrasjonen fjerner begge veier.)
--
-- REKKEFØLGEN ER BINDENDE
-- Revoke fra PUBLIC treffer ALLE roller, også `authenticated` og
-- `service_role`. Derfor må de to få rettigheten tilbake eksplisitt i samme
-- transaksjon — ellers slutter kartet å virke for innloggede brukere og
-- /api/prediction slutter å virke for alle.
--
-- HVEM SOM SKAL HA DEN, OG HVORFOR
--   anon           NEI  — den offentlige nøkkelen skal ikke kunne tømme
--                         rasteret. Det var hele poenget med migrasjon 015.
--   authenticated  JA   — kartet (src/components/map/MushroomMap.tsx) kaller
--                         RPC-en direkte fra nettleseren ved hver panorering.
--   service_role   JA   — /api/prediction bruker tjenestenøkkelen for nettopp
--                         dette kallet, slik at ruta virker utlogget.
--
-- DETTE ER IKKE EN BETALINGSMUR. En innlogget gratisbruker kan fortsatt kalle
-- den. Det er tilsiktet: den romlige delen av prediksjonen har en ærlig AUC
-- rundt 0,52, og å ta betalt for den ville vært å selge det svakeste appen gjør.
--
-- Idempotent: trygg å lime inn på nytt.

begin;

-- Selve hullet: PUBLIC. Uten denne linja er resten uten effekt.
revoke execute on function public.get_prediction_tiles_in_bounds(
  double precision, double precision, double precision, double precision, date, integer
) from public;

-- Og en eventuell direkte rettighet (som 033 allerede skal ha tatt).
revoke execute on function public.get_prediction_tiles_in_bounds(
  double precision, double precision, double precision, double precision, date, integer
) from anon;

-- Gi tilbake til dem som faktisk trenger den. MÅ stå her — revoken over traff
-- dem også, via PUBLIC.
grant execute on function public.get_prediction_tiles_in_bounds(
  double precision, double precision, double precision, double precision, date, integer
) to authenticated, service_role;

commit;

-- ── Kontroll etter kjøring ─────────────────────────────────────────────────
-- 1) Rettighetene skal se slik ut — anon skal IKKE stå i lista:
--
-- select grantee, privilege_type
-- from information_schema.role_routine_grants
-- where routine_name = 'get_prediction_tiles_in_bounds'
-- order by grantee;
--
-- 2) Den ekte prøven er å kalle den som anon utenfra. Det er den kontrollen
--    som avslørte at 033 ikke virket — rettighetstabellen alene er ikke nok,
--    fordi arv via PUBLIC ikke er åpenbar der.
--
-- 3) Og bekreft at kartet fortsatt virker: /api/prediction skal svare som før
--    for en utlogget besøkende.
