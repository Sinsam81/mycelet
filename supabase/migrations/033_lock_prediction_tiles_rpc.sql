-- 033: ta fra `anon` retten til å kalle prediksjons-RPC-en direkte.
--
-- ⚠️ REKKEFØLGE ER VIKTIG. Denne migrasjonen skal kjøres ETTER at koden som
-- følger med den er deployet. Kjører du den først, slutter prediksjonen på
-- forsiden å virke for utloggede besøkende inntil deployen er ute.
--
-- BAKGRUNN
-- Migrasjon 015 låste direkte lesing av `prediction_tiles` fordi hele det
-- forhåndsberegnede rasteret kunne skrapes gratis via REST. Den lot samtidig
-- `get_prediction_tiles_in_bounds` stå åpen, «så API + kart fortsetter å virke».
--
-- Det gjenåpnet hullet gjennom en annen dør: funksjonen er SECURITY DEFINER og
-- omgår dermed RLS, og anon-nøkkelen er offentlig. Hvem som helst kunne kalle
-- /rest/v1/rpc/get_prediction_tiles_in_bounds med et stort bounding-box og
-- laste ned alt.
--
-- HVORFOR `anon` KAN FJERNES NÅ
-- /api/prediction er med vilje tilgjengelig utlogget, og kalte RPC-en med
-- kallerens sesjon — for en utlogget besøkende altså som `anon`. Derfor var
-- rettigheten bærende. Ruta bruker nå tjenestenøkkelen for akkurat dette kallet
-- (se kommentaren i src/app/api/prediction/route.ts), så `anon` trengs ikke.
--
-- HVORFOR `authenticated` BEHOLDER DEN
-- Kartet (src/components/map/MushroomMap.tsx) kaller RPC-en direkte fra
-- nettleseren ved hver panorering, for å slippe et rundturskall via API-et.
-- Det er en bevisst ytelsesavveining, og den er uendret her.
--
-- HVA DETTE IKKE GJØR
-- Dette er IKKE en betalingsmur. En innlogget gratisbruker kan fortsatt kalle
-- RPC-en. Det er tilsiktet: den romlige delen av prediksjonen har en ærlig AUC
-- rundt 0,52 — altså nær myntkast — og å ta betalt for den ville vært å selge
-- det svakeste appen gjør. Premium skiller seg på FORKLARINGEN (hvorfor et sted
-- scorer høyt), offline-kart og ubegrenset AI. Endringen her handler bare om at
-- den offentlige anon-nøkkelen ikke skal kunne tømme databasen.
--
-- Idempotent: trygg å lime inn på nytt.

begin;

revoke execute on function public.get_prediction_tiles_in_bounds(
  double precision, double precision, double precision, double precision, date, integer
) from anon;

commit;

-- ── Kontroll etter kjøring ─────────────────────────────────────────────────
-- Skal vise at anon IKKE har execute, mens authenticated og service_role har:
--
-- select
--   grantee,
--   privilege_type
-- from information_schema.role_routine_grants
-- where routine_name = 'get_prediction_tiles_in_bounds'
--   and grantee in ('anon', 'authenticated', 'service_role')
-- order by grantee;
--
-- Forventet: authenticated EXECUTE, service_role EXECUTE, ingen rad for anon.
