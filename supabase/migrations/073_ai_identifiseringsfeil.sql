-- 073: Feilede kall mot Kindwise, så dagsrapporten kan skille «ingen bruker
--      AI-en» fra «AI-en er død».
--
-- Bakgrunn: fra mai til 29. september 2026 feilet hvert eneste kall til
-- Kindwise (ruta sendte `language` og `details` i kroppen; de er
-- URL-parametre). Brukeren så «Identifikasjon feilet. Prøv igjen.», ruta
-- logget bare statuskoden til Vercel-loggen, Sentry filtrerer kindwise.com
-- med vilje, og ai_identifications (migrasjon 020) skrives KUN ved vellykket
-- kall — så alle tellinger sto på null, akkurat som om ingen brukte
-- funksjonen. 2 050 kreditter lå urørt i fire måneder.
--
-- Én rad per avvist Kindwise-svar, med HTTP-statusen. Ingen bruker-ID, ingen
-- IP, ingen bilde: raden sier bare «et kall feilet med 4xx/5xx». Det er ikke
-- personopplysninger, så tabellen er verken med i innsynsuttrekket eller
-- slettes med en konto. Dagsrapporten viser antall siste døgn og uke ved
-- siden av vellykkede kall og Kindwise sin egen kredittstatus, og varsler
-- når alle kall feiler.
--
-- Skrives best effort fra /api/identify med tjenesterollen (RLS på, ingen
-- policyer). Mangler tabellen, logger ruta en advarsel og brukeren får
-- svaret sitt som før. Ryddes av /api/cron/purge-identifications etter 30
-- dager.

CREATE TABLE IF NOT EXISTS ai_identifiseringsfeil (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status SMALLINT NOT NULL,
  opprettet TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_identifiseringsfeil_opprettet
  ON ai_identifiseringsfeil (opprettet DESC);

ALTER TABLE ai_identifiseringsfeil ENABLE ROW LEVEL SECURITY;
-- Med vilje ingen policyer: kun tjenesterollen (ruta, rapporten, ryddejobben).
REVOKE ALL ON ai_identifiseringsfeil FROM anon, authenticated;
