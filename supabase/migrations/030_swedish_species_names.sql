-- 030: svenske artsnavn (swedish_name) for artene som manglet det.
--
-- Bakgrunn: svenske brukere så norske artsnavn i appen fordi 46 av 72 rader i
-- mushroom_species hadde swedish_name = NULL. getSpeciesDisplayName() faller
-- tilbake til norsk når det svenske navnet mangler, så feilen var stille.
--
-- Kilde for hvert navn: SLU Artdatabankens Dyntaxa ("Dyntaxa. Svensk taxonomisk
-- databas"), hentet via GBIF sitt vernacularNames-API og filtrert på det navnet
-- Dyntaxa selv merker som preferred. Der backbone-oppslaget ikke ga treff er
-- navnet hentet fra Dyntaxa på det aksepterte synonymet:
--   Agaricus silvaticus  -> Agaricus sylvaticus  (skogschampinjon)
--   Clitocybe dealbata   -> Clitocybe rivulosa   (gifttrattskivling)
--   Inocybe erubescens   -> Inosperma erubescens (gifttråding)
--
-- Alle navnene på de giftige/dødelige artene er dobbeltsjekket mot artfakta.se.
--
-- ⚠️ Inocybe erubescens heter "gifttråding" på svensk — IKKE "rodnande
-- trådskivling". Det siste navnet tilhører en ANNEN art (Inocybe whitei,
-- svensk "rodnadstråding", artfakta.se/taxa/4654). Å bruke det på denne
-- dødelige muskarin-soppen ville gitt den feil arts navn.
--
-- Alt kjører i én transaksjon, så en avbrutt kjøring ikke kan legge igjen
-- halvveis oppdaterte data.
begin;

-- Kolonnen finnes i produksjon, men ingen migrasjon har noen gang opprettet den
-- (skjemadrift). Uten garantien under kan ikke repoet bygge basen opp fra
-- migrasjonene alene.
alter table mushroom_species add column if not exists swedish_name text;

-- ── Del 1: fylle inn de 46 som mangler helt ────────────────────────────────
--
-- Matcher på latin_name, ikke id, så migrasjonen tåler ulik id-rekkefølge.
-- Oppdaterer kun rader der swedish_name faktisk mangler — den rører ikke navn
-- som allerede er satt. updated_at settes av species_updated_at-triggeren fra 001.
update mushroom_species as m
set swedish_name = v.swedish_name
from (values
  ('Lactarius deterrimus', 'Granblodriska'),
  ('Lactarius deliciosus', 'Tallblodriska'),
  ('Boletus pinophilus', 'Rödbrun stensopp'),
  ('Suillus variegatus', 'Sandsopp'),
  ('Hydnum rufescens', 'Rödgul taggsvamp'),
  ('Boletus reticulatus', 'Finluden stensopp'),
  ('Russula cyanoxantha', 'Brokkremla'),
  ('Russula vesca', 'Kantkremla'),
  ('Macrolepiota procera', 'Stolt fjällskivling'),
  ('Agaricus silvaticus', 'Skogschampinjon'),
  ('Amanita phalloides', 'Lömsk flugsvamp'),
  ('Amanita pantherina', 'Panterflugsvamp'),
  ('Amanita regalis', 'Brun flugsvamp'),
  ('Amanita rubescens', 'Rodnande flugsvamp'),
  ('Galerina marginata', 'Gifthätting'),
  ('Gyromitra esculenta', 'Stenmurkla'),
  ('Cortinarius orellanus', 'Orangebrun giftspindling'),
  ('Clitocybe dealbata', 'Gifttrattskivling'),
  ('Inocybe erubescens', 'Gifttråding'),
  ('Russula emetica', 'Giftkremla'),
  ('Entoloma sinuatum', 'Bolmörtsskivling'),
  ('Scleroderma citrinum', 'Gul rottryffel'),
  ('Hypholoma lateritium', 'Tegelröd slöjskivling'),
  ('Imleria badia', 'Brunsopp'),
  ('Suillus grevillei', 'Lärksopp'),
  ('Russula xerampelina', 'Tallsillkremla'),
  ('Russula aeruginea', 'Grönkremla'),
  ('Russula claroflava', 'Gulkremla'),
  ('Russula decolorans', 'Tegelkremla'),
  ('Craterellus lutescens', 'Rödgul trumpetsvamp'),
  ('Tricholoma portentosum', 'Streckmusseron'),
  ('Hygrophorus hypothejus', 'Frostvaxskivling'),
  ('Laccaria amethystina', 'Ametistskivling'),
  ('Sparassis crispa', 'Blomkålssvamp'),
  ('Auricularia auricula-judae', 'Judasöra'),
  ('Flammulina velutipes', 'Vinterskivling'),
  ('Agaricus arvensis', 'Snöbollschampinjon'),
  ('Lepista nuda', 'Blåmusseron'),
  ('Calocybe gambosa', 'Vårmusseron'),
  ('Lycoperdon perlatum', 'Vårtig röksvamp'),
  ('Marasmius oreades', 'Nejlikbrosking'),
  ('Lactarius trivialis', 'Skogsriska'),
  ('Albatrellus confluens', 'Brödticka'),
  ('Hygrophorus camarophyllus', 'Sotvaxskivling'),
  ('Cantharellus pallens', 'Blek kantarell'),
  ('Lactarius scrobiculatus', 'Svavelriska')
) as v(latin_name, swedish_name)
where m.latin_name = v.latin_name
  and (m.swedish_name is null or btrim(m.swedish_name) = '');

-- ── Del 2: rette opp svenske navn som tilhører en ANNEN art ────────────────
--
-- Gjennomgangen av de 26 radene som allerede hadde swedish_name avdekket fire
-- feil. De tre første er navnekollisjoner: navnet i basen er et ekte svensk
-- soppnavn, men på feil art. Verifisert mot artfakta.se og svampguiden.
--
--   Leccinum aurantiacum: "Tegelsopp" er Leccinum versipelle (bjørk, grå-svarte
--       skjell). L. aurantiacum heter "aspsopp".
--   Russula paludosa: "Mandelkremla" er Russula integra. R. paludosa heter
--       "storkremla".
--   Verpa bohemica: "Bägarmurkla" finnes ikke som etablert svensk navn i noen
--       kilde — trolig en håndoversettelse. Riktig navn er "vindlad
--       klockmurkla". (Det er ikke navnet på Disciotis venosa heller; den
--       heter "klormurkla".)
--   Agaricus xanthodermus: "Karbolchampinjon" er et reelt navn, men Dyntaxa
--       foretrekker "giftchampinjon" — og bare "karbolchampinjon" er tvetydig,
--       siden A. phaeolepidotus og A. pilatianus også har karbolchampinjon i
--       navnet. For en giftig art bør navnet være det som advarer.
--
-- Disse skriver OVER en eksisterende verdi, i motsetning til del 1 — men bare
-- så lenge raden fortsatt har det kjente gale navnet. Da er migrasjonen trygg å
-- kjøre om igjen: en senere manuell rettelse blir ikke overskrevet.

update mushroom_species as m
set swedish_name = v.swedish_name
from (values
  ('Leccinum aurantiacum', 'Tegelsopp', 'Aspsopp'),
  ('Russula paludosa', 'Mandelkremla', 'Storkremla'),
  ('Verpa bohemica', 'Bägarmurkla', 'Vindlad klockmurkla'),
  ('Agaricus xanthodermus', 'Karbolchampinjon', 'Giftchampinjon')
) as v(latin_name, gammelt_navn, swedish_name)
where m.latin_name = v.latin_name
  and btrim(coalesce(m.swedish_name, '')) = v.gammelt_navn;

-- Bevisst IKKE endret, selv om Dyntaxa har et annet foretrukket navn:
--   Boletus edulis "Karljohan" — Dyntaxa sier "stensopp", men karljohan(ssvamp)
--       er det svensker faktisk sier om arten.
--   Morchella esculenta "Rundmurkla" — Dyntaxa sier "rund toppmurkla"; begge
--       brukes om samme art, så dette er stil, ikke feil.
--   Morchella elata "Toppmurkla" — Dyntaxa fører M. elata som synonym under
--       M. conica, som nettopp heter "toppmurkla". Navnet er riktig.
--   Armillaria mellea "Honungsskivling" — navnet er riktig, men selve
--       art-raden peker på A. mellea s.str., en sørlig art som knapt finnes i
--       Sverige. Det er en taksonomi-jobb, ikke en navne-jobb.

-- Kontroll: skal returnere 0 rader etter kjøring.
-- select id, latin_name, norwegian_name from mushroom_species
-- where swedish_name is null or btrim(swedish_name) = '';

commit;
