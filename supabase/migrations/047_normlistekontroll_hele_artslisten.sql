-- ⚠️ SIKKERHETSKONTROLL AV HELE ARTSLISTEN MOT NSNFs NORMLISTE (2026-08-04)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HVORFOR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migrasjon 046 rettet ametystsoppen fordi Sindre videresendte en ekstern
-- gjennomgang som fanget den. Den feilen ble funnet ved TILFELDIGHET. Ingen
-- hadde noen gang kontrollert artslistens spiselighet mot en fasit — alle 72
-- artene sto med verified = false og data_source = 'mvp_curated'.
--
-- Sindre stilte da det riktige spørsmålet: kan vi ikke heller sette de vi er
-- usikre på som uspiselig, i stedet for å ta sjansen på å si spiselig?
--
-- Svaret er ja — men vi var ikke USIKRE, vi var UKONTROLLERTE. Det er to
-- forskjellige problemer. «Usikker» betyr at kildene spriker. «Ukontrollert»
-- betyr at vi ikke har sett etter. Riktig svar på det andre er å se etter.
-- Å gardere i blinde ville dessuten kostet oss noe ekte: setter appen «usikker»
-- på kantarell, lærer folk at feltet er støy og slutter å lese det — også den
-- dagen det står noe som betyr noe.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HVORDAN DET BLE KONTROLLERT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fasit: Norges sopp- og nyttevekstforbunds normliste, https://soppognyttevekster.no/normlisten/
-- Indekssiden bærer hele lista strukturert i HTML: 218 arter med kategori,
-- norsk navn, latinsk navn og merknad. Den ble parset og sammenlignet MASKINELT
-- mot alle 72 artene våre — ikke stikkprøver, og ikke fra hukommelsen.
--
-- Normlistens seks kategorier ble kartlagt til våre fem klasser slik:
--   Spiselig                 -> edible
--   Spiselig med merknad     -> conditionally_edible
--   Spiselig etter avkoking  -> conditionally_edible
--   Ikke matsopp             -> inedible
--   Giftig                   -> toxic
--   Meget giftig             -> deadly
--
-- 66 av 72 arter lot seg matche (på latinsk navn, norsk navn, slektsoppføring
-- «Armillaria spp.» eller seksjonsoppføring «Agaricus seksjon Arvenses»).
-- Det ga 6 avvik. I tillegg kjørte 9 agenter en uavhengig oppslagsrunde med
-- motprøve på hvert avvik; motprøven bekreftet funnene mot NSNFs signerte PDF.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PRINSIPPET: AVVIKENE PEKER IKKE SAMME VEI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dette er hele lærdommen. Av de 6 avvikene ville 3 gjort appen MER forsiktig
-- og 3 gjort den MINDRE forsiktig. En regel som «følg normlisten» ville altså
-- svekket tre advarsler.
--
--   VI FØLGER NORMLISTEN når den er strengere enn oss.
--   VI BEHOLDER VÅRT når vi er strengere enn den.
--
-- Det er Sindres instinkt, brukt der det faktisk biter — ikke som en blank
-- gardering over hele lista.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. FALSK KANTARELL — DEN FARLIGSTE AV DEM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sto som `edible` med notatet «Spiselig men vassen og lite smak. Kan gi mild
-- GI-reaksjon hos enkelte.» Vi VISSTE altså om reaksjonsrisikoen og ga den
-- grønt «Spiselig»-merke likevel.
--
-- Normlisten: «Falsk kantarell / Hygrophoropsis aurantiaca / Ikke matsopp /
-- Merknad: Kan gi mage-/tarmreaksjon.»
--
-- Dette er den mest alvorlige feilen i hele lista, av én grunn: falsk kantarell
-- er NØYAKTIG den soppen nybegynnere plukker i den tro at det er kantarell.
-- Appen bekreftet i praksis feilen de nettopp gjorde.

UPDATE mushroom_species
SET
  edibility = 'inedible',
  edibility_notes =
    'IKKE MATSOPP. Norges sopp- og nyttevekstforbund fører falsk kantarell som '
    || 'ikke matsopp fordi den kan gi mage- og tarmreaksjon. Den er ikke akutt '
    || 'giftig, men skal ikke spises. Kjenn den fra ekte kantarell på de tynne, '
    || 'skarpe og gaffelgreinede skivene — kantarellen har tykke, butte lister '
    || 'som renner ned på stilken.'
WHERE latin_name = 'Hygrophoropsis aurantiaca';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. HONNINGSOPP
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sto som `conditionally_edible` med «Må kokes minst 15 min – rå er den giftig».
--
-- Normlisten fører slekten: «Honningsopper / Armillaria spp. / Ikke matsopp /
-- Merknad: Kan gi kraftig allergiske reaksjoner. Giftig som rå.»
--
-- Det avgjørende er at NSNF har en EGEN kategori for «giftig rå, må varmes»
-- («Spiselig etter avkoking», som blodrørsopp står i). De har bevisst latt være
-- å plassere honningsopp der. Grunnen står i merknadens første halvdel:
-- allergireaksjonene forsvinner ikke med koking. Vår gamle verdi la arten i
-- nettopp den båsen normlisten holdt den utenfor.
--
-- `inedible` og ikke `toxic`: NSNF har en separat «Giftig»-kategori, og
-- honningsopp står ikke i den. Samme presedens som ametystsopp i 046.

UPDATE mushroom_species
SET
  edibility = 'inedible',
  edibility_notes =
    'IKKE MATSOPP. Norges sopp- og nyttevekstforbund fører honningsopper som '
    || 'ikke matsopp: de kan gi kraftige allergiske reaksjoner, og den '
    || 'reaksjonen forsvinner IKKE ved koking. Rå er den i tillegg giftig. '
    || 'Arten ble tidligere regnet som matsopp etter grundig koking — det rådet '
    || 'gjelder ikke lenger.'
WHERE latin_name = 'Armillaria mellea';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RØDSKRUBB
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sto som `edible` med «God matsopp. Kok eller stek godt.» — en oppfordring,
-- ikke et krav.
--
-- Normlisten: «Rødskrubb / Leccinum versipelle / Spiselig med merknad /
-- Merknad: Giftig som rå. Krever varmebehandling i minst 15 minutter ved
-- middels til høy temperatur.» Det er et KRAV, og det svarer til vår
-- conditionally_edible, som nå viser «Spiselig — giftig rå».
--
-- ⚠️ TAKSONOMI IKKE RØRT HER, MED VILJE. Raden er internt inkonsistent:
--   norwegian_name = 'Rødskrubb'            -> hører til Leccinum versipelle
--   latin_name     = 'Leccinum aurantiacum' -> heter «eikeskrubb» på norsk (GBIF/Artsdatabanken)
--   swedish_name   = 'Aspsopp'              -> hører til L. aurantiacum
-- Migrasjon 030 så halve dette allerede (linje 95-96) og rettet det svenske
-- navnet, men lot det norske stå.
--
-- Spiselighetsfiksen er ROBUST mot hvilken art raden egentlig mener: NSNF fører
-- rødskrubb (L. versipelle), ospeskrubb (L. albostipitatum) og svartskrubb
-- (L. variicolor) ALLE som «Spiselig med merknad». Å bytte latinsk navn ville
-- derimot røre GBIF-treff, sesongvinduer og det svenske navnet — en egen
-- beslutning, ikke en sikkerhetsretting. Se docs/artsliste-normliste-avvik.md.

UPDATE mushroom_species
SET
  edibility = 'conditionally_edible',
  edibility_notes =
    'MÅ VARMEBEHANDLES. Giftig rå. Norges sopp- og nyttevekstforbund krever '
    || 'minst 15 minutter ved middels til høy temperatur — ikke bare et raskt '
    || 'oppgufs i panna. Godt tilberedt er den en god matsopp.'
WHERE latin_name = 'Leccinum aurantiacum';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. STANKMORKEL — HER GJELDER SINDRES INSTINKT FULLT UT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sto som `conditionally_edible` med vårt eget notat: «Noen reagerer med
-- kvalme/oppkast SELV ETTER KOKING. Spises tradisjonelt i Skandinavia.»
--
-- Arten står IKKE på normlisten. Det er verifisert tre uavhengige veier:
-- maskinell parsing av alle 218 oppføringer, gjennomgang av hele sitemapet, og
-- tekstsøk i NSNFs signerte PDF. Null treff på «Verpa» og «klokkemorkel».
--
-- Dette er nettopp tilfellet Sindre spurte om, og her er svaret ja: den
-- nasjonale fasiten fører den ikke som mat, og vårt EGET notat sier at folk
-- reagerer selv når den er kokt. Da skal den ikke bære et matsoppmerke.
-- Vi hevder ikke at den er giftig — `inedible`, ikke `toxic`.

UPDATE mushroom_species
SET
  edibility = 'inedible',
  edibility_notes =
    'IKKE MATSOPP. Står ikke på Norges sopp- og nyttevekstforbunds normliste, '
    || 'og noen reagerer med kvalme og oppkast selv etter koking. Den spises '
    || 'tradisjonelt enkelte steder i Skandinavia, men vi anbefaler den ikke.'
WHERE latin_name = 'Verpa bohemica';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. NAVNRETTING: STEINMORKEL -> SANDMORKEL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Artsdatabanken (via GBIF vernacularNames, språk nob/nno) gir ett norsk navn
-- for Gyromitra esculenta: «sandmorkel». Normlisten bruker samme navn.
-- «Steinmorkel» er en oversettelse av det svenske «stenmurkla».
--
-- Dette er ikke pedanteri: sandmorkelen er den DØDELIGE forvekslingsarten for
-- begge morklene våre. Slår noen opp «sandmorkel» — navnet de vil møte i enhver
-- norsk soppbok og på ethvert soppkontrollbord — skal de finne den her.
--
-- Spiselighetsklassen røres IKKE. Se punkt 6.

UPDATE mushroom_species
SET norwegian_name = 'Sandmorkel'
WHERE latin_name = 'Gyromitra esculenta';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. TRE AVVIK VI BEVISST IKKE FØLGER — VI ER STRENGERE ENN NORMLISTEN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ingen UPDATE her. Dette er dokumentasjon av valg, slik at ingen «retter» dem
-- senere i den tro at det er etterslep.
--
--   Sandmorkel (Gyromitra esculenta)
--     NSNF: «Giftig».  Vi: `deadly`.  BEHOLDES.
--     Gyromitrin har tatt liv i Norden. NSNF reserverer «Meget giftig» for
--     amatoksinsoppene, så deres «Giftig» er ikke et signal om at den er mild.
--     Å svekke advarselen på en art som har drept, for å matche en skala med
--     fire trinn, er feil vei.
--
--   Giftkremle (Russula emetica)
--     NSNF: «Ikke matsopp» (merknad: kan gi mage-/tarmreaksjon).  Vi: `toxic`.  BEHOLDES.
--     Ingen plukker denne som mat uansett, så en for streng klasse koster
--     ingenting — mens en for mild kan koste noe. Navnet vårt er forresten
--     riktig: Artsdatabanken fører både «giftkremle» og «rødkremle».
--
--   Svovelriske (Lactarius scrobiculatus)
--     NSNF: «Spiselig etter avkoking».  Vi: `inedible`.  BEHOLDES.
--     Dette ville vært en OPPGRADERING mot spiselig. Det er den ene retningen
--     som kan skade noen, og ingen har etterspurt arten. Vi lar den ligge.

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. BOKFØRING: HVA ER FAKTISK KONTROLLERT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `verified` og `data_source` var døde felter — hele lista sto 'mvp_curated' /
-- false, og ingenting i appen leser dem. Nå betyr de noe:
--
--   verified = true   -> spiselighetsklassen er kontrollert mot NSNFs normliste
--   verified = false  -> arten står ikke på normlisten; klassen er vår egen vurdering
--
-- Neste gang noen spør «hvilke er ukontrollerte?» finnes svaret i dataene i
-- stedet for i et dokument.

-- 7a. Samsvarer med normlisten (63 arter, inkludert de fire rettet over).
UPDATE mushroom_species
SET verified = true, data_source = 'nsnf_normliste_2026'
WHERE id IN (
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 23,
  24, 25, 26, 32, 33, 34, 35, 36, 37, 39, 40, 41, 52, 53, 54, 55, 56, 58, 59,
  60, 62, 63, 65, 66, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81,
  82, 83, 84, 85
);

-- 7b. Kontrollert, men vi er bevisst strengere enn normlisten (punkt 6).
UPDATE mushroom_species
SET verified = true, data_source = 'nsnf_normliste_2026_vi_er_strengere'
WHERE id IN (57, 61, 87);

-- 7c. Står ikke på normlisten. Klassen er vår egen vurdering.
--     Stankmorkel (21) er nedgradert i punkt 4. De øvrige er ukontroversielle
--     matsopper som normlisten — en pensumliste på 218 arter, ikke et komplett
--     register — bare ikke omfatter. De beholder klassen sin.
UPDATE mushroom_species
SET verified = false, data_source = 'ikke_pa_normlisten_egen_vurdering'
WHERE id IN (20, 21, 38, 64, 67, 86);
