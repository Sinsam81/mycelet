-- 038: rett brukernavn som er en hel e-postadresse.
--
-- HVA SOM SKJEDDE
-- Migrasjon 037 bakfylte profilrader for ti kontoer som manglet. Regel 1 i den
-- migrasjonen er «bruk det brukeren skrev i brukernavn-feltet ved
-- registrering». To brukere hadde skrevet hele e-postadressen sin der:
--
--   Trinesavoi@yahoo.com    (visningsnavn: Trinemor1980)
--   Moyfridovea@gmail.com   (visningsnavn: Frida)
--
-- Brukernavn er OFFENTLIG — `public_findings` velger `p.username` (migrasjon
-- 001, 005, 015), og navnet vises på funn, i forumet og på profilsider. Begge
-- hadde samtidig fylt inn et fornuftig visningsnavn, så de mente åpenbart ikke
-- at adressen skulle bli det offentlige navnet deres.
--
-- Ingen rakk å bli eksponert: uten profilrad kunne de ikke poste noe, så det
-- finnes ingen offentlige rader med disse navnene. Men første gang de la ut et
-- funn ville adressen stått der. Denne migrasjonen retter det før det skjer.
--
-- HVA DEN GJØR
-- Kutter alt fra og med `@` for brukernavn som ser ut som en e-postadresse
-- (lokaldel + `@` + domene med punktum). Samme regel som toPublicUsername() i
-- src/lib/auth/username.ts, som nå hindrer at det oppstår på nytt.
--
-- Kollisjon håndteres: er lokaldelen allerede opptatt, legges et kort suffiks på.
-- Visningsnavnet røres ikke — det er brukerens eget valg og er ikke en adresse.
--
-- Idempotent: kjører du den igjen, finner den ingen rader å rette.

DO $$
DECLARE
  rad       RECORD;
  lokaldel  TEXT;
  kandidat  TEXT;
  forsok    INT;
  rettet    INT := 0;
BEGIN
  FOR rad IN
    SELECT id, username
      FROM public.profiles
     -- Lokaldel, krøllalfa, domene med punktum. Krøllalfa først (uten lokaldel)
     -- er et håndtak, ikke en adresse, og treffes ikke av dette mønsteret.
     WHERE username ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  LOOP
    lokaldel := split_part(rad.username, '@', 1);
    kandidat := lokaldel;
    forsok := 0;

    WHILE EXISTS (
      SELECT 1 FROM public.profiles
       WHERE username = kandidat AND id <> rad.id
    ) LOOP
      forsok := forsok + 1;
      kandidat := lokaldel || '-' || left(rad.id::text, 6) ||
                  CASE WHEN forsok > 1 THEN '-' || forsok ELSE '' END;
      IF forsok > 10 THEN
        RAISE EXCEPTION 'Fant ikke ledig brukernavn for profil %', rad.id;
      END IF;
    END LOOP;

    UPDATE public.profiles
       SET username = kandidat
     WHERE id = rad.id;

    rettet := rettet + 1;
    RAISE NOTICE 'Rettet brukernavn: % -> %', rad.username, kandidat;
  END LOOP;

  RAISE NOTICE 'Totalt rettet: % brukernavn', rettet;
END $$;

-- ── Kontroll etter kjøring ─────────────────────────────────────────────────
-- Skal gi NULL RADER:
--
-- SELECT id, username FROM public.profiles
--  WHERE username ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
