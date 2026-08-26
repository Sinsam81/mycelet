-- ============================================
-- Migrasjon 055: identifiseringshistorikk («mine identifiseringer»)
-- ============================================
--
-- Design: docs/identifiseringshistorikk-design.md
--
-- HVORFOR EN NY TABELL OG IKKE FLERE KOLONNER PÅ ai_identifications:
--
-- ai_identifications (migrasjon 020) er kvotetelleren. Den har RLS på med NULL
-- policyer med vilje, slik at bare tjenesterollen ser den — ellers kunne en
-- gratisbruker slettet rader og nullstilt sin egen dagskvote på fem
-- AI-identifiseringer. Hvert kall koster oss penger hos Kindwise.
--
-- Historikken må ha den motsatte egenskapen: brukeren SKAL kunne slette den
-- (åpenbar UX, og GDPR art. 17 gjør det til en rettighet). De to kravene kan
-- ikke bo i samme tabell. Slår man dem sammen, gir man samtidig bort
-- ubegrenset AI-bruk på egen regning.
--
-- Derfor: ett Kindwise-kall skriver én rad i HVER tabell. De er helt frakoblet.
-- Sletter brukeren en historikkrad, står kvoteraden igjen — den inneholder bare
-- bruker-id og et tidspunkt.
--
-- Krever pgcrypto (gen_random_uuid) fra migrasjon 001 og mushroom_species +
-- findings fra samme.

-- ---------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CASCADE, ikke SET NULL: dette er rene persondata uten forskningsverdi.
  -- (Negative observasjoner i `findings` anonymiseres og beholdes som
  -- treningsdata — se migrasjon 011. Det gjelder IKKE her.)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Hva AI-en foreslo. Toppforslaget er løftet ut i egne kolonner fordi lista
  -- sorterer og filtrerer på det; hele topp-3 ligger i `suggestions`.
  top_suggestion_name TEXT NOT NULL,
  top_species_id INT REFERENCES mushroom_species(id) ON DELETE SET NULL,
  top_probability SMALLINT,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  safety_data_incomplete BOOLEAN NOT NULL DEFAULT FALSE,

  -- Posisjon: EKSAKT, ikke grovkornet.
  --
  -- Raden er en funn-kladd. Grovkornet vi her, ville et funn som lagres SENERE
  -- fra historikken fått dårligere posisjon enn ett som lagres med én gang — og
  -- presisjonen på egne steder er kjernen i «Mine steder». Beskyttelsen ligger i
  -- at raden er eier-låst og aldri er med i noe view, noen RPC eller noe
  -- offentlig lag. display_location-triggeren gjelder ikke, fordi ingenting her
  -- noen gang vises for andre enn eieren.
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  -- Sti i den PRIVATE bøtta identify-history — aldri en offentlig URL.
  -- Settes ved innsetting (den er determinert: <user_id>/<id>.jpg), slik at
  -- klienten ikke trenger å skrive den etterpå. Feiler opplastingen, peker
  -- stien på et objekt som ikke finnes, og lesesiden viser en plassholder.
  image_path TEXT,
  -- Hvor mange bilder som ble ANALYSERT (1-3). Vi tar vare på ett. Kortet skal
  -- kunne si det ærlig i stedet for å late som om alle tre er bevart.
  image_count SMALLINT NOT NULL DEFAULT 1,

  -- SET NULL, ikke CASCADE: sletter brukeren funnet, skal ikke identifiseringen
  -- forsvinne med det. Raden blir «ikke lagret» igjen og kan lagres på nytt.
  finding_id UUID REFERENCES findings(id) ON DELETE SET NULL,
  saved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_identifications_user_time
  ON identifications (user_id, created_at DESC);

-- Retensjonsjobben (/api/cron/purge-identifications) skanner på alder alene.
CREATE INDEX IF NOT EXISTS idx_identifications_created
  ON identifications (created_at);

COMMENT ON TABLE identifications IS
  'Brukerens egen AI-identifiseringshistorikk. Eier-låst, slettbar av brukeren, 12 måneders retensjon. IKKE kvotetelleren — den er ai_identifications (migrasjon 020) og må aldri slås sammen med denne.';

-- ---------------------------------------------------------------
-- 2. RLS — eier og bare eier
-- ---------------------------------------------------------------
ALTER TABLE identifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own identifications" ON identifications;
CREATE POLICY "Users read own identifications" ON identifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- WITH CHECK på skriv: ingen kan sette inn eller omadressere en rad til en
-- annen bruker.
DROP POLICY IF EXISTS "Users insert own identifications" ON identifications;
CREATE POLICY "Users insert own identifications" ON identifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own identifications" ON identifications;
CREATE POLICY "Users update own identifications" ON identifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own identifications" ON identifications;
CREATE POLICY "Users delete own identifications" ON identifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- 3. Rettigheter
-- ---------------------------------------------------------------
-- REKKEFØLGEN HER ER HELE POENGET: revoke FØRST, så grant.
--
-- Supabase har ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon,
-- authenticated, service_role. En ny tabell får derfor automatisk FULLE
-- rettigheter til begge rollene i det den opprettes — før en eneste linje
-- under har kjørt.
--
-- Det betyr at et bart «GRANT UPDATE (finding_id, saved_at)» ikke begrenser
-- noe som helst: den tabell-brede UPDATE-en ligger allerede der, og en
-- kolonne-grant er additiv. Man ville trodd man hadde en smal rettighet mens
-- man i praksis hadde alle kolonner. Revoke-linjene er det som gjør den smal.
REVOKE ALL ON identifications FROM anon;
REVOKE ALL ON identifications FROM authenticated;

-- RLS kan ikke begrense HVILKE kolonner som skrives — bare hvilke RADER. Uten
-- kolonne-grant kunne en bruker skrevet om top_suggestion_name på sin egen rad.
-- Harmløst i praksis (ingenting utleder sikkerhet fra historikken), men gratis
-- å gjøre riktig: appen oppdaterer kun koblingen til funnet.
--
-- service_role røres ikke — den beholder full tilgang (og går uansett forbi
-- RLS), og både kontoslettingen og retensjonsjobben er avhengige av det.
GRANT SELECT, INSERT, DELETE ON identifications TO authenticated;
GRANT UPDATE (finding_id, saved_at) ON identifications TO authenticated;

-- ⚠️ MERK: gjenopprettingsblokka etter «DROP SCHEMA public CASCADE» (CLAUDE.md)
-- kjører GRANT ALL ON ALL TABLES, som ville utvidet UPDATE tilbake til alle
-- kolonner og gitt anon tilgang. Kjører du den blokka, kjør de fire linjene
-- over på nytt etterpå.

-- ---------------------------------------------------------------
-- 4. Bildebøtta — PRIVAT
-- ---------------------------------------------------------------
-- finding-images og forum-images er offentlige (migrasjon 019), og
-- src/lib/storage/upload-path.ts dokumenterer allerede at det er en kjent
-- svakhet vi ikke kan rulle tilbake uten å bryte URL-er som ligger lagret i
-- databasen. Denne bøtta er ny, så her gjør vi det riktig med én gang:
-- private objekter, lest via kortlevde signerte URL-er.
--
-- 2 MB-taket er rikelig: bildene re-kodes til 640 px / q0,72 før opplasting
-- (~60 KB). Taket finnes for å hindre at noen laster opp noe helt annet.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('identify-history', 'identify-history', false, 2097152, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Ingen offentlig lesepolicy. Alle fire operasjonene krever at første ledd i
-- filstien er brukerens egen id — samme mappekonvensjon som migrasjon 019, og
-- den deleteUserStorageObjects nøkler på ved kontosletting.
DROP POLICY IF EXISTS "Owners read own identify history images" ON storage.objects;
CREATE POLICY "Owners read own identify history images" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'identify-history'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owners upload own identify history images" ON storage.objects;
CREATE POLICY "Owners upload own identify history images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'identify-history'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owners update own identify history images" ON storage.objects;
CREATE POLICY "Owners update own identify history images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'identify-history'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'identify-history'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owners delete own identify history images" ON storage.objects;
CREATE POLICY "Owners delete own identify history images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'identify-history'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
