-- 039: Rydd opp i eierløse funn som overlevde en kontosletting.
--
-- Lanseringsrevisjon, infra/data-funn 2 og 4. Verifisert mot produksjon
-- 2026-08-02 med tjenestenøkkel: findings har 10 rader, hvorav 5 har
-- user_id IS NULL. Alle fem er opprettet 2026-06-12, alle har
-- is_negative_observation = false, og tre av dem har visibility = 'private'
-- med eksakt latitude/longitude i behold (display_* er NULL for private).
--
-- HVORFOR DE ER DER
-- Migrasjon 011 endret findings.user_id fra ON DELETE CASCADE til SET NULL, med
-- den uttrykkelige forutsetningen at /api/me/delete sletter det som IKKE skal
-- anonymiseres først (positive funn + private funn). Ruta gjør nettopp det
-- (src/app/api/me/delete/route.ts, STEP 1). Radene her finnes altså fordi en
-- konto ble slettet et ANNET sted enn i appen — mest sannsynlig direkte i
-- Supabase-dashbordet. Da kjørte ingen av slettereglene, bare FK-en.
--
-- HVORFOR DET ER ET AVVIK
-- Retensjonspolicyen og personvernerklæringen sier at private observasjoner
-- alltid slettes. Tre eksakte voksesteder ligger igjen uten eier og uten
-- sletteregel. Ingen kan lese dem gjennom API-et i dag (SELECT-policyen på
-- findings krever auth.uid() = user_id, og NULL matcher aldri), men etter
-- GDPR art. 5(1)(e) og 17 er selve lagringen avviket. Én endring — en LEFT JOIN
-- i public_findings, eller et nytt uttrekk som ikke joiner mot profiles —
-- publiserer dem.
--
-- HVA SOM BLIR IGJEN ETTERPÅ
-- Bare eierløse NEGATIVE, ikke-private observasjoner. Det er nøyaktig det
-- migrasjon 011 sier skal overleve som anonymiserte treningsdata.
--
-- Kodefiksen som hindrer at det skjer igjen ligger i
-- supabase/functions/purge-inactive-accounts/index.ts (steg 3 sletter nå de
-- samme radene som /api/me/delete før auth-raden fjernes).
--
-- DRIFTSNOTAT: kontoer skal ALDRI slettes fra Supabase-dashbordet, bare via
-- /api/me/delete eller purge-inactive-accounts. Dashbordet kjører ingen av
-- appens sletteregler.
--
-- Idempotent: sletter kun rader som allerede er eierløse. Andre kjøring finner
-- ingenting. Rører ingen rad som har en eier.
--
-- Kontrollspørring — kjør FØR og ETTER.
-- `eierlose_som_skal_bort` skal være 0 etterpå:
--
--   SELECT count(*) FILTER (WHERE user_id IS NULL)            AS eierlose,
--          count(*) FILTER (WHERE user_id IS NULL
--                             AND (is_negative_observation = false
--                                  OR visibility = 'private')) AS eierlose_som_skal_bort,
--          count(*) FILTER (WHERE user_id IS NULL
--                             AND is_negative_observation = true
--                             AND visibility <> 'private')     AS eierlose_som_skal_bli,
--          count(*)                                            AS totalt
--     FROM public.findings;

DO $$
DECLARE
  slettet_positive INT := 0;
  slettet_private  INT := 0;
BEGIN
  -- Positive funn: skulle vært slettet, ikke anonymisert. Kun negative
  -- observasjoner har lov til å overleve som treningsdata.
  DELETE FROM public.findings
   WHERE user_id IS NULL
     AND is_negative_observation = false;
  GET DIAGNOSTICS slettet_positive = ROW_COUNT;

  -- Private observasjoner: display_* er NULL for disse, så det er den EKSAKTE
  -- posisjonen som ligger igjen. Gjelder også negative, private rader.
  DELETE FROM public.findings
   WHERE user_id IS NULL
     AND visibility = 'private';
  GET DIAGNOSTICS slettet_private = ROW_COUNT;

  RAISE NOTICE 'Eierløse funn slettet: % positive, % private',
    slettet_positive, slettet_private;
END $$;
