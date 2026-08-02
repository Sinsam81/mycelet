-- 045: rett «trakttsopp» → «traktsopp» også i teksten brukeren LESER.
--
-- BAKGRUNN
-- Migrasjon 039 rettet skrivefeilen i `mushroom_species.norwegian_name` for
-- art 59. Sveipen etterpå viste at den sto igjen to steder til — begge i
-- brukervendt sikkerhetstekst:
--
--   1. mushroom_species.edibility_notes for NELLIKHATT:
--      «…vokser på plen sammen med giftig hvit trakttsopp…»
--      Denne teksten var usynlig fram til PR #116, som fjernet betingelsen som
--      skjulte edibility_notes for spiselige arter. Nå vises den — med feilen i.
--
--   2. look_alikes.difference_description for paret nellikhatt ↔ traktsopp:
--      «Hvit trakttsopp er giftig (muskarin)…»
--      Dette er setningen som forteller hvordan man skiller en matsopp fra en
--      giftig art som vokser på samme plen.
--
-- HVORFOR DET IKKE ER KOSMETIKK
-- Et feilstavet artsnavn i en advarsel er verre enn en skjønnhetsfeil: leseren
-- som slår navnet opp andre steder — i en bok, hos Giftinformasjonen, i et
-- søk — finner ingenting. Navnet skal være det samme overalt.
--
-- Erstatningen er ordgrense-basert og treffer bare den ene feilstavelsen.
-- Idempotent: andre kjøring finner ingenting å rette.

begin;

update mushroom_species
   set edibility_notes = replace(edibility_notes, 'trakttsopp', 'traktsopp')
 where edibility_notes like '%trakttsopp%';

update mushroom_species
   set description = replace(description, 'trakttsopp', 'traktsopp')
 where description like '%trakttsopp%';

update mushroom_species
   set toxin_info = replace(toxin_info, 'trakttsopp', 'traktsopp')
 where toxin_info like '%trakttsopp%';

update mushroom_species
   set symptoms = replace(symptoms, 'trakttsopp', 'traktsopp')
 where symptoms like '%trakttsopp%';

update look_alikes
   set similarity_description = replace(similarity_description, 'trakttsopp', 'traktsopp')
 where similarity_description like '%trakttsopp%';

update look_alikes
   set difference_description = replace(difference_description, 'trakttsopp', 'traktsopp')
 where difference_description like '%trakttsopp%';

commit;

-- ── Kontroll etter kjøring ─────────────────────────────────────────────────
-- Skal gi NULL RADER:
--
-- select 'species' as tabell, id, norwegian_name from mushroom_species
--  where coalesce(norwegian_name,'')  ilike '%trakttsopp%'
--     or coalesce(description,'')     ilike '%trakttsopp%'
--     or coalesce(edibility_notes,'') ilike '%trakttsopp%'
--     or coalesce(toxin_info,'')      ilike '%trakttsopp%'
--     or coalesce(symptoms,'')        ilike '%trakttsopp%'
-- union all
-- select 'look_alikes', species_id, difference_description from look_alikes
--  where coalesce(similarity_description,'') ilike '%trakttsopp%'
--     or coalesce(difference_description,'') ilike '%trakttsopp%';
