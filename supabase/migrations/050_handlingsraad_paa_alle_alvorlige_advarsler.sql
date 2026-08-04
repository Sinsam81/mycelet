-- HANDLINGSRÅD PÅ ALLE KRITISKE OG HØYE FORVEKSLINGSADVARSLER (2026-08-04)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- FUNNET KOM FRA EN TEST VI NETTOPP SKREV
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Da forvekslingsdataene i 048/049 ble skrevet, kom det ut to regler for tekst
-- som leses av noen som står i skogen med en sopp i hånda:
--
--   1. En felttest kan dømme et funn ute. Den kan aldri frikjenne det.
--   2. En alvorlig advarsel må ende i noe brukeren kan GJØRE.
--
-- Regel 2 ble gjort til en test som kjører mot selve migrasjonstekstene
-- (src/lib/species/__tests__/forvekslingstekst.test.ts). Den fant med én gang
-- at regelen ikke var fulgt i det som allerede STO I PRODUKSJON:
--
--   17 av 22 kritiske og høye advarsler manglet handlingsråd.
--
-- Blant dem de dødeligste parene appen har:
--   Grønnkremle        -> Grønn fluesopp     (amatoksin, leversvikt)
--   Snøballsjampinjong -> Grønn fluesopp
--   Spiss morkel       -> Sandmorkel
--   Vanlig morkel      -> Sandmorkel
--   Nellikhatt         -> Hvit traktsopp     (muskarin)
--   Honningsopp        -> Flatklokkehatt     (amatoksin)
--
-- Tekstene beskrev faren presist. De sa bare aldri hva man skulle gjøre med den.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HVORFOR DET BETYR NOE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- En advarsel som beskriver faren uten å gi et råd, etterlater valget hos noen
-- som nettopp har fått vite at de er usikre — i skogen, ofte med dårlig lys og
-- en halvfull kurv. Da er terskelen for å ta den med lavere enn den burde være.
--
-- «La den stå» er det eneste rådet som ALLTID er trygt. Det koster en middag når
-- det er unødvendig, og det er hele kostnaden.
--
-- Merk at dette ikke er en ny tekst som overstyrer den gamle: setningen legges
-- TIL, slik at kjennetegnene står som de gjorde.

UPDATE look_alikes
SET difference_description =
  rtrim(difference_description)
  || CASE WHEN rtrim(difference_description) ~ '[.!?]$' THEN ' ' ELSE '. ' END
  || 'Ved tvil — la den stå.'
WHERE danger_level IN ('critical', 'high')
  AND difference_description IS NOT NULL
  AND difference_description <> ''
  -- Idempotent: rader som allerede gir et råd røres ikke, så migrasjonen kan
  -- kjøres flere ganger uten å stable setninger oppå hverandre.
  AND difference_description !~* '(la\s+(den\s+)?stå|kast|ikke\s+spis)';

-- Fasit: skal gi 0 rader etter kjøring.
-- SELECT count(*) FROM look_alikes
-- WHERE danger_level IN ('critical','high')
--   AND difference_description !~* '(la\s+(den\s+)?stå|kast|ikke\s+spis)';
