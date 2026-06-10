-- ============================================
-- Migration 017: Expand species catalog 36 → 72 (13 toxic/2 inedible + 21 edible)
-- ============================================
--
-- Built 2026-06-10. All 36 Latin names verified EXACT against GBIF; primary
-- images are the Wikipedia article lead image per species (HTTP-200 verified),
-- far more reliable than guessing a Commons filename.
--
-- SAFETY: edibility + look-alikes are field-knowledge defaults written for a
-- pending EXPERT REVIEW (verified=false). The dangerous look-alike pairs are the
-- point of this batch — every new edible is linked to its toxic twin, and the
-- four classic deadly confusions are covered (flatklokkehatt↔honningsopp/
-- vintersopp, steinmorkel↔morkel, grønn fluesopp↔sjampinjong, hvit trakttsopp↔
-- nellikhatt). NEW species work in the heatmap immediately via the live-fallback
-- path; precomputed tiles need a regeneration to include them. GBIF occurrence
-- import (scripts/import-gbif-occurrences.mjs) picks up the new species on its
-- next run.
--
-- Idempotent: INSERT ... ON CONFLICT (latin_name) DO UPDATE; photos guarded by
-- NOT EXISTS; look_alikes by ON CONFLICT (species_id, look_alike_id).

BEGIN;

-- ---------------------------------------------------------------
-- A. TOXIC / DEADLY / INEDIBLE (safety priority — review these first)
-- ---------------------------------------------------------------
INSERT INTO mushroom_species (
  norwegian_name, latin_name, english_name, family, genus, description,
  edibility, edibility_notes, toxin_info, symptoms,
  habitat, substrate, mycorrhizal_partners,
  season_start, season_end, peak_season_start, peak_season_end,
  regions, commonality, data_source, primary_image_url
) VALUES
  ('Grønn fluesopp', 'Amanita phalloides', 'Death cap', 'Amanitaceae', 'Amanita',
   'Olivengrønn til gulgrønn hatt, hvite frie skiver, ring på stilken og en tydelig pose (volva) ved stilkbasen. Vokser i løvskog under eik og bøk.',
   'deadly', 'DØDELIG — verdens farligste sopp, ansvarlig for de fleste dødsfall ved soppforgiftning. Én hatt kan være nok. Skal aldri smakes.',
   'Amatoksiner (alfa-amanitin) som ødelegger lever og nyrer.',
   'Symptomfritt i 6–24 t, deretter kraftige magesmerter, oppkast og diaré, tilsynelatende bedring, så lever- og nyresvikt. Ring Giftinformasjonen 22 59 13 00 straks ved mistanke.',
   ARRAY['løvskog','eikeskog'], 'jord', ARRAY['eik','bøk'],
   8, 10, 8, 9, ARRAY['Sør-Norge'], 'rare', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Amanita_phalloides_1.JPG/500px-Amanita_phalloides_1.JPG'),

  ('Panterfluesopp', 'Amanita pantherina', 'Panther cap', 'Amanitaceae', 'Amanita',
   'Brun hatt dekket av hvite flekker (som rød fluesopp, men brun), hvit ring og en knollformet stilkbase med ringsoner.',
   'toxic', 'Sterkt giftig. Forveksles lett med spiselig rødnende fluesopp — en av grunnene til at fluesopper frarådes nybegynnere.',
   'Ibotensyre og muskimol som påvirker sentralnervesystemet.',
   'Forvirring, kramper og vekslende uro/sløvhet 0,5–3 t etter inntak. Ring Giftinformasjonen 22 59 13 00.',
   ARRAY['løvskog','blandingsskog'], 'jord', ARRAY['eik','bjørk','gran'],
   8, 10, 8, 9, ARRAY['Sør-Norge','Midt-Norge'], 'uncommon', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Amanita_pantherina_2013_G1.jpg/500px-Amanita_pantherina_2013_G1.jpg'),

  ('Brun fluesopp', 'Amanita regalis', 'Royal fly agaric', 'Amanitaceae', 'Amanita',
   'Mørk gulbrun til sjokoladebrun hatt med lyse flekker — som en brun utgave av rød fluesopp. Vokser i barskog og fjellbjørkeskog.',
   'toxic', 'Giftig. Inneholder samme type stoffer som rød og panterfluesopp.',
   'Ibotensyre og muskimol.',
   'Kvalme, forvirring og uro/sløvhet 0,5–3 t etter inntak.',
   ARRAY['barskog','fjellbjørkeskog'], 'jord', ARRAY['gran','bjørk'],
   8, 10, 8, 9, ARRAY['hele Norge'], 'uncommon', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/A_regalis.jpg/500px-A_regalis.jpg'),

  ('Rødnende fluesopp', 'Amanita rubescens', 'Blusher', 'Amanitaceae', 'Amanita',
   'Rødbrun hatt med grårosa flekker; kjøttet rødner tydelig ved skade. Ring på stilken og ringsoner ved den knollformede basen.',
   'conditionally_edible', 'Spiselig KUN gjennomstekt — rå er den giftig. Forveksles lett med giftig panterfluesopp, så den frarådes nybegynnere.',
   'Hemolysiner som brytes ned ved steking (giftig rå).',
   'Ved inntak rå: oppkast og uvelhet. Forveksling med panterfluesopp gir nervesymptomer.',
   ARRAY['barskog','løvskog','blandingsskog'], 'jord', ARRAY['gran','bjørk','eik'],
   7, 10, 8, 9, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Amanita_rubescens.JPG/500px-Amanita_rubescens.JPG'),

  ('Flatklokkehatt', 'Galerina marginata', 'Funeral bell', 'Hymenogastraceae', 'Galerina',
   'Liten brun sopp som vokser i klynger på død ved (oftest bartre). Brunt sporepulver og en ring på stilken. Like dødelig som grønn fluesopp.',
   'deadly', 'DØDELIG. Inneholder samme amatoksiner som grønn fluesopp. Forveksles med honningsopp og vintersopp — vær ekstremt varsom med små brune sopper på ved.',
   'Amatoksiner (alfa-amanitin) — ødelegger lever.',
   'Forsinket (6–24 t): magesmerter, oppkast, diaré, deretter leversvikt. Ring Giftinformasjonen 22 59 13 00 straks.',
   ARRAY['barskog'], 'død ved', NULL,
   8, 11, 9, 10, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Galerina_marginata_Point_Reyes.jpg/500px-Galerina_marginata_Point_Reyes.jpg'),

  ('Steinmorkel', 'Gyromitra esculenta', 'False morel', 'Discinaceae', 'Gyromitra',
   'Hjernelignende, rødbrun "morkel" om våren, oftest under furu på sandig grunn. Tross artsnavnet "esculenta" regnes den i Norge som giftig.',
   'deadly', 'Regnes som giftig/dødelig i Norge. Også dampen ved koking er giftig. Ikke til å spise — forveksles med ekte morkel.',
   'Gyromitrin (omdannes til monometylhydrazin).',
   'Magesmerter, oppkast og svimmelhet 6–12 t etter inntak; i alvorlige tilfeller lever- og nervepåvirkning. Giftig også å puste inn kokedamp.',
   ARRAY['furuskog','sandgrunn'], 'jord', ARRAY['furu'],
   4, 6, 5, 5, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Fr%C3%BChjahrslorchel.JPG/500px-Fr%C3%BChjahrslorchel.JPG'),

  ('Butt giftslørsopp', 'Cortinarius orellanus', 'Fool''s webcap', 'Cortinariaceae', 'Cortinarius',
   'Oransjebrun slørsopp i løvskog. I slekt med spiss giftslørsopp og like farlig — inneholder orellanin som gir nyresvikt.',
   'deadly', 'DØDELIG. Orellanin gir nyresvikt med svært forsinket symptomdebut. Slørsopper (Cortinarius) bør generelt unngås som matsopp.',
   'Orellanin — alvorlig nyreskade.',
   'Svært forsinket (2 dager–3 uker): tørste, hodepine, magesmerter og nyresvikt. Ring Giftinformasjonen 22 59 13 00.',
   ARRAY['løvskog'], 'jord', ARRAY['eik','bjørk'],
   8, 10, 8, 9, ARRAY['Sør-Norge'], 'rare', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Corellanus.jpg/500px-Corellanus.jpg'),

  ('Hvit trakttsopp', 'Clitocybe dealbata', 'Ivory funnel', 'Tricholomataceae', 'Clitocybe',
   'Liten, kritthvit traktformet sopp som vokser på gressganger, plener og beitemark — ofte i ring. Inneholder muskarin.',
   'toxic', 'Giftig. Farlig fordi den vokser sammen med spiselig nellikhatt på plen og gress.',
   'Muskarin.',
   'Svette, spyttflod, tåreflod, magesmerter og små pupiller innen 0,5–2 t. Ring Giftinformasjonen 22 59 13 00.',
   ARRAY['eng','beite','plen','gress'], 'jord', NULL,
   8, 10, 9, 10, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Clitocybe_dealbata_1.jpg/500px-Clitocybe_dealbata_1.jpg'),

  ('Rødnende trådsopp', 'Inocybe erubescens', 'Deadly fibrecap', 'Inocybaceae', 'Inocybe',
   'Trådsopp med fiberkledd hatt som rødner ved skade. En av de farligste trådsoppene, med svært høyt muskarininnhold. Vår–sommer i løvskog.',
   'toxic', 'Sterkt giftig (kan være dødelig). Trådsopper (Inocybe) bør aldri spises — mange inneholder muskarin.',
   'Muskarin (svært høyt innhold).',
   'Svette, spyttflod, tåreflod, magesmerter og pustebesvær innen 0,5–2 t.',
   ARRAY['løvskog'], 'jord', ARRAY['eik','bøk'],
   5, 8, 6, 7, ARRAY['Sør-Norge'], 'uncommon', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/2010-04-27_Inocybe_erubescens.jpg/500px-2010-04-27_Inocybe_erubescens.jpg'),

  ('Giftkremle', 'Russula emetica', 'The sickener', 'Russulaceae', 'Russula',
   'Knallrød kremle med hvit stilk og brennende skarp smak. Vokser i fuktig barskog og på myr. De skarpe kremlene er giftige.',
   'toxic', 'Giftig rå/dårlig tilberedt — gir oppkast og diaré (ikke dødelig). Tommelregel: kremler med brennende skarp smak skal kastes; milde kremler er gode matsopper.',
   'Skarpe, irriterende stoffer (sesquiterpener).',
   'Oppkast og diaré ved inntak. Ufarlig å smake en bit og spytte ut (skarp = ikke matsopp).',
   ARRAY['barskog','myr','fuktig skog'], 'jord', ARRAY['gran','furu'],
   7, 10, 8, 9, ARRAY['hele Norge'], 'very_common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Russula_emetica_in_Poland.jpg/500px-Russula_emetica_in_Poland.jpg'),

  ('Giftrødskivesopp', 'Entoloma sinuatum', 'Livid entoloma', 'Entolomataceae', 'Entoloma',
   'Stor, lysegrå til gulhvit sopp med rosa skiver (rosa sporepulver) og melaktig lukt. En av de vanligste forgiftningsårsakene i Europa.',
   'toxic', 'Giftig. Forveksles med sjampinjong og vårfagerhatt — sjekk skivefarge (rosa, ikke brun/hvit) og sporepulver.',
   'Ukjent mage-tarm-toksin.',
   'Kraftig oppkast og diaré 0,5–2 t etter inntak; kan gi alvorlig væsketap.',
   ARRAY['løvskog'], 'jord', ARRAY['eik','bøk'],
   8, 10, 8, 9, ARRAY['Sør-Norge'], 'uncommon', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Entoloma_sinuatum_group.JPG/500px-Entoloma_sinuatum_group.JPG'),

  ('Potetrøyksopp', 'Scleroderma citrinum', 'Common earthball', 'Sclerodermataceae', 'Scleroderma',
   'Hard, gulbrun "potet" med tykt skall og svart-fiolett, fast indre. Forveksles med ekte røyksopp og trøffel.',
   'toxic', 'Giftig. Skill fra spiselig røyksopp ved snitt: potetrøyksopp er fast og mørk/marmorert inni, ekte røyksopp er myk og helt hvit.',
   'Mage-tarm-irriterende stoffer.',
   'Magesmerter, kvalme og oppkast kort tid etter inntak.',
   ARRAY['skog','sur jord'], 'jord', NULL,
   7, 11, 8, 10, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Scleroderma_citrinum.jpg/500px-Scleroderma_citrinum.jpg'),

  ('Tegltoppsopp', 'Hypholoma lateritium', 'Brick cap', 'Strophariaceae', 'Hypholoma',
   'Teglrød-brun knippesopp på løvtrestubber, med lysere kant. Mildere enn svovelsopp, men regnes som usikker i Norden.',
   'inedible', 'Anbefales ikke som matsopp — forveksles med giftig svovelsopp som vokser på samme måte. La knippesopp på stubber stå.',
   NULL,
   NULL,
   ARRAY['løvskog'], 'død ved', NULL,
   8, 11, 9, 10, ARRAY['Sør-Norge','Midt-Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/HypholomaSublateritium.jpg/500px-HypholomaSublateritium.jpg'),

-- ---------------------------------------------------------------
-- B. EDIBLE / CHOICE
-- ---------------------------------------------------------------
  ('Brunstokket rørsopp', 'Imleria badia', 'Bay bolete', 'Boletaceae', 'Imleria',
   'Kastanjebrun rørsopp med gult rørlag som blåner svakt ved trykk. Vokser i barskog. Populær og god matsopp.',
   'edible', 'God og trygg matsopp i rørsopp-gruppen. Svak blåning er normalt.',
   NULL, NULL,
   ARRAY['barskog','blandingsskog'], 'jord', ARRAY['gran','furu'],
   8, 11, 9, 10, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Boletus_badius_JPG1.jpg/500px-Boletus_badius_JPG1.jpg'),

  ('Lerkesopp', 'Suillus grevillei', 'Larch bolete', 'Suillaceae', 'Suillus',
   'Klargul til oransje, slimet rørsopp som alltid vokser under lerk. Fjern hatteskinnet før tilberedning.',
   'edible', 'Middels matsopp. Vokser kun under lerk. Fjern det slimete hatteskinnet.',
   NULL, NULL,
   ARRAY['lerkeskog','blandingsskog'], 'jord', ARRAY['lerk'],
   8, 10, 9, 10, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Suill.grev.jpg/500px-Suill.grev.jpg'),

  ('Sildekremle', 'Russula xerampelina', 'Crab brittlegill', 'Russulaceae', 'Russula',
   'Kremle med vinrød til brunrød hatt og mild smak. Lukter sild/skalldyr, spesielt ved basen. En av de beste matkremlene.',
   'edible', 'God matkremle med mild smak og karakteristisk sildelukt. Milde kremler er trygge.',
   NULL, NULL,
   ARRAY['barskog','blandingsskog'], 'jord', ARRAY['gran','furu','bjørk'],
   8, 10, 8, 9, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/2011-11-08_Russula_xerampelina_%28Schaeff.%29_Fr_180998_mod.jpg/500px-2011-11-08_Russula_xerampelina_%28Schaeff.%29_Fr_180998_mod.jpg'),

  ('Grønnkremle', 'Russula aeruginea', 'Green brittlegill', 'Russulaceae', 'Russula',
   'Grågrønn kremle med mild smak, vokser under bjørk. God matsopp — men sjekk alltid at smaken er mild.',
   'edible', 'Mild og god matkremle. OBS: hold den klart adskilt fra grønn fluesopp (som har skiver med ring og volva — kremler har sprø skiver og knekker som kritt).',
   NULL, NULL,
   ARRAY['løvskog','blandingsskog'], 'jord', ARRAY['bjørk'],
   7, 10, 8, 9, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/2005-08-18_Russula_aeruginea_14354_mod.jpg/500px-2005-08-18_Russula_aeruginea_14354_mod.jpg'),

  ('Gulkremle', 'Russula claroflava', 'Yellow swamp brittlegill', 'Russulaceae', 'Russula',
   'Klargul kremle med mild smak, vokser i fuktig bjørkeskog og myrkant. Kjøttet gråner ved skade. God matkremle.',
   'edible', 'Mild og god matkremle. Skarpe gule kremler skal unngås — denne er mild.',
   NULL, NULL,
   ARRAY['løvskog','myr','fuktig skog'], 'jord', ARRAY['bjørk'],
   8, 10, 8, 9, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/2010-08-11_Russula_claroflava_Grove._ss._Melz%2C_%26_Zv.%2C_J._Schff_98988.jpg/500px-2010-08-11_Russula_claroflava_Grove._ss._Melz%2C_%26_Zv.%2C_J._Schff_98988.jpg'),

  ('Gulnende kremle', 'Russula decolorans', 'Copper brittlegill', 'Russulaceae', 'Russula',
   'Oransjebrun kremle i barskog; kjøttet gråner ved skade. Mild smak — god og vanlig matkremle.',
   'edible', 'Mild matkremle som gråner ved skade. Vanlig i barskog.',
   NULL, NULL,
   ARRAY['barskog','furuskog'], 'jord', ARRAY['furu','gran'],
   8, 10, 8, 9, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Russula_decolorans.jpg/500px-Russula_decolorans.jpg'),

  ('Gul trompetsopp', 'Craterellus lutescens', 'Yellow foot', 'Cantharellaceae', 'Craterellus',
   'Slank, gul-oransje traktsopp med nedløpende rynker (ikke ekte skiver). I slekt med traktkantarell og svart trompetsopp. Utmerket matsopp.',
   'edible', 'Utmerket og trygg matsopp, lik traktkantarell. Vokser ofte i store mengder i fuktig barskog.',
   NULL, NULL,
   ARRAY['barskog','mose','fuktig skog'], 'jord', ARRAY['gran','furu'],
   8, 11, 9, 10, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Cantharellus_lutescens.jpg/500px-Cantharellus_lutescens.jpg'),

  ('Gråmusserong', 'Tricholoma portentosum', 'Sooty head', 'Tricholomataceae', 'Tricholoma',
   'Gråfiolett, fiberstripet hatt med gulhvite skiver, ofte med gult skjær. Sen høstsopp i furuskog. God matsopp.',
   'edible', 'God matmusserong. OBS: flere grå musseronger er giftige — vær trygg på bestemmelsen før du spiser.',
   NULL, NULL,
   ARRAY['furuskog','barskog'], 'jord', ARRAY['furu'],
   9, 11, 10, 11, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Tricholoma_portentosum_181316.jpg/500px-Tricholoma_portentosum_181316.jpg'),

  ('Frostvarsler', 'Hygrophorus hypothejus', 'Herald of winter', 'Hygrophoraceae', 'Hygrophorus',
   'Liten vokssopp med olivenbrun, slimet hatt og gultonede, nedløpende skiver. Kommer sent — etter første nattefrost i furuskog.',
   'edible', 'God liten matsopp som dukker opp helt på tampen av sesongen, etter frostnetter.',
   NULL, NULL,
   ARRAY['furuskog','barskog'], 'jord', ARRAY['furu'],
   9, 11, 10, 11, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Hygrophorus_hypothejus_2.jpg/500px-Hygrophorus_hypothejus_2.jpg'),

  ('Ametystsopp', 'Laccaria amethystina', 'Amethyst deceiver', 'Hydnangiaceae', 'Laccaria',
   'Liten, helt fiolett sopp med tykke, fjerntstående skiver. Falmer til lillabrun i tørke. Spiselig, men liten.',
   'edible', 'Spiselig liten skogsopp. Lite kjøtt, men lett å kjenne igjen på den fiolette fargen.',
   NULL, NULL,
   ARRAY['løvskog','barskog','blandingsskog'], 'jord', ARRAY['bøk','eik','gran'],
   8, 11, 9, 10, ARRAY['hele Norge'], 'very_common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Laccaria_amethystina_LC0370.jpg/500px-Laccaria_amethystina_LC0370.jpg'),

  ('Blomkålsopp', 'Sparassis crispa', 'Cauliflower fungus', 'Sparassidaceae', 'Sparassis',
   'Stor, krøllete, blomkållignende sopp som vokser ved foten av furu. En ettertraktet delikatesse — rens godt for barnåler og smådyr.',
   'edible', 'Ettertraktet delikatesse. Bare unge, lyse eksemplarer. Rens grundig — den krøllete strukturen skjuler barnåler og insekter.',
   NULL, NULL,
   ARRAY['furuskog'], 'ved rot/stubbe', ARRAY['furu'],
   8, 10, 9, 10, ARRAY['Sør-Norge','Midt-Norge'], 'uncommon', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Grote_sponszwam_%28Sparassis_crispa%29._09-11-2023._%28d.j.b%29.jpg/500px-Grote_sponszwam_%28Sparassis_crispa%29._09-11-2023._%28d.j.b%29.jpg'),

  ('Judasøre', 'Auricularia auricula-judae', 'Wood ear', 'Auriculariaceae', 'Auricularia',
   'Brun, øreformet og geléaktig sopp på død løvved (særlig hyll). Samme art som "tre-øre" i asiatisk mat. Tilgjengelig store deler av året.',
   'edible', 'Spiselig, mye brukt i asiatisk matlaging. Geléaktig struktur. Vokser på død løvved.',
   NULL, NULL,
   ARRAY['løvskog'], 'død ved', NULL,
   1, 12, 9, 11, ARRAY['Sør-Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Jelly_Ear%2C_Auricularia_auricula-judae%2C_UK_2.jpg/500px-Jelly_Ear%2C_Auricularia_auricula-judae%2C_UK_2.jpg'),

  ('Vintersopp', 'Flammulina velutipes', 'Velvet shank', 'Physalacriaceae', 'Flammulina',
   'Klynger av oransjebrune, klebrige hatter med fløyelsaktig mørk stilk, på død løvved. Tåler frost og kommer sent/tidlig på året. Dyrkes som enoki.',
   'edible', 'Spiselig (kun hattene; stilkene er seige). VIKTIG: forveksles med dødelig flatklokkehatt — vær helt sikker.',
   NULL, NULL,
   ARRAY['løvskog'], 'død ved', NULL,
   10, 12, 11, 12, ARRAY['Sør-Norge','Midt-Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/2009-11-19_Flammulina_velutipes_agg_biolib.cz_crop.jpg/500px-2009-11-19_Flammulina_velutipes_agg_biolib.cz_crop.jpg'),

  ('Snøballsjampinjong', 'Agaricus arvensis', 'Horse mushroom', 'Agaricaceae', 'Agaricus',
   'Stor, hvit sjampinjong på eng og beite, lukter anis/mandel. Skivene går fra hvite til rosa til sjokoladebrune. God matsopp.',
   'edible', 'God matsopp med anislukt. VIKTIG: unge, hvite eksemplarer må holdes klart adskilt fra dødelig grønn/hvit fluesopp (som har volva og alltid hvite skiver).',
   NULL, NULL,
   ARRAY['eng','beite','gress'], 'jord', NULL,
   7, 10, 8, 9, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Pieczarka_polowa_vongrzanka.JPG/500px-Pieczarka_polowa_vongrzanka.JPG'),

  ('Blåtutt', 'Lepista nuda', 'Wood blewit', 'Tricholomataceae', 'Lepista',
   'Fiolett-blå, kjøttfull sopp med behagelig lukt, ofte i løvfall og kompost. God matsopp — må stekes godt.',
   'edible', 'God matsopp, men må alltid gjennomstekes (rå er den ufordøyelig). Sen høst.',
   NULL, NULL,
   ARRAY['løvskog','barskog','hage'], 'jord/strø', NULL,
   9, 12, 10, 11, ARRAY['Sør-Norge','Midt-Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Clitocybe_nuda_%28Fr.%29_H.E._Bigelow_%26_A.H._Sm_267650.jpg/500px-Clitocybe_nuda_%28Fr.%29_H.E._Bigelow_%26_A.H._Sm_267650.jpg'),

  ('Vårfagerhatt', 'Calocybe gambosa', 'St. George''s mushroom', 'Lyophyllaceae', 'Calocybe',
   'Kremhvit, kjøttfull vårsopp med sterk melaktig lukt, ofte i ring på eng og i kantsoner. En av få gode vårmatsopper.',
   'edible', 'God vårmatsopp. VIKTIG: forveksles med giftig giftrødskivesopp — sjekk at skivene er hvite (ikke rosa).',
   NULL, NULL,
   ARRAY['eng','kantsoner','beite'], 'jord', NULL,
   5, 6, 5, 6, ARRAY['Sør-Norge'], 'uncommon', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Calocybe_gambosa_080420wa.jpg/500px-Calocybe_gambosa_080420wa.jpg'),

  ('Vorterøyksopp', 'Lycoperdon perlatum', 'Common puffball', 'Agaricaceae', 'Lycoperdon',
   'Pæreformet røyksopp dekket av små vorter, hvit og fast inni når den er ung. Spiselig så lenge kjøttet er helt hvitt.',
   'edible', 'Spiselig kun mens kjøttet er HELT hvitt og fast hele veien gjennom. Skjær alltid i to: gulner/mørkner det, kast den. Skiller den fra giftig potetrøyksopp (mørk inni).',
   NULL, NULL,
   ARRAY['skog','eng','sti'], 'jord', NULL,
   7, 11, 8, 10, ARRAY['hele Norge'], 'very_common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Single_lycoperdon_perlatum.jpg/500px-Single_lycoperdon_perlatum.jpg'),

  ('Nellikhatt', 'Marasmius oreades', 'Fairy ring champignon', 'Marasmiaceae', 'Marasmius',
   'Liten, lærbrun sopp som vokser i ring på plen og eng, med seig stilk. God smaksopp (tørkes ofte). Vokser sammen med giftige hvite traktsopper.',
   'edible', 'God krydder-/smaksopp. VIKTIG: vokser på plen sammen med giftig hvit trakttsopp — lær forskjellen godt før du plukker på gress.',
   NULL, NULL,
   ARRAY['eng','plen','beite','gress'], 'jord', NULL,
   6, 10, 8, 9, ARRAY['hele Norge'], 'very_common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Michigan_Marasmius_oreades.jpg/500px-Michigan_Marasmius_oreades.jpg'),

  ('Grovriske', 'Lactarius trivialis', 'Slimy milkcap', 'Russulaceae', 'Lactarius',
   'Stor, gråfiolett til gråbrun, slimet riske i fuktig barskog og bjørkeskog. Hvit melkesaft. Spiselig etter forvelling.',
   'conditionally_edible', 'Spiselig etter forvelling/koking (helst kastes første kokevann). Som de fleste risker: aldri rå.',
   NULL, NULL,
   ARRAY['barskog','løvskog','fuktig skog'], 'jord', ARRAY['gran','bjørk'],
   8, 10, 9, 10, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/2006-09-09_Lactarius_trivialis.jpg/500px-2006-09-09_Lactarius_trivialis.jpg'),

  ('Sammenvokst fåresopp', 'Albatrellus confluens', 'Merging polypore', 'Albatrellaceae', 'Albatrellus',
   'Kremgul til lakserosa kjuke som vokser i sammenvokste klynger på bakken i barskog. I slekt med fåresopp. Spiselig (helst ung).',
   'edible', 'Spiselig, best som ung. Mild, litt bitter — i slekt med vanlig fåresopp.',
   NULL, NULL,
   ARRAY['barskog','granskog'], 'jord', ARRAY['gran'],
   8, 10, 9, 10, ARRAY['hele Norge'], 'uncommon', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Albatrellopsis_confluens_341982269.jpg/500px-Albatrellopsis_confluens_341982269.jpg'),

  ('Sherryhatt', 'Hygrophorus camarophyllus', 'Sooty waxcap', 'Hygrophoraceae', 'Hygrophorus',
   'Vokssopp med gråsvart, fiberstripet hatt og hvite, nedløpende, voksaktige skiver. Barskog, sen høst. God matsopp.',
   'edible', 'God vokssopp i barskog, kommer sent i sesongen. Voksaktige, nedløpende skiver er kjennetegnet.',
   NULL, NULL,
   ARRAY['barskog','granskog'], 'jord', ARRAY['gran','furu'],
   9, 11, 9, 10, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/2011-11-24_Hygrophorus_camarophyllus_%28Alb._%26_Schwein.%29_Dum%C3%A9e%2C_Grandjean_%26_Maire_184339.jpg/500px-2011-11-24_Hygrophorus_camarophyllus_%28Alb._%26_Schwein.%29_Dum%C3%A9e%2C_Grandjean_%26_Maire_184339.jpg'),

  ('Blek kantarell', 'Cantharellus pallens', 'Pale chanterelle', 'Cantharellaceae', 'Cantharellus',
   'Lik vanlig kantarell, men med et hvitaktig, dugget belegg på hatten. Samme nedløpende lister i stedet for ekte skiver. Utmerket matsopp.',
   'edible', 'Utmerket matsopp, behandles som vanlig kantarell. Det blekt duggede hatteskinnet er forskjellen.',
   NULL, NULL,
   ARRAY['barskog','løvskog','blandingsskog'], 'jord', ARRAY['gran','bjørk','eik'],
   7, 10, 8, 9, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/2010-06-18_Cantharellus_pallens_92488.jpg/500px-2010-06-18_Cantharellus_pallens_92488.jpg'),

  ('Svovelriske', 'Lactarius scrobiculatus', 'Spotted milkcap', 'Russulaceae', 'Lactarius',
   'Stor, gulskjellet riske med gropet stilk og hvit melkesaft som raskt blir svovelgul. Skarp — regnes som uspiselig i Norge.',
   'inedible', 'Uspiselig (skarp). Tatt med fordi den er vanlig og lett å forveksle med spiselige gule risker — den svovelgule melkesaften kjennetegner den.',
   NULL, NULL,
   ARRAY['granskog','barskog'], 'jord', ARRAY['gran'],
   8, 10, 9, 10, ARRAY['hele Norge'], 'common', 'mvp_curated',
   'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Lactarius_scrobiculatus.JPG/500px-Lactarius_scrobiculatus.JPG')
ON CONFLICT (latin_name) DO UPDATE SET
  norwegian_name = EXCLUDED.norwegian_name,
  english_name = EXCLUDED.english_name,
  family = EXCLUDED.family,
  genus = EXCLUDED.genus,
  description = EXCLUDED.description,
  edibility = EXCLUDED.edibility,
  edibility_notes = EXCLUDED.edibility_notes,
  toxin_info = EXCLUDED.toxin_info,
  symptoms = EXCLUDED.symptoms,
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
-- Primary photos for the detail page (list view uses primary_image_url above).
-- Guarded so re-running does not create duplicate photo rows.
-- ---------------------------------------------------------------
INSERT INTO species_photos (species_id, image_url, is_primary, photo_type, license)
SELECT s.id, s.primary_image_url, TRUE, 'general', 'Wikimedia Commons'
FROM mushroom_species s
WHERE s.latin_name IN (
  'Amanita phalloides','Amanita pantherina','Amanita regalis','Amanita rubescens',
  'Galerina marginata','Gyromitra esculenta','Cortinarius orellanus','Clitocybe dealbata',
  'Inocybe erubescens','Russula emetica','Entoloma sinuatum','Scleroderma citrinum',
  'Hypholoma lateritium','Imleria badia','Suillus grevillei','Russula xerampelina',
  'Russula aeruginea','Russula claroflava','Russula decolorans','Craterellus lutescens',
  'Tricholoma portentosum','Hygrophorus hypothejus','Laccaria amethystina','Sparassis crispa',
  'Auricularia auricula-judae','Flammulina velutipes','Agaricus arvensis','Lepista nuda',
  'Calocybe gambosa','Lycoperdon perlatum','Marasmius oreades','Lactarius trivialis',
  'Albatrellus confluens','Hygrophorus camarophyllus','Cantharellus pallens','Lactarius scrobiculatus'
)
AND s.primary_image_url IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM species_photos p WHERE p.species_id = s.id);

-- ---------------------------------------------------------------
-- Look-alike warnings (safety-critical). Each new edible is tied to its toxic
-- twin; the classic deadly confusions are covered. Both sides exist now.
-- Idempotent via UNIQUE(species_id, look_alike_id).
-- ---------------------------------------------------------------
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT s.id, la.id, sim, diff, lvl FROM (
  VALUES
    -- Flatklokkehatt (dødelig) likner vedboende matsopper
    ('Vintersopp', 'Galerina marginata',
     'Begge er små brune sopper i klynger på død løvved, sent på året.',
     'Flatklokkehatt er DØDELIG: brunt sporepulver og ring på stilken. Vintersopp har hvitt sporepulver, fløyelsaktig mørk stilk uten ring. Er du i tvil — la den stå.',
     'critical'),
    ('Honningsopp', 'Galerina marginata',
     'Begge vokser i klynger på ved og kan se like ut på avstand.',
     'Flatklokkehatt er liten, DØDELIG og vokser oftest på bartre; honningsopp er større med lyse skjell på hatten. Vær ekstremt varsom med små brune vedsopper.',
     'critical'),
    -- Steinmorkel (dødelig) likner ekte morkel
    ('Spiss morkel', 'Gyromitra esculenta',
     'Begge er rynkete vårsopper og kalles "morkler" i dagligtale.',
     'Steinmorkel er giftig/dødelig og har en uregelmessig, hjernelignende hatt. Ekte morkler har et regelmessig, bikube-/honeycomb-mønster og er hule hele veien gjennom.',
     'critical'),
    ('Vanlig morkel', 'Gyromitra esculenta',
     'Begge er rynkete vårsopper og kalles "morkler".',
     'Steinmorkel er giftig/dødelig med hjernelignende, fylt hatt; vanlig morkel har regelmessige groper og er hul.',
     'critical'),
    -- Grønn fluesopp (dødelig) likner sjampinjonger
    ('Snøballsjampinjong', 'Amanita phalloides',
     'Unge, hvite eksemplarer kan ligne dødelig grønn/hvit fluesopp.',
     'Sjampinjong har rosa→sjokoladebrune skiver og INGEN pose ved basen. Fluesopp har alltid hvite skiver og en volva (pose) nederst på stilken. Grav alltid opp hele stilken.',
     'critical'),
    -- Hvit trakttsopp (giftig) likner nellikhatt på plen
    ('Nellikhatt', 'Clitocybe dealbata',
     'Begge er små, lyse sopper som vokser i ring på plen og gress.',
     'Hvit trakttsopp er giftig (muskarin): kritthvit med tette, nedløpende skiver. Nellikhatt er lærbrun med seig stilk og fjerntstående, frie skiver. Lær forskjellen før du plukker på gress.',
     'critical'),
    -- Giftrødskivesopp likner vårfagerhatt + sjampinjong
    ('Vårfagerhatt', 'Entoloma sinuatum',
     'Begge er lyse, kjøttfulle sopper med melaktig lukt, delvis samme habitat.',
     'Giftrødskivesopp får ROSA skiver (rosa sporepulver). Vårfagerhatt beholder hvite/kremfargede skiver. Sjekk alltid skivefargen på modne eksemplarer.',
     'high'),
    -- Panterfluesopp (giftig) vs rødnende fluesopp (spiselig stekt)
    ('Rødnende fluesopp', 'Amanita pantherina',
     'Begge er brune fluesopper med flekker, ring og knollformet base.',
     'Rødnende fluesopp RØDNER i kjøttet ved skade og har ring med striper. Panterfluesopp rødner ikke og har en skarp ringkant (sokkel) ved basen. Er du usikker — dropp begge.',
     'high'),
    -- Potetrøyksopp (giftig) vs vorterøyksopp (spiselig ung)
    ('Vorterøyksopp', 'Scleroderma citrinum',
     'Begge er runde "baller" på bakken.',
     'Snitt den i to: vorterøyksopp er myk og HELT HVIT inni når den er spiselig. Potetrøyksopp er hard, med mørkt svart-fiolett, marmorert indre — giftig.',
     'medium'),
    -- Giftkremle vs milde matkremler (smaksregelen)
    ('Storkremle', 'Russula emetica',
     'Knallrøde kremler kan se like ut.',
     'Smak en liten bit på tungen og spytt ut: giftkremle er BRENNENDE skarp. Storkremle og andre matkremler er milde. Skarp kremle = ikke matsopp.',
     'medium'),
    ('Gulkremle', 'Russula emetica',
     'Begge er fargesterke kremler i samme områder.',
     'Giftkremle er skarp; gulkremle er mild. Smaksregelen: skarp kremle kastes, mild kremle er trygg.',
     'low')
) AS rel(species_latin, la_latin, sim, diff, lvl)
JOIN mushroom_species s ON s.norwegian_name = rel.species_latin
JOIN mushroom_species la ON la.latin_name = rel.la_latin
ON CONFLICT (species_id, look_alike_id) DO UPDATE SET
  similarity_description = EXCLUDED.similarity_description,
  difference_description = EXCLUDED.difference_description,
  danger_level = EXCLUDED.danger_level;

COMMIT;
