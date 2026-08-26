-- ÅTTE NYE ARTER SOM LÅSER OPP FORVEKSLINGSDATA FOR SJU MATSOPPER (2026-08-04)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- FORVEKSLINGSHULLET VAR ET KATALOGHULL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migrasjon 048 fylte forvekslingsdata for 14 matsopper. Sju kunne ikke fylles,
-- og grunnen var ikke at det manglet dokumenterte forvekslinger — det var at
-- DOBBELTGJENGERNE IKKE FANTES I KATALOGEN.
--
-- Verst for gråmusserong, som ble satt øverst: alle dens dokumenterte
-- forvekslinger er musseronger, og gråmusserong var appens ENESTE Tricholoma.
-- Den mest etterspurte matmusserongen sto derfor uten en eneste rad, ikke fordi
-- den er trygg, men fordi det ikke fantes noe å peke på.
--
-- Klasse og norsk navn for alle åtte er hentet fra NSNFs normliste (parset
-- 2026-08-04), ikke fra en språkmodell. Svenske navn er hentet fra SLU
-- Artdatabanken/Dyntaxa via GBIF vernacularNames — aldri oversatt.
--
-- ⚠️ «Kantmusseron s. str.» skal ha med «s. str.». Uten det peker navnet på et
-- ANNET taxon for en svensk bruker (Dyntaxa bruker «kantmusseron s. lat.» om
-- Tricholoma sejunctum s.lat.). Nøyaktig fellen CLAUDE.md advarer mot.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- REGELEN SOM KOM UT AV TRE MOTPRØVERUNDER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Denne migrasjonen tok tre runder. Første utkast ble underkjent på ALLE åtte.
-- Etter revisjon ble sju fortsatt underkjent — av samme grunn hver gang, og
-- grunnen er verdt å skrive ned, for den gjelder alt sikkerhetsinnhold i appen:
--
--     ⚠️ EN FELTTEST KAN DØMME ET FUNN UTE. DEN KAN ALDRI FRIKJENNE DET.
--
-- Første runde skrev «mild smak = gråmusserong». Galt: den GIFTIGE
-- pantermusserongen smaker også mildt og lukter mel.
--
-- Andre runde rettet smaken — og flyttet frikjennelsen et hakk:
--   «bare hatt, skiver og voksested kan frikjenne»   (pantermusserong)
--   «hvitt betyr hulriske, vannklart betyr lakrisriske» (lakrisriske)
--   «gir ingen forgiftning hvis du holder deg unna alkohol» (klubbetraktsopp)
--   hvitt sporeavtrykk lest som BEKREFTELSE på blå ridderhatt (brunkjøttbukkesopp)
--
-- Alle fire leses av en nybegynner som «da er jeg trygg». Tredje runde gjorde
-- hver eneste test ensrettet. Skriver du ny forvekslingstekst: formuler ALLTID
-- som «ser du X, er funnet ute», ALDRI som «ser du Y, er du trygg».
--
-- To andre ting motprøven stoppet, verdt å huske:
--   • Krittøsterssopp ANBEFALTE seg selv som matsopp. NSNF sier bare «spiselig
--     med merknad», og Sveriges svampkonsulenter har strøket arten helt. Appen
--     skal beskrive, ikke oppfordre — særlig ikke når merknaden gjelder nedsatt
--     nyrefunksjon, som ofte er symptomfri i tidlig fase.
--   • Såpemusserong-teksten sa at arten smaker melaktig, samtidig som nøkkelen
--     mot gråmusserong var «mel = gråmusserong». Selvmotsigende, og den ville
--     gitt falsk bekreftelse på tvers av to oppføringer.

-- ── Pantermusserong (Tricholoma filamentosum) — NSNF: toxic
INSERT INTO mushroom_species (
  norwegian_name, latin_name, swedish_name, english_name, family, genus,
  description, cap_description, stem_description, gills_description, smell,
  edibility, edibility_notes, toxin_info, symptoms,
  habitat, substrate, mycorrhizal_partners, season_start, season_end,
  regions, commonality, data_source, verified
) VALUES (
  'Pantermusserong', 'Tricholoma filamentosum', 'Pantermusseron', NULL, 'Tricholomataceae', 'Tricholoma',
  'Stor, kraftig og gråhvit musserong med tørr hatt dekket av mørkere gråbrune skjell — som pelsen til en panter. Sjelden i Norden, og bundet til rik edelløvskog, i Norge særlig EIKESKOG på næringsrik grunn (trolig også lind og osp). Hos oss er den bare kjent fra en smal kyststripe fra Kragerø til Arendal. Regnes som en av Europas kraftigste mage-tarm-giftige sopper.',
  '7–15 cm bred, først hvelvet, siden utflatet. Lys grå til sølvgrå, TØRR og tett dekket av mørkere gråbrune SKJELL som ligger takstein- eller ringformet utover fra midten. Skjellene kjenner du med neglen. Hatten er aldri glatt, blank eller klebrig.',
  'Kraftig og fast, ofte 7–12 cm høy og 2–3 cm tykk, hvitaktig til lyst brunlig, uten ring. Foten er gjerne fortykket nederst. Ikke gult skjær øverst.',
  'Hvite til gråhvite, ganske tettsittende og buktet tilvokst til stilken. Helt uten gult skjær. Gråmusserong har oftest et gult skjær i skivene, men det kan være svakt hos unge sopper — bruk det som støtte, ikke som fasit.',
  'Melaktig, som nymalt mel. Den fine melduften er ingen trygghetsgaranti — det er nettopp derfor arten er farlig. Både brungul musserong, såpemusserong og denne giftige arten lukter mel.',
  'toxic',
  'GIFTIG. Skal ikke spises. Selv en liten porsjon gir voldsom og langvarig magesyke. Verken koking, tørking eller utvanning fjerner giften. Arten smaker mild — smaksprøve kan bare dømme et funn ut, aldri frikjenne det, så bruk aldri smak eller lukt til å godkjenne en grå musserong. Arten er dessuten sjelden og rødlistet (VU) — la den stå der den vokser.',
  'Giftstoffet er ikke fullt ut kartlagt, men det er sterkt mageirriterende og tåler varmebehandling. Arten hører til pantermusserong-gruppen (Tricholoma pardinum-gruppen), som regnes som de kraftigste mage-tarm-giftige soppene i Europa.',
  'Kvalme, kraftige oppkast, magekramper og voldsom diaré, vanligvis 15 minutter til 2 timer etter måltidet. Plagene kan vare i flere dager og gi alvorlig væsketap — særlig farlig for barn og eldre. Ring Giftinformasjonen 22 59 13 00, og ta med rester av soppen eller et bilde til legevakten.',
  ARRAY['løvskog','edelløvskog'], 'jord', ARRAY['eik','lind','osp'], 8, 11,
  ARRAY['Sør-Norge'], 'rare', 'nsnf_normliste_2026', true
) ON CONFLICT (latin_name) DO NOTHING;

-- Gråmusserong advares mot Pantermusserong  (high)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT 72, l.id, 'Begge er grå musseronger uten ring, med mørkere tegning på hatten og hvitaktig stilk, og begge kan stå i september og oktober. Og her ligger fellen: pantermusserong lukter godt av mel og smaker mild, akkurat som gråmusserong. Lukt og smak kan ikke frikjenne funnet. Det kan ingenting annet heller: trekkene under kan fortelle deg at du IKKE har gråmusserong, men de kan aldri gjøre en ubestemt grå musserong trygg. For de fleste blir alle grå musseronger «en grå musserong» i kurven — det er nettopp der feilen skjer. Pantermusserong er sjelden i Norden. I Norge står den i praksis bare på kyststripen i Telemark og Agder (Porsgrunn–Grimstad, med kjerneområder rundt Kragerø og Arendal), i Sverige nesten bare i Skåne — altså i de samme traktene der folk plukker gråmusserong om høsten.',
  'Se på hatten, og let etter gult. Hos gråmusserong er hatthuden GLATT og KLEBRIG i fuktig vær, med innvokste mørke fibrer som blyantstreker under huden — ikke skjell du kan kjenne med neglen — og den har ofte et gult skjær i skivene og øverst på stilken. Pantermusserong er større og kraftigere, hatten er TØRR og oppbrutt i grove gråbrune SKJELL du kjenner med neglen, og skivene er hvite helt uten gult. Voksested og tid peker samme vei: gråmusserong står i furuskog og annen barskog og er en sein art (september–november, med topp i oktober), pantermusserong står i rik eikeskog og annen edelløvskog og kommer tidligere, med topp i september. Ikke bruk lukt eller smak til å avgjøre dette paret — begge lukter mel og smaker mildt. Ved tvil — la stå.', 'high'
FROM mushroom_species l WHERE l.latin_name = 'Tricholoma filamentosum'
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- ── Gallemusserong (Tricholoma virgatum) — NSNF: inedible
INSERT INTO mushroom_species (
  norwegian_name, latin_name, swedish_name, english_name, family, genus,
  description, cap_description, stem_description, gills_description, smell,
  edibility, edibility_notes, toxin_info, symptoms,
  habitat, substrate, mycorrhizal_partners, season_start, season_end,
  regions, commonality, data_source, verified
) VALUES (
  'Gallemusserong', 'Tricholoma virgatum', 'Gallmusseron', 'Ashen Knight', 'Tricholomataceae', 'Tricholoma',
  'Grå musserong med tørr, sølvglinsende og radiært fibret hatt og en tydelig SPISS PUKKEL midt på. Vanlig i barskog over hele Norden — omtrent like vanlig som gråmusserong, og ofte i samme skogsteig. Smaken er brennende skarp og bitter, og ett eksemplar ødelegger hele gryta.',
  '4–9 cm bred. Først spisst kjegleformet, siden utflatet, men beholder alltid en tydelig SPISS PUKKEL midt på. Grå til sølvgrå, ofte med et svakt fiolett anstrøk, og med mørkere radiære fibrer som stråler ut fra midten. Hatten er TØRR og silkeglinsende — den blir ikke klebrig i fuktig vær.',
  'Hvit til lysegrå, glatt og sylindrisk, ofte litt tykkere nederst. 4–10 cm høy, uten ring. Ikke noe gult skjær øverst.',
  'Lyst grå, tettsittende og buktet tilvokst. Får med alderen et svakt rosalig eller brunlig anstrøk, og eggen kan bli flekket. Ikke noe gult skjær.',
  'Ubehagelig, litt reddikaktig. IKKE melaktig — melduft peker mot gråmusserong eller den giftige pantermusserongen. Men lukt kan bare peke, aldri frikjenne et funn.',
  'inedible',
  'IKKE MATSOPP. Brennende skarp og bitter smak, og mistenkt giftig. Bitterstoffene forsvinner ikke ved koking, så én hatt er nok til å ødelegge en hel soppgryte. Kast hele retten hvis du oppdager den etterpå. Merk: en skarp smaksprøve dømmer funnet, men mild smak frikjenner ingenting — flere grå musseronger smaker mildt, og noen av dem er giftige.',
  'Den skarpe, bitre smaken sitter i kjøttet og tåler koking. Giftstoffene er ikke kartlagt, men arten regnes som mageirriterende og står som «mistenkt giftig» i normlisten.',
  'Kvalme, magesmerter og diaré kan komme noen timer etter et måltid. Sjelden alvorlig, men ubehagelig. Har noen fått i seg en større mengde, ring Giftinformasjonen 22 59 13 00.',
  ARRAY['barskog','blandingsskog','løvskog'], 'jord', ARRAY['gran','furu'], 8, 10,
  ARRAY['hele Norge'], 'common', 'nsnf_normliste_2026', true
) ON CONFLICT (latin_name) DO NOTHING;

-- Gråmusserong advares mot Gallemusserong  (medium)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT 72, l.id, 'Begge er grå musseronger med radiært fibret hatt og hvitaktig stilk uten ring, og begge står i furu- og barskog i hele Norge og Sverige. Begge er vanlige, og de kan stå i samme skogsteig samme dag. Sesongene overlapper i september og oktober — gallemusserong kommer tidligst (topp i september), gråmusserong er den seine (topp i oktober, og den står ut i november).',
  'Se på midten av hatten, og let etter gult. Gallemusserong har en tydelig SPISS PUKKEL midt på hatten, også etter at resten har flatet seg ut, og hatten er TØRR og silkeglinsende. Gråmusserong har på det meste en lav, avrundet bule, hatten er GLATT OG KLEBRIG i fuktig vær, og den har et GULT SKJÆR i skivene og øverst på stilken. Gallemusserong har ingen gulfarge noe sted. Lukten peker, men avgjør ikke: gallemusserong lukter ubehagelig og reddikaktig, mens melduft peker mot gråmusserong — eller mot pantermusserong. Smaksprøven kan bare dømme, aldri frikjenne. En bitteliten flis på tungespissen er BRENNENDE SKARP hos gallemusserong — da er hele funnet ute, spytt ut alt og svelg aldri. Men mild og melaktig smak beviser INGENTING: den giftige pantermusserongen smaker også mildt og lukter mel. Er smaken mild, vet du bare at det ikke er gallemusserong — ikke hva du faktisk har. Gult skjær utelukker gallemusserong, men gjør ikke funnet spiselig: gråmusserong må bestemmes positivt på klebrig hatt og blyantstreker, ellers står den. Ser du ETT ELLER FLERE av disse — gjerne stor og kjøttfull (opptil 15 cm), tørr hatt oppbrutt i mørkere gråbrune skjell, skiver helt hvite uten gult, eller rik eikeskog og annen edelløvskog — la den stå. Da kan det være pantermusserong, som gir voldsom og langvarig magesyke.', 'medium'
FROM mushroom_species l WHERE l.latin_name = 'Tricholoma virgatum'
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- ── Såpemusserong (Tricholoma saponaceum) — NSNF: inedible
INSERT INTO mushroom_species (
  norwegian_name, latin_name, swedish_name, english_name, family, genus,
  description, cap_description, stem_description, gills_description, smell,
  edibility, edibility_notes, toxin_info, symptoms,
  habitat, substrate, mycorrhizal_partners, season_start, season_end,
  regions, commonality, data_source, verified
) VALUES (
  'Såpemusserong', 'Tricholoma saponaceum', 'Såpmusseron', 'Soapy knight', 'Tricholomataceae', 'Tricholoma',
  'Såpemusserong er en svært variabel musserong som lukter såpe eller gammel oppvaskklut. Fargen spenner fra gulgrå og olivengrønn til gråbrun og nesten brunsvart. Det mest holdbare kjennetegnet er at HELE soppen får rødbrune til laksrosa flekker med alderen. Svampguiden peker på nettopp den fargeendringen som hovedkjennetegnet, fordi form og farge ellers varierer så mye at arten er vanskelig å bestemme. Den vokser i både barskog og løvskog over hele Norden, fra sommeren og ut høsten, og er en av de vanligste musserongene i skogen.',
  '4-12 cm, først hvelvet med lav pukkel, senere utbredt. Matt og tørr, ofte med lysere, nesten hvitaktig kant. Fargen varierer mye mellom gulgrå, gulbrun, gråbrun, olivengrønn og brunsvart, men hatten mangler de svarte, blyantaktige strekene som kjennetegner gråmusserong. Eldre hatter får RØDBRUNE TIL LAKSROSA FLEKKER.',
  '4-12 cm høy, om lag 1-2 cm tykk, skittenhvit og ofte med grågrønt skjær. Ingen ring. Stilken GÅR DYPT NED I JORDA og er rotende i basen — du må grave for å få den hel opp. Stilkbasen får ofte et rødlig til laksrosa skjær der du skjærer eller skraper i den. Unge sopp kan mangle flekkene helt; at de ikke er der, utelukker ikke såpemusserong.',
  'Glisne (bredt stilte) og BUKTET INNFESTET mot stilken — de stopper ved stilken og løper ikke nedover den. Skittenhvite, av og til med grønnlig anstrøk, og de flekker seg rødbrunt til laksrosa ved trykk og med alderen.',
  'Tydelig såpe eller gammel oppvaskklut, sterkest når du knuser skivene. Lukten forsvinner ikke ved steking. Ikke smak på den.',
  'inedible',
  'IKKE MATSOPP. Norges sopp- og nyttevekstforbund fører såpemusserong som ikke matsopp — den kan gi mage-/tarmreaksjon. Såpelukten forsvinner ikke ved steking. La den stå.',
  'Ingen navngitte giftstoffer er kartlagt. Arten regnes som mageirriterende, ikke som en systemisk forgifter.',
  'Kvalme, magesmerter, oppkast og diaré noen timer etter måltidet hos dem som reagerer. Går vanligvis over av seg selv. Er du usikker på hva du har spist, ring Giftinformasjonen 22 59 13 00.',
  ARRAY['barskog','løvskog','blandingsskog'], 'jord', ARRAY['gran','furu','bjørk'], 7, 10,
  ARRAY['hele Norge'], 'common', 'nsnf_normliste_2026', true
) ON CONFLICT (latin_name) DO NOTHING;

-- Gråmusserong advares mot Såpemusserong  (medium)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT 72, l.id, 'Begge er grå til gråbrune musseronger med hvitaktige skiver, hvit stilk og lav pukkel på hatten, og begge står i barskog utover høsten. Såpemusserong er svært variabel i form og farge, og de mørke, olivengrå til brunsvarte formene ligner gråmusserong godt. Svampguiden fører streckmusseron (gråmusserong) på lista over såpemusserongens forvekslingsarter. Begge har dessuten buktet innfestede skiver som ikke løper ned på stilken.',
  'Se etter FLEKKENE først: såpemusserong får RØDBRUNE TIL LAKSROSA flekker over hele soppen med alderen, og der du skjærer eller skraper i stilkbasen. Gråmusserong får bare gulaktige toner i skiver og stilk, aldri rosa. Merk at unge såpemusseronger ennå kan være uflekkete — finner du ingen rosa toner, har du derfor ikke bevist noe. Lukt deretter: såpemusserong lukter tydelig SÅPE eller gammel oppvaskklut når du knuser skivene. Melukten hos gråmusserong er svak og upålitelig — fravær av såpelukt beviser IKKE at du har gråmusserong. Se til slutt på hatten: gråmusserong er grå til gråfiolett med nesten svart midte og tydelige svarte, BLYANTAKTIGE STREK ut mot kanten, og hatten er KLISSEN i fuktig vær. Såpemusserong er matt og tørr, uten slike strek. Ved tvil — la stå.', 'medium'
FROM mushroom_species l WHERE l.latin_name = 'Tricholoma saponaceum'
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Sotvokssopp advares mot Såpemusserong  (medium)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT 85, l.id, 'De mørke formene av såpemusserong er gråbrune til nesten brunsvarte med lys stilk og glisne, hvitaktige skiver — samme førsteinntrykk som sotvokssopp. Begge står i eldre gran- og furuskog i september og oktober, gjerne i samme mosebunn, og begge har lav pukkel på hatten. At skivene står glisent hos begge gjør at avstanden mellom skivene ikke hjelper deg.',
  'Kjenn på skivene først. Sotvokssopp har TYKKE, VOKSAKTIGE skiver som LØPER NEDOVER STILKEN og føles fete mellom fingrene. Såpemusserong har tynne, sprø skiver som er BUKTET INNFESTET og stopper brått ved stilken, aldri nedløpende. Lukt deretter: såpemusserong lukter SÅPE eller gammel oppvaskklut når du knuser skivene, mens skrap i STILKBASEN på sotvokssopp ofte gir en søtlig honninglukt — men den er variabel, så bruk den bare som støtte. Kjenner du ingen såpelukt, er ingenting avgjort. Eldre såpemusserong får dessuten rødbrune til laksrosa flekker over hele soppen — det gjør ikke sotvokssopp. Ved tvil — la stå.', 'medium'
FROM mushroom_species l WHERE l.latin_name = 'Tricholoma saponaceum'
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- ── Brungul musserong (Tricholoma arvernense) — NSNF: inedible
INSERT INTO mushroom_species (
  norwegian_name, latin_name, swedish_name, english_name, family, genus,
  description, cap_description, stem_description, gills_description, smell,
  edibility, edibility_notes, toxin_info, symptoms,
  habitat, substrate, mycorrhizal_partners, season_start, season_end,
  regions, commonality, data_source, verified
) VALUES (
  'Brungul musserong', 'Tricholoma arvernense', 'Kantmusseron s. str.', NULL, 'Tricholomataceae', 'Tricholoma',
  'Brungul musserong hører til kantmusserong-gruppa (Tricholoma sejunctum-gruppa) og kjennes på tørr, fintfibret hatt med gulbrun til orangebrun grunnfarge og hvitaktige skiver som gulner mot hattkanten. Den vokser med furu, sjeldnere gran, på tørr bakke i barskog. Norges sopp- og nyttevekstforbund regner den som mistenkt giftig.',
  '5-8 cm, først hvelvet med pukkel, senere utbredt til klokkeformet. Tørr og matt med fine, tiltrykte fibrer: brunlige til gulbrune fibrer på gulaktig bunn, hvitaktig mot kanten og mørkere brun i midten. Grunnfargen er GULBRUN til orangebrun — ofte med orange til rødlige toner i hatt og stilk. Ikke ren grå, og uten gråmusserongens svarte blyantstrek.',
  '4-8 cm høy, 1-2 cm tykk, jevntykk eller litt oppsvulmet nedover. Glatt, tørr og hvitaktig, ofte med gule partier og brunlige flekker. Basen blir gjerne brunlig til rødlig. Ingen ring.',
  'Buktet innfestet og ganske tette, hvitaktige — men de gulner tydelig mot hattkanten på eldre sopp. Ikke nedløpende. Merk at gulningen IKKE er et kjennetegn du kan bestemme arten på: gråmusserong gulner på samme måte, både i skivene og på stilken.',
  'Melaktig lukt. Men melukt går igjen hos flere musseronger — både hos gråmusserong og hos giftige arter i slekta — så lukten kan bare vekke mistanke, aldri frikjenne et funn. Ikke smak på den: arten er mistenkt giftig.',
  'inedible',
  'IKKE MATSOPP. Norges sopp- og nyttevekstforbund fører brungul musserong som ikke matsopp og merker den mistenkt giftig. Den er vanskelig å skille fra de nærstående musserongene i kantmusserong-gruppa. La den stå.',
  'Giftstoffene er ikke kartlagt. Arten står som mistenkt giftig på normlisten, og de nærstående artene i sejunctum-gruppa regnes gjennomgående som uspiselige eller mageirriterende.',
  'Ikke dokumentert i detalj. Mistanken gjelder mage- og tarmplager: kvalme, magesmerter, oppkast og diaré. Har du spist en musserong du ikke kjente sikkert igjen, ring Giftinformasjonen 22 59 13 00.',
  ARRAY['furuskog','barskog','granskog'], 'jord', ARRAY['furu','gran'], 8, 10,
  ARRAY['Sør-Norge','Midt-Norge'], 'uncommon', 'nsnf_normliste_2026', true
) ON CONFLICT (latin_name) DO NOTHING;

-- Gråmusserong advares mot Brungul musserong  (medium)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT 72, l.id, 'Begge er musseronger med fiberstripet hatt, buktet innfestede skiver som gulner, og hvitaktig stilk med gule partier — og begge står i furuskog fra august til oktober, ofte i samme mosebunn. Gulningen i skivekanten er nettopp det folk leter etter hos gråmusserong, og brungul musserong har akkurat det samme. Det gjelder stilken også: begge arter får gulaktige partier nedover stilken, så heller ikke det trekket skiller dem. Svampguiden fører kantmusseron (brungul musserong) som forvekslingsart til gråmusserong.',
  'Se på GRUNNFARGEN i hatten. Gråmusserong er GRÅ til gråfiolett med nesten svart midte og tydelige svarte, BLYANTAKTIGE STREK ut mot kanten, og hatten er KLISSEN i fuktig vær. Brungul musserong har GULBRUN til orangebrun grunnfarge med brunlige fibrer og mørkere brun midte, ofte med orange til rødlige toner, og hatten er TØRR og matt uten blyantstrek. Er bunnfargen gul, brungul eller orangebrun, har du ikke gråmusserong. Merk at GULNINGEN I SKIVEKANTEN IKKE SKILLER DEM — begge har den, og begge gulner på stilken, så de trekkene kan du ikke bruke. Og pass på: MELUKTEN SKILLER DEM HELLER IKKE — begge lukter mel. Har du lært at melukt betyr gråmusserong, holder ikke den regelen her. Det eneste som skiller dem i felt er fargen og overflaten på hatten. Ikke smak deg fram heller: brungul musserong er mistenkt giftig, og mild smak frikjenner ingen musserong. Motsatt vei gjelder like fullt — en grå hatt alene gjør ikke funnet til gråmusserong, for flere grå musseronger er giftige. Ved tvil — la stå.', 'medium'
FROM mushroom_species l WHERE l.latin_name = 'Tricholoma arvernense'
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- ── Lakrisriske (Lactarius helvus) — NSNF: toxic
INSERT INTO mushroom_species (
  norwegian_name, latin_name, swedish_name, english_name, family, genus,
  description, cap_description, stem_description, gills_description, smell,
  edibility, edibility_notes, toxin_info, symptoms,
  habitat, substrate, mycorrhizal_partners, season_start, season_end,
  regions, commonality, data_source, verified
) VALUES (
  'Lakrisriske', 'Lactarius helvus', 'Lakritsriska', 'Fenugreek milkcap', 'Russulaceae', 'Lactarius',
  'Stor riske med blekt lærbrun til gråbeige, tørr og fint filtet hatt som ofte blir traktformet med alderen. Melkesaften er vannklar og sparsom, ikke hvit og ikke oransje, og soppen lukter sterkt av karri, lakris eller tørket suppeterning — særlig når den tørker. Svært vanlig i fuktig barskog, myrkant og torvmose, og ført som giftig av Norges sopp- og nyttevekstforbund.',
  '6–15 cm. Blekt lærbrun, gråbeige til gulbrun, ofte med svake soner som en skyteskive. Overflaten er TØRR og fint filtet eller lodden — aldri slimet eller klissen, heller ikke i regnvær. Først hvelvet, så flat med nedsenket midte, til slutt traktformet.',
  '6–10 cm høy og 1–2 cm tykk, omtrent samme farge som hatten eller litt lysere. Blir HUL med alderen. Ingen ring og ingen knoll eller pose nederst.',
  'Nedløpende, ganske tettsittende og ikke særlig tykke. Først kremhvite, senere gulbrune som hatten. Får blekt brunlige flekker der du tar på dem — aldri grønne.',
  'Sterk og karakteristisk: karri, lakris, bukkehornkløver eller tørket suppeterning. Lukten blir enda kraftigere når soppen tørker, og henger igjen i kurven og i tørkeskapet. Merk at lukten kan dømme, men aldri frikjenne: svak lukt på fersk, gjennomvåt sopp gjør ikke et funn trygt.',
  'toxic',
  'GIFTIG. Skal ikke spises, verken rå, stekt eller forvellet. Lukten frister noen til å bruke den tørket som krydder, men Norges sopp- og nyttevekstforbund fører arten som giftig — la den stå. Kast den ut av kurven med en gang, ikke oppå matsoppen.',
  'Giftstoffet er ikke fullt kartlagt. Den karakteristiske lukten kommer fra aromastoffet sotolon, som også finnes i bukkehornkløver og lønnesirup, men det er ikke lukten som gjør soppen giftig — giftvirkningen sitter i soppkjøttet. Vanlig steking fjerner den ikke pålitelig.',
  'Kvalme, oppkast, magesmerter og diaré, vanligvis 30 minutter til 3 timer etter måltidet. Går som regel over av seg selv i løpet av 1–2 døgn. Drikk væske. Ved store inntak, kraftige eller langvarige symptomer, eller symptomer hos barn: ring Giftinformasjonen 22 59 13 00.',
  ARRAY['barskog','granskog','fuktig skog','myr','mose'], 'jord', ARRAY['gran','bjørk'], 7, 10,
  ARRAY['hele Norge'], 'very_common', 'nsnf_normliste_2026', true
) ON CONFLICT (latin_name) DO NOTHING;

-- Hulriske advares mot Lakrisriske  (medium)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT 83, l.id, 'Dette er den vanskeligste forvekslingen for lakrisriske. Begge er store, gråbrune risker som står i den samme fuktige gran- og bjørkeskogen og langs de samme myrkantene fra august til oktober, begge har nedløpende skiver, og BEGGE får hul stilk med alderen — så hul stilk skiller dem ikke, tross navnet. Hulriske plukkes gjerne i mengder til forvelling, og når det går fort i bøtta er det lett å få med seg en lakrisriske uten å ha sett på den enkelte soppen. Ung hulriske er blygrå til grålilla, men gammel og regnvasket hulriske bleikner til lys brun eller beige — altså samme farge som lakrisriske. Fargen alene skiller dem derfor ikke.',
  'To ting kan dømme et funn ute, og begge tar under et minutt. (1) MELKESAFTEN: hulriske gir HVIT melk som pipler fram med en gang og gråner til grågrønn etter hvert som den tørker inn — det kan ta lengre tid enn noen minutter, så det er den HVITE fargen i det melka kommer ut som er testen. Lakrisriske gir VANNKLAR, nesten fargeløs og svært sparsom melk. Skjær i skivene og se snittet mot lyset, eller stryk melka ut på neglen — VANNKLAR melk betyr at funnet er ute — la den stå. Hvit melk utelukker lakrisriske, men frikjenner ingenting: flere andre risker i den samme fuktige granskogen har også hvit melk. Hvit melk betyr bare at du må bestemme arten videre. (2) HATTOVERFLATEN: stryk fingeren over hatten. Hulriske er glatt og KLISSEN i fuktig vær, lakrisriske er TØRR og fløyelsaktig uansett vær. Fargen kan du ikke bruke som eget skille — en bleik, regnvasket hulriske er brunbeige akkurat som lakrisriske. Lukt til slutt, men bare som støtte: lakrisriske lukter sterkt av karri, lakris eller suppeterning, hulriske lukter nesten ingenting. Lukten kan dømme, aldri frikjenne — kjenner du ingen karrilukt, er funnet ikke dermed trygt, for lukten er svakest på fersk, gjennomvåt sopp og sterkest når soppen tørker. Vannklar melk på tørr, filtet hatt — la den stå.', 'medium'
FROM mushroom_species l WHERE l.latin_name = 'Lactarius helvus'
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Granmatriske advares mot Lakrisriske  (medium)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT 32, l.id, 'Begge er risker i granskog fra august til oktober, begge har litt traktformet hatt og skiver som løper ned på stilken. Lakrisriske er svært vanlig i nettopp den fuktige granskogen og myrkanten der du leter etter granmatriske, så de havner lett i samme kurv på samme tur. En gammel, regnvasket granmatriske kan miste mye av det oransje og se blekt gulbrun ut — da holder ikke fargen alene som skille.',
  'Bryt hatten og se på melkesaften. Granmatriske gir GULROTORANSJE melkesaft som blir vinrød i løpet av 10–30 minutter, og kjøttet rett under hatthuden er oransjefarget. Lakrisriske gir VANNKLAR og sparsom melkesaft — av og til så lite at du knapt ser den — og har ikke oransje noe sted, verken i melka, kjøttet eller hatten. Granmatriske får GRØNNE flekker der den skades; lakrisriske flekker seg blekt brunt. Kjenn så på hatten: lakrisriske er TØRR og fint filtet, og lukter sterkt av karri, lakris eller suppeterning — den lukten hører ikke hjemme på en matriske. Lukten kan bare dømme, aldri frikjenne: kjenner du ingen karrilukt, er funnet ikke dermed trygt. Melkesaften er det som dømmer. Finner du ikke oransje i melkesaften, la den stå.', 'medium'
FROM mushroom_species l WHERE l.latin_name = 'Lactarius helvus'
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Furumatriske advares mot Lakrisriske  (medium)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT 33, l.id, 'Begge er risker i barskog i august–oktober. Furumatriske står på den tørre furumoen, men lakrisriske står i den fuktige kanten av den samme skogen — i torvmose, myrfuruskog og sig — så du passerer begge på én runde. Blek, gammel furumatriske kan se gråbeige ut når det oransje er vasket bort, og da er farge ikke lenger noe skille.',
  'Bryt hatten. Furumatriske gir GULROTORANSJE melkesaft som holder seg oransjerød, og kjøttet under hatthuden er oransje. Lakrisriske gir VANNKLAR og sparsom melkesaft, uten oransje noe sted. Furumatriske flekker seg GRØNT der den skades eller blir gammel; lakrisriske flekker seg blekt brunt. Hatten skiller også: lakrisriske er TØRR og fint filtet med sterk lukt av karri, lakris eller suppeterning. Også her kan lukten dømme, men aldri frikjenne — svak eller ingen lukt gjør ikke funnet trygt. Ingen oransje melkesaft — la den stå.', 'medium'
FROM mushroom_species l WHERE l.latin_name = 'Lactarius helvus'
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- ── Klubbetraktsopp (Ampulloclitocybe clavipes) — NSNF: inedible
INSERT INTO mushroom_species (
  norwegian_name, latin_name, swedish_name, english_name, family, genus,
  description, cap_description, stem_description, gills_description, smell,
  edibility, edibility_notes, toxin_info, symptoms,
  habitat, substrate, mycorrhizal_partners, season_start, season_end,
  regions, commonality, data_source, verified
) VALUES (
  'Klubbetraktsopp', 'Ampulloclitocybe clavipes', 'Klubbtrattskivling', 'Club foot', 'Hygrophoraceae', 'Ampulloclitocybe',
  'Traktsopp med matt gråbrun til olivenbrun hatt, lyse skiver som løper langt ned på stilken, og en tydelig KØLLEFORMET, oppsvulmet stilkbase som kjennes myk og svampaktig. Vanlig i barskog og løvskog fra sensommer til langt ut på høsten. Den er ikke matsopp: den kan gi en antabusliknende reaksjon sammen med alkohol — både alkohol du drikker etter måltidet og alkohol du drakk noen timer før.',
  '4–8 cm. Først hvelvet med en liten pukkel, senere flat, nedsenket og til slutt traktformet. Matt gråbrun, olivenbrun til mørkt brun med lysere kant. Glatt, litt klissen i fuktig vær — uten mørke, radiære fiberstriper.',
  '3–7 cm høy og 1–1,5 cm tykk oppe, men svulmer nedover til en tydelig KØLLEFORMET base som kan bli 3–4 cm brei. Samme farge som hatten, med fine langsgående fibre. Kjøttet i basen er mykt og svampaktig når du klemmer. Ingen ring.',
  'Hvite til lyst kremgule, ganske tynne og myke, middels tettsittende og tydelig LANGT NEDLØPENDE på stilken. Står i klar kontrast til den mørkere hatten.',
  'Svak og søtlig — sammenlignet med bittermandel, appelsinblomst eller kanel. Smaken er mild og lite karakteristisk. Verken lukt eller smak kan frikjenne et funn: mild smak avgjør ingenting, og lukten er altfor svak og for lik andre arter i samme skog til å stå alene. Bruk stilkbasen og skivene, ikke nesa.',
  'inedible',
  'IKKE MATSOPP. Kan gi en antabusliknende reaksjon sammen med alkohol. Reaksjonen kan utløses av alkohol du drikker i opptil 2–3 døgn etter soppmåltidet, og av alkohol du har drukket noen timer FØR måltidet. Det holder altså verken å droppe vinen samme kveld eller å ta ølet før maten. La den stå, og luk den ut av blandingskurven før du steker.',
  'Virkestoffet er ikke fullt kartlagt, men effekten ligner den coprin gir i grå blekksopp: kroppens nedbryting av alkohol stopper opp på acetaldehyd, akkurat slik legemiddelet Antabus virker. Virkestoffet er ikke kartlagt nærmere, og arten regnes ikke som matsopp uansett — den bør ikke spises, heller ikke av avholdende. Følsomheten kan vare i 2–3 døgn (opptil 48–72 timer) etter måltidet, og alkohol du drakk noen timer før måltidet kan også utløse reaksjonen. Koking eller steking fjerner den ikke.',
  'Utløses av alkohol: rødming i ansikt og på hals, varmefølelse, dunkende hodepine, hjertebank, kvalme og av og til oppkast, noen ganger hovne hender. Kommer typisk 5–30 minutter etter første glass og gir seg som regel i løpet av noen timer. Ved kraftig hjertebank, brystsmerter eller besvimelse: ring 113. Ellers Giftinformasjonen 22 59 13 00.',
  ARRAY['barskog','granskog','furuskog','løvskog','mose'], 'jord', NULL, 8, 11,
  ARRAY['hele Norge'], 'common', 'nsnf_normliste_2026', true
) ON CONFLICT (latin_name) DO NOTHING;

-- Sotvokssopp advares mot Klubbetraktsopp  (medium)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT 85, l.id, 'Begge står i mosekledd barskog under gran og furu sent på høsten, fra september og ut i november, og begge har en mørk hatt over LYSE skiver som går ned mot stilken. I dårlig høstlys, med nåler og mose over hatten, ser de like ut ovenfra — og klubbetraktsopp er vanlig i nøyaktig den samme skogen. Én feilplukk i sotvokssoppfangsten kan utløse en antabusliknende reaksjon hvis det drikkes alkohol i dagene rundt måltidet.',
  'Ta tak i STILKBASEN. Klubbetraktsopp har en tydelig OPPSVULMET, KØLLEFORMET base, opptil 3–4 cm brei, som kjennes MYK og svampaktig når du klemmer. Sotvokssoppens stilk er jevntykk eller SMALNER nedover, og den er fast. Se så på hatten: sotvokssopp er sotsvart til gråsvart med tydelige MØRKE, RADIÆRE FIBERSTRIPER, mens klubbetraktsopp er matt gråbrun til olivenbrun uten fiberstriper og litt klissen i fuktig vær — sotvokssoppens hatt er TØRR å ta på selv i regn. Skivene skiller også: sotvokssoppens skiver er hvite, TYKKE, glisne og voksaktige å ta på og bare så vidt nedløpende, klubbetraktsoppens er tynnere, mykere, lyst kremgule og løper LANGT ned på stilken. Lukt og smak hjelper deg ikke her — begge er milde, og mild smak frikjenner ingenting. Svulmet, svampaktig stilkbase — la den stå.', 'medium'
FROM mushroom_species l WHERE l.latin_name = 'Ampulloclitocybe clavipes'
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- ── Brunkjøttbukkesopp (Cortinarius traganus) — NSNF: inedible
INSERT INTO mushroom_species (
  norwegian_name, latin_name, swedish_name, english_name, family, genus,
  description, cap_description, stem_description, gills_description, smell,
  edibility, edibility_notes, toxin_info, symptoms,
  habitat, substrate, mycorrhizal_partners, season_start, season_end,
  regions, commonality, data_source, verified
) VALUES (
  'Brunkjøttbukkesopp', 'Cortinarius traganus', 'Bockspindling', 'Gassy Webcap', 'Cortinariaceae', 'Cortinarius',
  'Kraftig, blålilla slørsopp som står i moserik barskog under gran og furu, gjerne i eldre skog. Hatten blekner til gulbrun eller okerbrun fra midten med alderen, mens stilken holder på det fiolette lengst. Den kjennes lang vei på den sterke, ubehagelige lukten — men lukt er ikke en artsbestemmelse her, for naboen i samme mose lukter like ille. Nærmeste dobbeltgjenger er nemlig ikke blå ridderhatt, men BLÅKJØTTBUKKESOPP (Cortinarius camphoratus): samme slekt, samme moserike granskog, like fiolett, like vond. Der er det kniven som avgjør. Del stilken på langs — brunkjøttbukkesopp har SAFRANBRUNT kjøtt, blåkjøttbukkesopp har blålilla kjøtt hele veien. Det er nettopp den forskjellen de to norske navnene sikter til. Begge står som «Ikke matsopp» i Normlisten 2025.',
  '4–13 cm. Først halvkuleformet, senere hvelvet til utbredt. Blålilla til blek fiolett når den er ung, blekner til gulbrun eller rustbrun fra midten. Tørr og silkefiltet på overflaten, og sprekker gjerne opp i små flak eller stjerneformet i hattkanten i tørt vær.',
  '5–12 cm høy og 1–4 cm tykk, kraftig, med tydelig løk- eller klubbeformet base. Fiolett øverst, blekere nedover. Har slørrester (cortina) igjen som hvite tråder eller en trådete, oppadvendt ringsone på stilken, ofte pudret rustbrunt av nedfalne sporer. Deler du stilken på langs, er kjøttet SAFRANBRUNT til gulbrunt hele veien, bare stilktoppen kan være lillaskjær. Vær klar over hva den testen faktisk løser: kjøttfargen skiller brunkjøttbukkesopp fra blåkjøttbukkesopp, som har blålilla kjøtt — det er derfor de heter det de heter. Mot blå ridderhatt trenger du den ikke; der holder slørrestene og det rustbrune sporestøvet alene. Og brunt stilkkjøtt frikjenner ingenting: det gjør soppen til en slørsopp, ikke til en trygg sopp.',
  'Bredt tilvokste, ganske tykke og noe fjernstilte, med lysere, litt fintagget egg. På helt unge eksemplarer er skivene ofte HELT DEKKET av det tette sløret, så du må bryte en hatt for i det hele tatt å se dem. Kildene spriker litt på ungfargen: svenske kilder beskriver dem som gulbrune allerede fra starten, andre som svakt skittenfiolette. Begge deler forekommer. Det som er stabilt, er utviklingen: skivene går tydelig over i kanel- til RUSTBRUNT når sporene modnes. De blir aldri stående rent lilla slik som hos blå ridderhatt.',
  'Sterk, gjennomtrengende og ubehagelig. Beskrives som bukk eller geit — derav navnet — og av noen som karbid eller overmoden, sukkersøt frukt. Lukten henger igjen i kurven. Men lukt bestemmer ingen art her: blåkjøttbukkesopp lukter minst like ille, og blå ridderhatt har sin egen sterke, særpregede lukt (brent gummi, sanasol, tran). Sterk, rar lukt forteller deg bare at du må se på slør og sporefarge. Smaken er beskrevet som bitter, men ikke bruk den til noe: en smaksprøve kan bare dømme et funn, aldri frikjenne det — og på slørsopp skal du ikke smake i det hele tatt.',
  'inedible',
  'IKKE MATSOPP. Norges sopp- og nyttevekstforbund fører arten som «Ikke matsopp» i Normlisten 2025. Merknaden deres har to deler, og de gjør helt ulik jobb. Kjennetegnene: «Brunt stilkkjøtt; ubehagelig lukt.» Giftvurderingen: «Liten kunnskap om eventuelle toksiner i de fleste arter i slekten.» Den siste er den viktige — arten er ikke frikjent, den er uundersøkt.

Den er bitter og lukter så ille at få får den ned, og enkelte kilder melder om magetrøbbel etter måltid.

Nærmeste dobbeltgjenger er blåkjøttbukkesopp (Cortinarius camphoratus): samme slekt, samme moserike granskog, også fiolett, også vond lukt, også «Ikke matsopp» i Normlisten 2025. Del stilken på langs — brunkjøttbukkesopp har SAFRANBRUNT til gulbrunt kjøtt, blåkjøttbukkesopp har blålilla kjøtt. Det er den jobben kjøttfargetesten faktisk gjør, og det de norske navnene bygger på.

Den nytten denne soppen har i kurven din, er å lære deg å kjenne igjen en slørsopp i felt: slørrester på stilken og skiver som blir rustbrune. Den kunnskapen er nettopp det som holder deg unna de dødelige slørsoppene. Aldri smak på en slørsopp for å avgjøre art. Mild smak frikjenner ingen sopp, og de farligste slørsoppene gir ingen symptomer i det hele tatt før nyrene allerede er skadet.',
  'Ingen navngitt gift er påvist i brunkjøttbukkesopp. Det er ikke det samme som at den er trygg: Normlisten 2025 sier rett ut at det er «Liten kunnskap om eventuelle toksiner i de fleste arter i slekten». Arten er uundersøkt, ikke frikjent. Slekta Cortinarius rommer arter med orellanin — nyregiften i giftslørsopp og butt giftslørsopp — som kan gi varig nyreskade. Brunkjøttbukkesopp er ikke kjent for å inneholde orellanin, men manglende dokumentasjon er ikke dokumentasjon på at det ikke finnes noe der. Behandle enhver slørsopp som uspiselig.',
  'Enkelte kilder melder om mage- og tarmplager etter måltid — kvalme, oppkast og diaré. Bitterheten og lukten gjør uansett at de fleste spytter den ut lenge før den blir et måltid. Ved mistanke om slørsoppforgiftning generelt: symptomene fra de virkelig farlige slørsoppene kommer FORSINKET, gjerne 2–17 dager etter måltidet, og starter typisk med tørste, stor urinmengde, kvalme og smerter i korsryggen. At du har det fint dagen etter betyr derfor ingenting. Har du spist en slørsopp, kontakt Giftinformasjonen (22 59 13 00) uansett hvor bra du føler deg.',
  ARRAY['barskog','granskog','furuskog','blandingsskog','mose','gammelskog'], 'jord og mosebunn — mykorrhiza med gran og furu, helst på næringsfattig, sur mark', ARRAY['gran','furu'], 8, 10,
  ARRAY['hele Norge'], 'common', 'nsnf_normliste_2026', true
) ON CONFLICT (latin_name) DO NOTHING;

-- Blå ridderhatt advares mot Brunkjøttbukkesopp  (medium)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT 79, l.id, 'Begge er fiolette sopper på skogbunnen om høsten, og begge kan stå i moserik granskog i september og oktober. Blå ridderhatt er mest kjent fra løvfall, kompost og hagekant, men Store norske leksikon fører den også på NÅLESTRØ I BARSKOG, i gress og ofte i hekseringer, typisk senhøstes. Det er nettopp der overlappet ligger: nålestrøet under gran er samme skogbunn som brunkjøttbukkesoppen står i. Svenske soppkilder omtaler dette som den klassiske forvekslingen for blåmusseron — en kraftig, lilla sopp i mose under gran.',
  'Se på stilken FØRST. Brunkjøttbukkesopp er en slørsopp og har SLØRRESTER (cortina) — hvite tråder eller en trådete ringsone på stilken, ofte pudret rustbrunt av sporer. Blå ridderhatt har ikke slør (cortina) og aldri rustbrunt støv — unge eksemplarer kan ha fine fibriller i hattkanten, men aldri en trådete ringsone med rustbrunt støv.

Er du det minste i tvil, ta SPOREAVTRYKK. Legg hatten med skivene ned på hvitt papir en times tid, gjerne over natta. Blå ridderhatt gir HVITT TIL BLEKT ROSA sporepulver. Slørsopper gir RUSTBRUNT. Rustbrunt avtrykk avgjør saken NEDOVER: da er det en slørsopp, la den stå. Et hvitt til blekt rosa avtrykk avgjør ingenting oppover — det utelukker bare slørsopp. Flere andre fiolette skogbunnsopper har også hvitt eller rosa sporepulver, og noen av dem skal du ikke spise.

Skivene peker samme vei: brunkjøttbukkesoppens er gulbrune tidlig (hos noen med et svakt skittenfiolett skjær) og blir rustbrune når sporene modner, mens blå ridderhatt har lilla skiver som med alderen blekner mot beige eller blekt rosa — aldri rustbrunt. Deler du på langs, er blå ridderhatt blålilla til blekt lilla tvers gjennom, mens brunkjøttbukkesopp har safranbrunt stilkkjøtt.

LUKT SKILLER DEM IKKE. Begge lukter sterkt. Brunkjøttbukkesopp lukter bukk, karbid eller overmoden frukt. Blå ridderhatt har sin egen gjennomtrengende lukt, beskrevet som brent gummi, sanasol eller tran. En sterk, rar lukt er altså ikke noe svar — verken for eller imot. Ikke la den overstyre det som faktisk holder. Slørrester på stilken eller rustbrunt sporestøv: la stå.', 'medium'
FROM mushroom_species l WHERE l.latin_name = 'Cortinarius traganus'
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- ── Krittøsterssopp (Pleurocybella porrigens) — NSNF: conditionally_edible
INSERT INTO mushroom_species (
  norwegian_name, latin_name, swedish_name, english_name, family, genus,
  description, cap_description, stem_description, gills_description, smell,
  edibility, edibility_notes, toxin_info, symptoms,
  habitat, substrate, mycorrhizal_partners, season_start, season_end,
  regions, commonality, data_source, verified
) VALUES (
  'Krittøsterssopp', 'Pleurocybella porrigens', 'Öronmussling', 'Angel''s Wings', 'Marasmiaceae', 'Pleurocybella',
  'Kritthvit, vifte- eller øreformet sopp uten stilk som vokser rett ut fra morkne bartrestubber, ofte mange sammen i etasjer på samme stubbe år etter år. Tynn, myk og skjør, nesten gjennomskinnelig i kanten. Arten er KYSTBUNDET: den følger kystbeltet fra Østfold til Trøndelag, med spredte funn nordover til Bodø og Saltdal. Den går lite innover i landet og lite til værs — de aller fleste funn ligger lavt, bare noen få er gjort over 500 meter. Innenfor kystbeltet kan den komme i enorme mengder lokalt, men på landsbasis er den ikke vanlig. Norge og Sverige har konkludert ulikt om den er matsopp. Les spiselighet før du plukker.',
  '2–10 cm bred. Vifte-, tunge- eller øreformet, festet med den ene siden til veden og henger skrått ut fra underlaget. KRITTHVIT over det hele, gulner svakt til kremfarget med alderen. Tørr og matt, med innrullet, ofte bølget eller flikete kant. Kjøttet er tynt og skjørt, nesten gjennomskinnelig ytterst.',
  'Mangler stilk. Soppen sitter fast med et smalt, ofte litt lodnet festepunkt direkte på veden. Finnes det noe stilkaktig i det hele tatt, er det bare en kort tapp der skivene løper sammen.',
  'Hvite, svært tette og smale, stråler ut fra festepunktet som en vifte. Blir kremfargede med alderen. Sporepulveret er hvitt.',
  'Mild og lite karakteristisk, svakt soppaktig. Smaken er mild. Verken lukten eller smaken kan frikjenne et funn — de er milde også hos artene den forveksles med.',
  'conditionally_edible',
  'IKKE ANBEFALT. De to landene appen dekker har konkludert ULIKT om denne soppen. Du bør kjenne begge svarene før du vurderer å plukke den.

SVERIGE: Svampkonsulenternas Riksförbund regner ikke lenger öronmussling som matsopp. Den er flyttet til listen over omvurderte arter, sammen med riddarmusseron (riddermusserong). Begrunnelsen er forgiftningstilfeller. Oppslagsverket «Fungi of Temperate Europe» (2019) fører begge som giftsopper.

NORGE: Norges sopp- og nyttevekstforbund fører den i Normlisten 2025 som «Spiselig*» med merknaden «Bør unngås ved nedsatt nyrefunksjon.» Det er en klassifisering, ikke en anbefaling. Forbundet gir ingen tilberedningsråd, og vi anbefaler den ikke aktivt.

Merknaden er ikke pynt. Høsten 2004 ble om lag 59 personer i ni japanske fylker akutt hjernesyke etter å ha spist arten, og 17 døde. De aller fleste hadde kjent nyresykdom, mange gikk til dialyse, og snittalderen var omkring 70 år.

Og her ligger kjernen: KRONISK NYRESVIKT ER OFTE SYMPTOMFRI I TIDLIG FASE. «Jeg er frisk» er derfor ingen pålitelig egenvurdering — nedsatt nyrefunksjon oppdages vanligvis ved blodprøve, ikke ved at du merker det selv. Har du nyresykdom, går til dialyse, eller vet du rett og slett ikke hvordan nyrene dine står: la den stå. Server den heller ikke til eldre gjester, og aldri til noen uten å fortelle hva det er og hva merknaden går ut på.',
  'Japanske forskere har pekt ut tre stoffer som ser ut til å virke sammen: pleurocybellaziridin (en ustabil aminosyre), et lektin (PPL) og pleurocybellin. Sammen antas de å svekke blod-hjerne-barrieren slik at aminosyren slipper inn og skader nerveceller. Friske nyrer skiller trolig ut stoffene, mens de hoper seg opp ved nedsatt nyrefunksjon. Mekanismen er ikke ferdig kartlagt, og det finnes ingen kjent trygg mengde for nyresyke — derfor er merknaden en forsiktighetsregel, ikke en dosegrense. Koking eller steking fjerner ikke risikoen.',
  'Gjelder først og fremst personer med nedsatt nyrefunksjon. Blant de rammede i Japan hadde de aller fleste kjent nyre- eller leversykdom, og snittalderen var omkring 70 år. Symptomene kommer SENT — typisk fra noen dager til tre uker etter måltidet: skjelvinger, muskelrykninger, svakhet i armer og bein, utydelig tale og forvirring, og videre til kramper og nedsatt bevissthet (akutt encefalopati). Fordi det går så lang tid, blir sammenhengen med soppmåltidet lett oversett — fortell derfor alltid legen at du har spist krittøsterssopp. Ring Giftinformasjonen 22 59 13 00 ved mistanke, og 113 ved kramper eller nedsatt bevissthet.',
  ARRAY['barskog','granskog','furuskog','gammelskog','hogstflate','plantet skog'], 'morken barved — stubber, røtter og liggende stammer og greiner av gran og furu', NULL, 8, 11,
  ARRAY['Sør-Norge','Midt-Norge'], 'uncommon', 'nsnf_normliste_2026', true
) ON CONFLICT (latin_name) DO NOTHING;

-- Østerssopp advares mot Krittøsterssopp  (medium)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
SELECT 14, l.id, 'Begge er stilkløse eller nesten stilkløse vifter med skiver, som vokser rett ut fra død ved i tette etasjer, og begge kommer fra august til november. Krittøsterssopp kommer årvisst tilbake til de samme morkne stubbene, og på avstand i skogen ser en flokk av dem ut som lyse østerssopper. Blågrå østerssopp — normnavnet i Normlisten 2025, ofte bare kalt østerssopp — står der som spiselig uten merknad. Krittøsterssopp gjør ikke det: den bærer merknaden «bør unngås ved nedsatt nyrefunksjon», og i Sverige er den strøket som matsopp. Blander du dem, bytter du en sopp uten merknad mot en med.',
  'Se på VEDEN først: krittøsterssopp vokser på BARVED — morkne stubber og røtter av gran og furu. Blågrå østerssopp står så godt som alltid på LØVVED: osp, bjørk, bøk og selje.

Men substratet alene er IKKE nok, for det finnes en tredje art. Bjørkeøsterssopp (Pleurotus pulmonarius) er blek til nesten hvit, står på Normlisten som spiselig, og selv om den stort sett tar løvved, forekommer den også på bartrevirke. Regelen «hvit sopp på granstubbe, altså bjørkeøsterssopp» er derfor ikke vanntett — og den feilen går den farlige veien.

Kjenn derfor på KJØTTET. Det er det sikreste skillet i felt: krittøsterssopp er TYNN, MYK OG SKJØR, nesten gjennomskinnelig i kanten, og har ingen egentlig stilk — bare et smalt festepunkt mot veden. Begge Pleurotus-artene er tykkere og fastere, med en kort, kraftig stilkstump i siden.

Se så på FARGEN, og særlig på SKIVENE: krittøsterssopp er KRITTHVIT OVER DET HELE, også skivene, og gulner bare svakt med alderen. Blågrå østerssopp har grå, gråbrun, blågrå eller beige hatt. Bjørkeøsterssopp er blekere enn den, men har en mer KREMGUL tone i hatt og skiver — ikke den kritthvite.

Ikke bruk smaken eller lukten til å frikjenne. Krittøsterssopp er mild og lite karakteristisk, akkurat som østerssoppene. Skarp eller bitter smak dømmer et funn ute, men MILD SMAK AVGJØR INGENTING — det er nettopp den milde soppen som bærer nyre-merknaden.

Har du nyresykdom, går til dialyse, eller er usikker på nyrefunksjonen din: la den kritthvite stå. Ved tvil — la stå.', 'medium'
FROM mushroom_species l WHERE l.latin_name = 'Pleurocybella porrigens'
ON CONFLICT (species_id, look_alike_id) DO NOTHING;