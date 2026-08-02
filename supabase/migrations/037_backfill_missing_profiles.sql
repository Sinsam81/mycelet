-- 037: Backfill profile rows for accounts that never got one.
--
-- Lanseringsrevisjon, funn H9/H20. Verifisert mot produksjon 2026-08-02:
-- 17 kontoer, 7 profiler — 10 kontoer uten profilrad, hvorav 7 har bekreftet
-- e-post og har logget inn (siste 29. juli).
--
-- Uten profilrad feiler ALT som har fremmednøkkel mot profiles: lagre funn,
-- poste i forumet, kommentere, like, rapportere. Brukeren registrerte seg,
-- bekreftet e-posten, logget inn — og appen gjør ingenting når hen prøver.
--
-- Kodefiksen (src/lib/auth/profile-self-heal.ts) reparerer dette for enhver
-- innlogget økt fra nå av, men den kan bare kjøre når brukeren faktisk åpner
-- appen igjen. Denne migrasjonen rydder opp i de som allerede står fast.
--
-- Brukernavnet utledes med SAMME regel som src/lib/auth/ensure-profile.ts:
--   1. user_metadata.username fra registreringen
--   2. ellers lokaldelen av e-posten
--   3. ellers 'bruker-<8 første tegn av id>'
-- og med den samme 23505-utveien: er navnet opptatt av en annen, legges
-- '-<6 første tegn av id>' på. Får vi fortsatt kollisjon, teller vi videre —
-- en migrasjon som stopper midtveis er verre enn et litt stygt brukernavn.
-- Brukeren kan endre navnet i profilinnstillingene etterpå.
--
-- Idempotent: rører kun kontoer som IKKE har profilrad, og INSERT-en har
-- ON CONFLICT (id) DO NOTHING. Kjøres den to ganger, gjør andre kjøring intet.
-- Ingen eksisterende profil oppdateres.
--
-- Kjøres i Supabase SQL Editor (rolle postgres, som eier profiles og dermed
-- ikke stoppes av RLS). Ingen filtrering på deleted_at: kontosletting i denne
-- appen er en hard delete av auth.users-raden (/api/me/delete), så det finnes
-- ikke myk-slettede kontoer å hoppe over.
--
-- Kontrollspørring — kjør FØR og ETTER. `mangler` skal være 0 etterpå:
--
--   SELECT (SELECT count(*) FROM auth.users)   AS kontoer,
--          (SELECT count(*) FROM public.profiles) AS profiler,
--          (SELECT count(*) FROM auth.users u
--             LEFT JOIN public.profiles p ON p.id = u.id
--            WHERE p.id IS NULL)               AS mangler;

DO $$
DECLARE
  konto        RECORD;
  onsket       TEXT;
  visningsnavn TEXT;
  kandidat     TEXT;
  forsok       INT;
  opprettet    INT := 0;
BEGIN
  FOR konto IN
    SELECT u.id, u.email, u.raw_user_meta_data
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
     WHERE p.id IS NULL
  LOOP
    -- Regel 1–3, i rekkefølge. NULLIF fanger tomme strenger, som ellers ville
    -- brutt NOT NULL/UNIQUE på username (flere tomme navn kolliderer).
    onsket := COALESCE(
      NULLIF(trim(konto.raw_user_meta_data ->> 'username'), ''),
      NULLIF(split_part(COALESCE(konto.email, ''), '@', 1), ''),
      'bruker-' || left(konto.id::text, 8)
    );
    visningsnavn := COALESCE(
      NULLIF(trim(konto.raw_user_meta_data ->> 'display_name'), ''),
      onsket
    );

    kandidat := onsket;
    forsok := 0;

    LOOP
      BEGIN
        INSERT INTO public.profiles (id, username, display_name)
        VALUES (konto.id, kandidat, visningsnavn)
        -- Fikk kontoen en profil imens (f.eks. brukeren logget inn mens
        -- migrasjonen kjørte), skal vi ikke røre den.
        ON CONFLICT (id) DO NOTHING;

        opprettet := opprettet + 1;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- Kun username kan havne her; id er dekket av ON CONFLICT over.
        forsok := forsok + 1;
        IF forsok = 1 THEN
          kandidat := onsket || '-' || left(konto.id::text, 6);
        ELSE
          kandidat := onsket || '-' || left(konto.id::text, 6) || '-' || forsok;
        END IF;

        IF forsok > 10 THEN
          RAISE EXCEPTION 'Fant ikke ledig brukernavn for konto %', konto.id;
        END IF;
      END;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Backfill av profiler: % rad(er) forsøkt opprettet', opprettet;
END $$;
