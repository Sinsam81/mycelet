-- 027: Add the two true morels and wire the deadly false-morel look-alike.
--
-- Pre-launch audit finding (safety-content, HIGH): migration 017 seeded its
-- look_alikes with an INNER JOIN on the edible-side norwegian_name, so any row
-- whose anchor species was not in the catalog was silently dropped. Both
-- coverage rows for the DEADLY Gyromitra esculenta (Steinmorkel / false morel)
-- pointed at 'Spiss morkel' and 'Vanlig morkel', which did not exist — so the
-- single most classic deadly spring confusion (true morel vs. false morel) had
-- ZERO look-alike coverage, and a forager identifying a real morel got no
-- structured warning anywhere.
--
-- Fix: add the two true morels (edible only when well cooked) and attach the
-- deadly Steinmorkel as a CRITICAL look-alike on each, so the warning surfaces
-- on the morel's detail page and in identify results.
--
-- NB (review before/after applying): swedish_name and the copy below are best-
-- effort; verify the Swedish names and add a verified primary_image_url for each
-- morel (left NULL here so no broken image ships). verified=false like 017.

INSERT INTO mushroom_species
  (norwegian_name, latin_name, english_name, swedish_name, family, genus, edibility,
   edibility_notes, symptoms, description, habitat,
   season_start, season_end, peak_season_start, peak_season_end, data_source, verified)
VALUES
  ('Spiss morkel', 'Morchella elata', 'Black morel', 'Spetsmurkla', 'Morchellaceae', 'Morchella',
   'conditionally_edible',
   'Spiselig KUN godt gjennomkokt/-stekt — rå eller dårlig tilberedt morkel er giftig, og den tåler ikke alkohol. Kan forveksles med den DØDELIGE steinmorkelen (falsk morkel).',
   'Rå/dårlig tilberedt morkel gir kvalme, oppkast og magesmerter. Ved forveksling med steinmorkel: livsfarlig — ring Giftinformasjonen 22 59 13 00.',
   'Vårsopp med spiss, kjegleformet hatt med tydelig vaffel-/bikubemønster. Hatt og stilk er sammenhengende HULE innvendig. Vokser i løv- og barskog, ofte på brannfelt og forstyrret jord.',
   ARRAY['løvskog', 'barskog', 'brannfelt'],
   4, 6, 4, 5, 'manual', false),
  ('Vanlig morkel', 'Morchella esculenta', 'Yellow morel', 'Rätmurkla', 'Morchellaceae', 'Morchella',
   'conditionally_edible',
   'Spiselig KUN godt gjennomkokt/-stekt — rå eller dårlig tilberedt morkel er giftig, og den tåler ikke alkohol. Kan forveksles med den DØDELIGE steinmorkelen (falsk morkel).',
   'Rå/dårlig tilberedt morkel gir kvalme, oppkast og magesmerter. Ved forveksling med steinmorkel: livsfarlig — ring Giftinformasjonen 22 59 13 00.',
   'Vårsopp med rundaktig, gulbrun hatt med uregelmessig vaffel-/bikubemønster. Hatt og stilk er sammenhengende HULE innvendig. Vokser ofte på kalkrik grunn i løvskog.',
   ARRAY['løvskog'],
   4, 6, 4, 5, 'manual', false)
ON CONFLICT (latin_name) DO NOTHING;

-- Attach the deadly Steinmorkel as a CRITICAL look-alike on each true morel.
-- Idempotent (skips if the row already exists) and a no-op if Steinmorkel is
-- somehow absent (so it never errors).
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT s.id, la.id,
  'Begge er rynkete/hjerneaktige vårsopper og forveksles lett av nybegynnere.',
  'Ekte morkel har vaffel-/bikubemønstret hatt og er SAMMENHENGENDE HUL fra hatt til stilk. Steinmorkel (falsk morkel) har en uregelmessig hjerne-/sadelformet, rødbrun hatt og er kamret/bomullsfylt innvendig — IKKE jevnt hul. Steinmorkel er dødelig giftig, også av damp ved koking.',
  'critical'
FROM mushroom_species s
JOIN mushroom_species la ON la.latin_name = 'Gyromitra esculenta'
WHERE s.latin_name IN ('Morchella elata', 'Morchella esculenta')
  AND NOT EXISTS (
    SELECT 1 FROM look_alikes x WHERE x.species_id = s.id AND x.look_alike_id = la.id
  );
