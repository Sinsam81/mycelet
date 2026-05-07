-- ============================================
-- Migration 009: Curated data for v1 priority species
-- ============================================
--
-- These five species are the launch targets for the prediction-engine v1
-- (decided 7. mai 2026; documented in docs/roadmap.md). Locking in their
-- prediction-relevant fields — genus, season window, peak season,
-- mycorrhizal partners, habitat tags — so:
--
--   * src/lib/utils/species-scoring.ts can resolve the right
--     GENUS_PREFERENCES profile via the genus column
--   * the season-gate in computeSpeciesAdjustment uses correct months
--   * future NIBIO/habitat scoring has reliable per-species inputs
--
-- Idempotent: INSERT ... ON CONFLICT (latin_name) DO UPDATE. Creates rows
-- if they don't exist, otherwise updates only the prediction-relevant
-- fields. Description / cap_description / etc. that may have been seeded
-- earlier are left untouched.
--
-- Numbers and habitat tags are field-knowledge defaults — they should be
-- tuned against real GBIF observation data once we run the backfill in
-- week 7 of the Phase 2 timeline.

-- ---------------------------------------------------------------
-- 1. Kantarell (Cantharellus cibarius)
-- Habitat: gammel barskog/blandingsskog, mosebunn, ikke for tett kronedekke
-- ---------------------------------------------------------------
INSERT INTO mushroom_species (
  norwegian_name, latin_name, edibility, genus,
  season_start, season_end, peak_season_start, peak_season_end,
  mycorrhizal_partners, habitat
) VALUES (
  'Kantarell', 'Cantharellus cibarius', 'edible', 'Cantharellus',
  7, 9, 8, 9,
  ARRAY['gran', 'furu', 'bjørk', 'eik'],
  ARRAY['barskog', 'blandingsskog', 'mose']
)
ON CONFLICT (latin_name) DO UPDATE SET
  genus = EXCLUDED.genus,
  season_start = EXCLUDED.season_start,
  season_end = EXCLUDED.season_end,
  peak_season_start = EXCLUDED.peak_season_start,
  peak_season_end = EXCLUDED.peak_season_end,
  mycorrhizal_partners = EXCLUDED.mycorrhizal_partners,
  habitat = EXCLUDED.habitat,
  updated_at = NOW();

-- ---------------------------------------------------------------
-- 2. Steinsopp (Boletus edulis)
-- Habitat: granskog eller eikeskog, eldre bestand, kantsoner mot åpninger
-- ---------------------------------------------------------------
INSERT INTO mushroom_species (
  norwegian_name, latin_name, edibility, genus,
  season_start, season_end, peak_season_start, peak_season_end,
  mycorrhizal_partners, habitat
) VALUES (
  'Steinsopp', 'Boletus edulis', 'edible', 'Boletus',
  7, 10, 8, 9,
  ARRAY['gran', 'eik', 'bjørk', 'bøk'],
  ARRAY['barskog', 'lauvskog', 'eldre bestand', 'kantsoner']
)
ON CONFLICT (latin_name) DO UPDATE SET
  genus = EXCLUDED.genus,
  season_start = EXCLUDED.season_start,
  season_end = EXCLUDED.season_end,
  peak_season_start = EXCLUDED.peak_season_start,
  peak_season_end = EXCLUDED.peak_season_end,
  mycorrhizal_partners = EXCLUDED.mycorrhizal_partners,
  habitat = EXCLUDED.habitat,
  updated_at = NOW();

-- ---------------------------------------------------------------
-- 3. Traktkantarell (Craterellus tubaeformis)
-- Habitat: moserik granskog, kjølig-tolerant, sen sesong
-- ---------------------------------------------------------------
INSERT INTO mushroom_species (
  norwegian_name, latin_name, edibility, genus,
  season_start, season_end, peak_season_start, peak_season_end,
  mycorrhizal_partners, habitat
) VALUES (
  'Traktkantarell', 'Craterellus tubaeformis', 'edible', 'Craterellus',
  8, 11, 9, 10,
  ARRAY['gran'],
  ARRAY['granskog', 'moserik', 'fuktig']
)
ON CONFLICT (latin_name) DO UPDATE SET
  genus = EXCLUDED.genus,
  season_start = EXCLUDED.season_start,
  season_end = EXCLUDED.season_end,
  peak_season_start = EXCLUDED.peak_season_start,
  peak_season_end = EXCLUDED.peak_season_end,
  mycorrhizal_partners = EXCLUDED.mycorrhizal_partners,
  habitat = EXCLUDED.habitat,
  updated_at = NOW();

-- ---------------------------------------------------------------
-- 4. Piggsopp (Hydnum repandum)
-- Habitat: kalkrik granskog/blandingsskog, sen sesong, kuldetolerant
-- ---------------------------------------------------------------
INSERT INTO mushroom_species (
  norwegian_name, latin_name, edibility, genus,
  season_start, season_end, peak_season_start, peak_season_end,
  mycorrhizal_partners, habitat
) VALUES (
  'Piggsopp', 'Hydnum repandum', 'edible', 'Hydnum',
  9, 11, 10, 11,
  ARRAY['gran', 'eik'],
  ARRAY['granskog', 'blandingsskog', 'kalkrik']
)
ON CONFLICT (latin_name) DO UPDATE SET
  genus = EXCLUDED.genus,
  season_start = EXCLUDED.season_start,
  season_end = EXCLUDED.season_end,
  peak_season_start = EXCLUDED.peak_season_start,
  peak_season_end = EXCLUDED.peak_season_end,
  mycorrhizal_partners = EXCLUDED.mycorrhizal_partners,
  habitat = EXCLUDED.habitat,
  updated_at = NOW();

-- ---------------------------------------------------------------
-- 5. Svart trompetsopp (Craterellus cornucopioides)
-- Habitat: fuktig løvskog (særlig bøk og eik) — distinkt fra
-- traktkantarell selv om de deler Craterellus-slekten.
-- NB: Næ habitat-score er på plass via NIBIO (Phase 2 uke 4-5),
-- vil løvskog vs barskog automatisk skille de to artene.
-- ---------------------------------------------------------------
INSERT INTO mushroom_species (
  norwegian_name, latin_name, edibility, genus,
  season_start, season_end, peak_season_start, peak_season_end,
  mycorrhizal_partners, habitat
) VALUES (
  'Svart trompetsopp', 'Craterellus cornucopioides', 'edible', 'Craterellus',
  9, 10, 9, 10,
  ARRAY['bøk', 'eik'],
  ARRAY['lauvskog', 'fuktig', 'mose']
)
ON CONFLICT (latin_name) DO UPDATE SET
  genus = EXCLUDED.genus,
  season_start = EXCLUDED.season_start,
  season_end = EXCLUDED.season_end,
  peak_season_start = EXCLUDED.peak_season_start,
  peak_season_end = EXCLUDED.peak_season_end,
  mycorrhizal_partners = EXCLUDED.mycorrhizal_partners,
  habitat = EXCLUDED.habitat,
  updated_at = NOW();
