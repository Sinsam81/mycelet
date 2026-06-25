-- 028: Morels are CONDITIONALLY edible, not plainly 'edible'.
--
-- Found during the 027 verification: 'Spiss morkel' (Morchella elata) and
-- 'Vanlig morkel' (Morchella esculenta) already existed from the original
-- mvp_curated seed (2026-04-29) labelled edibility='edible' — even though their
-- own edibility_notes say "rå er giftig" and they have a CRITICAL look-alike to
-- the deadly Steinmorkel (Gyromitra esculenta), wired in migration 027. A green
-- "Spiselig" badge on a mushroom that is toxic raw and confusable with a deadly
-- one is the wrong safety signal. Set them to 'conditionally_edible' (amber
-- "Betinget spiselig", which also triggers the preparation banner) and add a
-- symptoms line. Safe to re-run.

UPDATE mushroom_species
  SET edibility = 'conditionally_edible'
  WHERE latin_name IN ('Morchella elata', 'Morchella esculenta')
    AND edibility = 'edible';

UPDATE mushroom_species
  SET symptoms = 'Rå eller dårlig tilberedt morkel gir kvalme, oppkast og magesmerter. Forveksling med den dødelige steinmorkelen er livsfarlig — ring Giftinformasjonen 22 59 13 00.'
  WHERE latin_name IN ('Morchella elata', 'Morchella esculenta')
    AND (symptoms IS NULL OR trim(symptoms) = '');
