-- 052: Ta fra anon leserettighetene på alert_subscriptions.
--
-- ── HVA SOM VAR GALT ────────────────────────────────────────────────────────
--
-- Migrasjon 051 skrev «⚠️ Ingen grants til anon» og ga bare authenticated og
-- service_role rettigheter. Den kommentaren var usann i det øyeblikket den ble
-- skrevet: prosjektet har
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, …
--
-- stående (se gjenopprettingsblokka i CLAUDE.md, lagt inn etter en
-- DROP SCHEMA-hendelse). Nye tabeller får derfor ALLE rettigheter for anon
-- automatisk, og en migrasjon som bare unnlater å nevne anon endrer ingenting.
--
-- Verifisert mot produksjon rett etter at 051 kjørte: et anon-kall til
--   /rest/v1/alert_subscriptions?select=*
-- svarte 200, ikke 42501.
--
-- ── HVA SOM LIKEVEL IKKE VAR ÅPENT ──────────────────────────────────────────
--
-- Ingen rader lakk. RLS er på, og SELECT-policyen er auth.uid() = user_id — en
-- uinnlogget har uid null og ser derfor ingenting. Svaret var 200 med tom liste,
-- ikke 200 med data.
--
-- Men da hvilte hele beskyttelsen på RLS alene. Det er ett lag der det skal være
-- to, og tabellen inneholder nettopp de to tingene som ikke tåler et uhell:
-- hvilket område en navngitt bruker planlegger å dra til, og avmeldingstokenet
-- som lar hvem som helst slå av varselet til den brukeren.
--
-- Migrasjon 044 er presedensen: der ble to kolonner droppet fra profiles nettopp
-- fordi USING (true) + anon-grant gjorde dem lesbare for alle med den offentlige
-- nøkkelen. Lærdommen derfra er at grants i dette prosjektet må skrives
-- eksplisitt, ikke antas.

revoke all on alert_subscriptions from anon;

-- region_daily_scores beholder anon-lesing med vilje: de samme tallene står
-- åpent på /soppforhold, uten innlogging. Se 051.

comment on table alert_subscriptions is
  'Soppvarsel per bruker og region. Beslutningslogikken ligger i src/lib/alerts/decision.ts. '
  'anon har INGEN rettigheter her — se migrasjon 052; default privileges gir dem ellers automatisk.';
