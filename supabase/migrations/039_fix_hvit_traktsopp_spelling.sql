-- 039: retter skrivefeilen «Hvit trakttsopp» → «Hvit traktsopp».
--
-- BAKGRUNN
-- Clitocybe rivulosa (id 59, giftig) ble seedet i migrasjon 017 med det norske
-- navnet «Hvit trakttsopp» — med dobbel t. Sammensetningen er trakt + sopp, så
-- formen er feil uansett hvilket adjektiv man setter foran.
--
-- HVOR NAVNET VISES
--   • /species og /species/59 (artskortet og detaljsiden)
--   • /calendar (arten er i sesong aug–okt)
--   • AI-resultatet, når Kindwise foreslår Clitocybe rivulosa
--   • forvekslingsadvarselen på nellikhatt — som er hele grunnen til at arten
--     står i katalogen: den vokser i ring på plen sammen med matsoppen
--
-- HVORFOR DET IKKE ER KOSMETIKK
-- Søket i artsbiblioteket er `ilike '%…%'`. Et søk på riktig staving («hvit
-- traktsopp») treffer altså IKKE raden med dobbel t. En bruker som slår opp
-- navnet fra en soppbok finner ikke den giftige arten i appen i det hele tatt.
--
-- Prosateksten i to andre rader nevner arten ved navn og rettes samtidig, ellers
-- står den gamle skrivemåten igjen i nettopp den advarselen som betyr mest.
--
-- Latinnavnet ble rettet i migrasjon 034 (dealbata → rivulosa); det norske ble
-- ikke rørt da. `synonyms`-kolonnen er forbeholdt vitenskapelige navn (se
-- COMMENT ON COLUMN i 034), så den gamle norske skrivemåten legges ikke inn der.
--
-- Idempotent: hver setning matcher på den gamle verdien, så en ny kjøring
-- endrer ingenting.

begin;

-- 1. Selve artsnavnet.
update mushroom_species
set norwegian_name = 'Hvit traktsopp',
    updated_at = now()
where norwegian_name = 'Hvit trakttsopp';

-- 2. Forvekslingsteksten på nellikhatt, der navnet står i klartekst.
update look_alikes
set difference_description = replace(difference_description, 'Hvit trakttsopp', 'Hvit traktsopp')
where difference_description like '%Hvit trakttsopp%';

-- 3. Spiselighetsnotatet på nellikhatt, samme skrivemåte i småbokstaver.
update mushroom_species
set edibility_notes = replace(edibility_notes, 'hvit trakttsopp', 'hvit traktsopp'),
    updated_at = now()
where edibility_notes like '%hvit trakttsopp%';

commit;

-- ── Kontroll etter kjøring ─────────────────────────────────────────────────
-- Skal gi null rader:
--
-- select id, norwegian_name from mushroom_species
--  where norwegian_name ilike '%trakttsopp%'
--     or edibility_notes ilike '%trakttsopp%';
-- select species_id, look_alike_id from look_alikes
--  where difference_description ilike '%trakttsopp%'
--     or similarity_description ilike '%trakttsopp%';
--
-- Og denne skal gi nøyaktig én rad, «Hvit traktsopp | Clitocybe rivulosa | toxic»:
--
-- select id, norwegian_name, latin_name, edibility
--   from mushroom_species where latin_name = 'Clitocybe rivulosa';
