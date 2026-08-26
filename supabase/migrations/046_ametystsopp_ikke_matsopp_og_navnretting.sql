-- ⚠️ SIKKERHETSRETTING + NAVNRETTING (2026-08-04)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. AMETYSTSOPP ER IKKE MATSOPP
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Laccaria amethystina sto som `edible` med notatet «Spiselig liten skogsopp.
-- Lite kjøtt, men lett å kjenne igjen på den fiolette fargen.» Appen viste den
-- altså med grønt «Spiselig»-merke og oppfordret til plukking.
--
-- Norges sopp- og nyttevekstforbunds normliste sier «Ikke matsopp» med
-- merknaden «Tar opp arsen»:
--   https://soppognyttevekster.no/normlisten/ametystsopp/
--
-- Arten er ikke akutt giftig, men den akkumulerer arsen og skal ikke spises.
-- Riktig klasse er derfor `inedible`, ikke `toxic` — den hører hjemme sammen med
-- de andre «ikke spis denne»-artene, uten å påstå akutt forgiftningsfare.
--
-- Funnet kom inn med en ekstern gjennomgang av artslista.
-- Verifisert mot NSNF før endringen, ikke tatt på tro.
--
-- ⚠️ DETTE AVDEKKER ET STØRRE HULL: artslistas spiselighet er aldri
-- systematisk kontrollert mot NSNFs normliste. 45 arter står som `edible`. Én av
-- dem var feil. Se docs/artsliste-normliste-avvik.md.

UPDATE mushroom_species
SET
  edibility = 'inedible',
  edibility_notes =
    'IKKE MATSOPP. Norges sopp- og nyttevekstforbund har tatt ametystsoppen av '
    || 'normlisten fordi den tar opp arsen fra jorda. Den er ikke akutt giftig, '
    || 'men skal ikke spises — heller ikke i små mengder eller av og til.'
WHERE latin_name = 'Laccaria amethystina';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. NORSKE NAVN SOM IKKE VAR ARTSDATABANKENS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sju arter hadde uoffisielle eller feilaktige norske navn. Fasit er hentet fra
-- Artsdatabankens navn slik de publiseres via GBIFs vernacularNames (språk nob/
-- nno), ikke fra en språkmodell:
--
--   Lepista nuda               «Blåtutt»               → blå ridderhatt
--   Imleria badia              «Brunstokket rørsopp»   → svartbrun rørsopp
--   Lactarius trivialis        «Grovriske»             → hulriske
--   Russula decolorans         «Gulnende kremle»       → gulrød kremle
--   Hygrophorus hypothejus     «Frostvarsler»          → frostvokssopp
--   Hygrophorus camarophyllus  «Sherryhatt»            → sotvokssopp
--   Albatrellopsis confluens   «Sammenvokst fåresopp»  → franskbrødsopp
--
-- NB: «Ametystsopp» var RIKTIG og er ikke endret. Den ene av de to eksterne
-- gjennomgangene foreslo «Ametystlakssopp», som ikke finnes hos Artsdatabanken.
-- Navn skal verifiseres mot kilden før de endres.
--
-- Hydnum repandum står som «Piggsopp». Artsdatabanken bruker «blek piggsopp»
-- (og «sørlig blek piggsopp» på artsnivå). Endres ikke her: gruppa inneholder
-- flere svært like arter, og hvilket nivå appen skal operere på er en
-- produktbeslutning, ikke en navnefeil. Se doket.

UPDATE mushroom_species SET norwegian_name = 'Blå ridderhatt'      WHERE latin_name = 'Lepista nuda';
UPDATE mushroom_species SET norwegian_name = 'Svartbrun rørsopp'   WHERE latin_name = 'Imleria badia';
UPDATE mushroom_species SET norwegian_name = 'Hulriske'            WHERE latin_name = 'Lactarius trivialis';
UPDATE mushroom_species SET norwegian_name = 'Gulrød kremle'       WHERE latin_name = 'Russula decolorans';
UPDATE mushroom_species SET norwegian_name = 'Frostvokssopp'       WHERE latin_name = 'Hygrophorus hypothejus';
UPDATE mushroom_species SET norwegian_name = 'Sotvokssopp'         WHERE latin_name = 'Hygrophorus camarophyllus';
UPDATE mushroom_species SET norwegian_name = 'Franskbrødsopp'      WHERE latin_name = 'Albatrellopsis confluens';
