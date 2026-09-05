-- 055: Ekte fotograf- og lisenskreditering på artsbildene
--
-- Bakgrunn: alle 72 artsbildene er Wikimedia Commons-filer, men ble seedet
-- (012, 017) med `license = 'Wikimedia Commons'` — som er en KILDE, ikke en
-- lisens — og uten fotograf. CC BY og CC BY-SA krever navngiving av fotograf
-- OG lisens per bilde, med lenke til kilden. Slik det står nå, bruker appen
-- 72 bilder uten å oppfylle vilkårene for noen av dem.
--
-- Verdiene hentes fra Commons' eget API (extmetadata: Artist,
-- LicenseShortName) av scripts/backfill-photo-credits.mjs. Denne migrasjonen
-- lager bare plassen de skal ligge i.
--
-- Hvorfor kolonner på BEGGE tabellene: `mushroom_species.primary_image_url`
-- er en bevisst denormalisering (artslista, forsiden, kalenderen,
-- AI-resultatet og forvekslingssjekken leser den direkte, uten å røre
-- species_photos). Krediteringen må ligge samme sted som URL-en, ellers må
-- hver av de flatene legge til et join for å kunne vise fotografen.
-- Backfill-skriptet skriver begge steder i samme kjøring, av samme
-- Commons-svar — samme mønster som seedingen selv.
--
-- KJØRES SLIK: lim HELE filen inn i Supabase SQL Editor i én omgang.
-- Idempotent (ADD COLUMN IF NOT EXISTS): trygg å lime inn på nytt.
-- KJØR FØR scripts/backfill-photo-credits.mjs — skriptet nekter å starte
-- uten kolonnene under.

ALTER TABLE species_photos
  ADD COLUMN IF NOT EXISTS source_url TEXT;

COMMENT ON COLUMN species_photos.photographer IS
  'Opphavsperson, ren tekst. Fra Commons extmetadata.Artist (HTML strippet).';
COMMENT ON COLUMN species_photos.license IS
  'Lisensens kortnavn, f.eks. «CC BY-SA 4.0» eller «Public domain». Fra Commons extmetadata.LicenseShortName. IKKE en kilde — kilden hører hjemme i source_url.';
COMMENT ON COLUMN species_photos.source_url IS
  'Filsiden på Wikimedia Commons. Lenkemålet i krediteringslinja, og der de fulle lisensvilkårene står.';

ALTER TABLE mushroom_species
  ADD COLUMN IF NOT EXISTS primary_image_photographer TEXT,
  ADD COLUMN IF NOT EXISTS primary_image_license TEXT,
  ADD COLUMN IF NOT EXISTS primary_image_source_url TEXT;

COMMENT ON COLUMN mushroom_species.primary_image_photographer IS
  'Denormalisert kreditering for primary_image_url — speiler species_photos.photographer for samme bilde. Skrives av scripts/backfill-photo-credits.mjs.';
COMMENT ON COLUMN mushroom_species.primary_image_license IS
  'Denormalisert lisenskortnavn for primary_image_url — speiler species_photos.license for samme bilde.';
COMMENT ON COLUMN mushroom_species.primary_image_source_url IS
  'Denormalisert Commons-filside for primary_image_url — speiler species_photos.source_url for samme bilde.';
