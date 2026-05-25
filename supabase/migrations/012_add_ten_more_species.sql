-- ============================================
-- Migration 012: Add 10 more prediction species (+ fix mislabeled Sandsopp)
-- ============================================
--
-- Adds 10 popular Norwegian edible mushrooms, chosen for tree-specific
-- habitat (= best heatmap predictability), all in genera that already have
-- tuned GENUS_PREFERENCES profiles in src/lib/utils/species-scoring.ts.
--
-- Norwegian names + Latin names verified against Wikipedia / Wikidata
-- (bokmål labels). Image URLs are Wikimedia Commons thumbnails, HTTP-200
-- verified. Edibility + look-alikes are field-knowledge defaults — verified=false,
-- to be expert-reviewed. NEW species work in the heatmap immediately via the
-- live-fallback path; precomputed tiles need a tile regeneration to include them.
--
-- Idempotent: INSERT ... ON CONFLICT (latin_name) DO UPDATE; photos guarded by
-- NOT EXISTS; look_alikes by ON CONFLICT (species_id, look_alike_id).

BEGIN;

-- ---------------------------------------------------------------
-- 0. Data fix: the existing "Sandsopp" row is actually Suillus bovinus,
--    whose correct Norwegian name is "Seig kusopp". The real Sandsopp
--    (Suillus variegatus) is added below.
-- ---------------------------------------------------------------
UPDATE mushroom_species
SET norwegian_name = 'Seig kusopp', updated_at = NOW()
WHERE latin_name = 'Suillus bovinus' AND norwegian_name = 'Sandsopp';

-- ---------------------------------------------------------------
-- 1-10. The new species
-- ---------------------------------------------------------------
INSERT INTO mushroom_species (
  norwegian_name, latin_name, english_name, family, genus, description,
  edibility, edibility_notes, habitat, substrate, mycorrhizal_partners,
  season_start, season_end, peak_season_start, peak_season_end,
  regions, commonality, data_source, primary_image_url
) VALUES
  ('Granmatriske', 'Lactarius deterrimus', 'False saffron milkcap', 'Russulaceae', 'Lactarius',
   'Rødoransje riske med grønnlige flekker, vokser under gran. Oransje melkesaft som blir vinrød. God matsopp.',
   'edible', 'God matsopp i riske-gruppen. Stek godt — riskene skal ikke spises rå.',
   ARRAY['granskog','mose'], 'jord', ARRAY['gran'],
   8, 10, 9, 10, ARRAY['hele Norge'], 'very_common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Fichten-Reizker_Lactarius_deterrimus.jpg/330px-Fichten-Reizker_Lactarius_deterrimus.jpg'),

  ('Furumatriske', 'Lactarius deliciosus', 'Saffron milkcap', 'Russulaceae', 'Lactarius',
   'Rødlig matriske med grønne flekker, vokser under furu. Regnet som den beste av matriskene. Gulrød melkesaft.',
   'edible', 'Den mest delikate av matriskene. Stek godt.',
   ARRAY['furuskog'], 'jord', ARRAY['furu'],
   8, 10, 9, 10, ARRAY['hele Norge'], 'very_common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Lactarius_deliciosus.jpg/330px-Lactarius_deliciosus.jpg'),

  ('Rødbrun steinsopp', 'Boletus pinophilus', 'Pine bolete', 'Boletaceae', 'Boletus',
   'Rørsopp med mørk rødbrun hatt og kraftig stilk med nettmønster. Vokser i barskog under furu. Utmerket matsopp.',
   'edible', 'Utmerket matsopp, behandles som vanlig steinsopp.',
   ARRAY['furuskog','barskog'], 'jord', ARRAY['furu','gran'],
   8, 10, 8, 9, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Boletus_pinophilus3.JPG/330px-Boletus_pinophilus3.JPG'),

  ('Sandsopp', 'Suillus variegatus', 'Velvet bolete', 'Suillaceae', 'Suillus',
   'Gulbrun, finflekket rørsopp som vokser under furu på sandig jord. Spiselig; fjern det slimete hatteskinnet.',
   'edible', 'Middels matsopp. Fjern det slimete hatteskinnet før tilberedning.',
   ARRAY['furuskog'], 'jord', ARRAY['furu'],
   8, 10, 9, 10, ARRAY['hele Norge'], 'very_common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Suill.var.jpg/330px-Suill.var.jpg'),

  ('Rødgul piggsopp', 'Hydnum rufescens', 'Terracotta hedgehog', 'Hydnaceae', 'Hydnum',
   'Rødgul sopp med pigger (ikke skiver) under hatten. Mindre og mer rødtonet enn vanlig piggsopp. Trygg og god matsopp.',
   'edible', 'Trygg og ettertraktet høstsopp. Kan ikke lett forveksles med giftige arter.',
   ARRAY['barskog','blandingsskog'], 'jord', ARRAY['gran','furu'],
   9, 11, 9, 10, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Hydnum_rufescens_20070927w.JPG/330px-Hydnum_rufescens_20070927w.JPG'),

  ('Bleklodden steinsopp', 'Boletus reticulatus', 'Summer bolete', 'Boletaceae', 'Boletus',
   'Steinsopp med lys, finlodden hatt og tydelig nettmønster på stilken. Vokser i løvskog under eik, fra forsommeren.',
   'edible', 'Utmerket matsopp. Tidlig sesong (forsommer–sommer).',
   ARRAY['løvskog','eikeskog'], 'jord', ARRAY['eik','bøk'],
   6, 9, 7, 8, ARRAY['Sør-Norge'], 'uncommon', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Boletus.JPG/330px-Boletus.JPG'),

  ('Broket kremle', 'Russula cyanoxantha', 'Charcoal burner', 'Russulaceae', 'Russula',
   'Kremle med variabel blå-grønn-fiolett hatt og myke, bøyelige skiver. Mild smak. En av de beste kremlene.',
   'edible', 'Mild og god kremle. Bøyelige skiver skiller den fra skarpe kremler.',
   ARRAY['løvskog','blandingsskog'], 'jord', ARRAY['bøk','eik','bjørk'],
   7, 10, 8, 9, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Russula_cyanoxantha.JPG/330px-Russula_cyanoxantha.JPG'),

  ('Nøttekremle', 'Russula vesca', 'The flirt', 'Russulaceae', 'Russula',
   'Rødbrun til kjøttrosa kremle med mild, nøtteaktig smak. Hatteskinnet er ofte for kort så kanten viser hvitt kjøtt.',
   'edible', 'Mild kremle med nøtteaktig smak. God matsopp.',
   ARRAY['løvskog','blandingsskog'], 'jord', ARRAY['eik','bøk','bjørk'],
   7, 10, 8, 9, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Russ.ves.jpg/330px-Russ.ves.jpg'),

  ('Parasollsopp', 'Macrolepiota procera', 'Parasol mushroom', 'Agaricaceae', 'Macrolepiota',
   'Stor sopp med brunskjellet hatt, slangeskinn-mønstret stilk og bevegelig ring. Vokser på enger og i kantsoner. Bare hatten spises.',
   'edible', 'Bare hatten brukes (stilken er seig). VIKTIG: se forvekslingsarter — unngå små eksemplarer og sopp i knopp-stadiet.',
   ARRAY['eng','beite','kantsoner','lysninger'], 'jord', NULL,
   8, 10, 9, 9, ARRAY['Sør-Norge','Midt-Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Parasol-Macrolepiota-procera.jpg/330px-Parasol-Macrolepiota-procera.jpg'),

  ('Skogsjampinjong', 'Agaricus silvaticus', 'Scaly wood mushroom', 'Agaricaceae', 'Agaricus',
   'Brunskjellet sjampinjong i barskog. Kjøttet rødner tydelig ved snitt. Behagelig sopplukt. God matsopp.',
   'edible', 'Kjøttet rødner ved snitt — kjennetegn for trygg sjampinjong. VIKTIG: se forvekslingsarter.',
   ARRAY['barskog','granskog'], 'jord', NULL,
   8, 10, 8, 9, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Agasil0big.jpg/330px-Agasil0big.jpg')
ON CONFLICT (latin_name) DO UPDATE SET
  norwegian_name = EXCLUDED.norwegian_name,
  english_name = EXCLUDED.english_name,
  family = EXCLUDED.family,
  genus = EXCLUDED.genus,
  description = EXCLUDED.description,
  edibility = EXCLUDED.edibility,
  edibility_notes = EXCLUDED.edibility_notes,
  habitat = EXCLUDED.habitat,
  substrate = EXCLUDED.substrate,
  mycorrhizal_partners = EXCLUDED.mycorrhizal_partners,
  season_start = EXCLUDED.season_start,
  season_end = EXCLUDED.season_end,
  peak_season_start = EXCLUDED.peak_season_start,
  peak_season_end = EXCLUDED.peak_season_end,
  regions = EXCLUDED.regions,
  commonality = EXCLUDED.commonality,
  primary_image_url = EXCLUDED.primary_image_url,
  updated_at = NOW();

-- ---------------------------------------------------------------
-- Primary photo for the detail page (list uses primary_image_url above).
-- Guarded so re-running does not create duplicate photo rows.
-- ---------------------------------------------------------------
INSERT INTO species_photos (species_id, image_url, is_primary, photo_type, license)
SELECT s.id, s.primary_image_url, TRUE, 'general', 'Wikimedia Commons'
FROM mushroom_species s
WHERE s.latin_name IN (
  'Lactarius deterrimus','Lactarius deliciosus','Boletus pinophilus','Suillus variegatus',
  'Hydnum rufescens','Boletus reticulatus','Russula cyanoxantha','Russula vesca',
  'Macrolepiota procera','Agaricus silvaticus'
)
AND s.primary_image_url IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM species_photos p WHERE p.species_id = s.id);

-- ---------------------------------------------------------------
-- Look-alike warnings (safety-critical for the two open-habitat species).
-- Targets (Amanita virosa, Agaricus xanthodermus, Tylopilus felleus) already
-- exist in the DB. Idempotent via the UNIQUE(species_id, look_alike_id).
-- ---------------------------------------------------------------
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT s.id, la.id, sim, diff, lvl FROM (
  VALUES
    ('Macrolepiota procera', 'Amanita virosa',
     'Unge parasollsopp i knopp-stadiet kan ligne hvit fluesopp.',
     'Hvit fluesopp har ren hvit hatt, hvite skiver og en pose (volva) nederst på stilken. Parasollsopp er stor med brunskjellet hatt, slangeskinn-mønstret stilk og bevegelig ring — uten volva.',
     'critical'),
    ('Agaricus silvaticus', 'Amanita virosa',
     'Unge, lyse sjampinjonger kan forveksles med dødelig hvit fluesopp.',
     'Sjampinjong har rosa til sjokoladebrune skiver og kjøtt som rødner; hvit fluesopp har alltid hvite skiver og en volva nederst på stilken.',
     'critical'),
    ('Agaricus silvaticus', 'Agaricus xanthodermus',
     'Ligner andre sjampinjonger.',
     'Karbol-sjampinjong lukter blekk/karbol og gulner sterkt i stilkbasen ved trykk; skogsjampinjong lukter behagelig og rødner (gulner ikke).',
     'high'),
    ('Boletus pinophilus', 'Tylopilus felleus',
     'Begge er brune rørsopper med nettmønster på stilken.',
     'Galleboletus smaker svært bittert og har rosa rørlag; rødbrun steinsopp har hvitt til gulgrønt rørlag og mild smak.',
     'low'),
    ('Boletus reticulatus', 'Tylopilus felleus',
     'Begge er brune rørsopper med nettmønster på stilken.',
     'Galleboletus smaker svært bittert og har rosa rørlag; bleklodden steinsopp har hvitt til gulgrønt rørlag og mild smak.',
     'low')
) AS rel(species_latin, la_latin, sim, diff, lvl)
JOIN mushroom_species s ON s.latin_name = rel.species_latin
JOIN mushroom_species la ON la.latin_name = rel.la_latin
ON CONFLICT (species_id, look_alike_id) DO UPDATE SET
  similarity_description = EXCLUDED.similarity_description,
  difference_description = EXCLUDED.difference_description,
  danger_level = EXCLUDED.danger_level;

COMMIT;
