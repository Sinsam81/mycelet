-- FORVEKSLINGSDATA FOR 14 MATSOPPER SOM STO UTEN (2026-08-04)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HVORFOR DETTE ER VIKTIGERE ENN SPISELIGHETSKLASSENE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migrasjon 047 kontrollerte hele artslisten mot NSNFs normliste og rettet fire
-- arter. Men den viktigste innsikten fra den runden var denne:
--
--   INGEN BLIR FORGIFTET FORDI EN DATABASE HAR FEIL KATEGORI.
--   FOLK BLIR FORGIFTET FORDI DE TOK FEIL SOPP.
--
-- Spiselighetsmerket svarer på «er kantarell spiselig?», der svaret er trygt ja.
-- Det farlige øyeblikket er «ER DETTE kantarell?» — og det spørsmålet svarer bare
-- forvekslingsdataene på. 24 av 48 matsopper hadde ingen forvekslingsrad i det
-- hele tatt.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- METODE — OG HVORFOR MOTPRØVEN VAR NØDVENDIG
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Her finnes det TO måter å ta feil på, og begge er farlige:
--   1. Å utelate en ekte forveksling  -> brukeren får ingen advarsel.
--   2. Å DIKTE OPP en forveksling eller et kjennetegn -> brukeren lærer et falskt
--      skille og stoler på det i felt. Det er verre enn tom rubrikk.
--
-- Derfor gikk hvert foreslåtte par gjennom en skeptiker som skulle rive det ned,
-- med særlig vekt på om kjennetegnene var KORREKT ATTRIBUERT.
--
-- Resultatet forsvarer arbeidet: av 35 foreslåtte par ble **17 forkastet** og
-- **14 av de 18 godkjente ble omskrevet**. Blant det som ble stoppet:
--
--   «Ingen andre risker har oransje melkesaft»
--       -> direkte galt, og appens EGEN katalog motbeviser det (furumatriske).
--   Nøttekremle forvekslet med grønn fluesopp
--       -> kilden som ble oppgitt handlet om GRØNNKREMLE, ikke nøttekremle.
--   «Storkremle gråner ikke»
--       -> standardbeskrivelsen sier at kjøttet blir gråaktig med alderen.
--
-- Uten motprøven ville alle tre stått i appen som feltråd.
--
-- ⚠️ DET SOM IKKE BLE LØST HER: de farligste forvekslingene for gråmusserong,
-- østerssopp, blå ridderhatt, sotvokssopp og matriskene finnes IKKE i katalogen
-- i det hele tatt. Forvekslingshullet er delvis et KATALOGHULL. Se migrasjon 049.
--
-- Tre arter fikk bevisst ingen rad: frostvokssopp, blomkålsopp og judasøre har
-- ingen dokumentert forveksling verdt å vise. Tomt er riktigere enn oppspinn —
-- og appen sier allerede eksplisitt at fravær av advarsel ikke betyr trygghet.

-- Broket kremle -> Grønn fluesopp  (critical)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (38, 52,
  'Broket kremle har ofte grønne og olivenfargede former, og den vokser under eik og bøk i Sør-Norge og Sør-Sverige – nøyaktig der grønn fluesopp står, fra august til oktober. Begge har hvite skiver og hvit stilk, og unge eksemplarer av begge er runde og uanselige. Svampguiden advarer uerfarne plukkere mot akkurat denne forvekslingen, og SNL nevner det samme for grønnkremle.',
  'Grav opp HELE stilken. Grønn fluesopp har RING på stilken og et SLIREBEGER (pose) nederst, ofte skjult i jorda – kremler har verken ring eller pose. Kremlestilken knekker tvert som kritt; fluesoppstilken er seig og lar seg rive opp i tråder. IKKE stol på farge: grønn fluesopp kan være blekgul, gulgrønn, grågrønn eller BRUNGRØNN, med innvokste mørkere fibrer og glatt, urillet hattkant. Broket kremle kjennes i tillegg på MYKE, BØYELIGE skiver som føles fettede og ikke smuldrer når du drar fingeren over dem. Ved tvil — la stå.',
  'critical')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Furumatriske -> Pluggsopp  (high)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (33, 18,
  'Begge er oransjebrune og traktformede med skiver som løper ned på stilken, og begge finnes i furuskog og skogkant fra august til oktober. Pluggsopp står gjerne langs skogsbilveier og på tråkket mark der du også leter etter matriske. Den forveksles ofte med risker av nybegynnere.',
  'Bryt hatten. Furumatriske gir GULROTORANSJE MELKESAFT som holder seg oransjerød, og kjøttet er sprøtt og knekker som kritt. Pluggsopp gir INGEN melkesaft, har seigt kjøtt, innrullet lodden hattkant, og skivene får BRUNE FLEKKER ved trykk — matriskens skiver flekker seg grønt, aldri brunt. Pluggsopp inneholder et stoff som får KROPPEN til å danne antistoffer mot egne røde blodlegemer — gjentatte måltider kan utløse at blodlegemene brytes ned, og dette har tatt liv. Ved tvil — la stå.',
  'high')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Granmatriske -> Pluggsopp  (high)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (32, 18,
  'Begge er oransjebrune og traktformede med skiver som løper ned på stilken, og begge står i granskog fra august til oktober. Pluggsopp vokser gjerne langs skogsbilveier og på tråkket mark — akkurat der du leter etter matriske. Dette er den vanligste nybegynnerfeilen blant dem som plukker risker.',
  'Bryt hatten. Granmatriske gir GULROTORANSJE MELKESAFT som blir vinrød i løpet av 10-30 minutter, og kjøttet er sprøtt og knekker som kritt. Pluggsopp gir INGEN melkesaft, har seigt kjøtt, innrullet lodden hattkant, og skivene får BRUNE FLEKKER der du tar på dem — matriskens skiver flekker seg grønt eller vinrødt, aldri brunt. Pluggsopp inneholder et stoff som får KROPPEN til å danne antistoffer mot egne røde blodlegemer — gjentatte måltider kan utløse at blodlegemene brytes ned, og dette har tatt liv. Ved tvil — la stå.',
  'high')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Gulrød kremle -> Rød fluesopp  (high)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (70, 15,
  'Gulrød kremle har teglrød til oransjerød hatt og står i lav- og moserik furuskog fra august til oktober. Rød fluesopp står i den samme furu- og bjørkeskogen i de samme månedene. Når regnet har vasket bort de hvite hudlappene, er rød fluesopp bare en oransjerød hatt med hvite skiver — og da er fargen ikke noe skille.',
  'Grav opp HELE stilken. Rød fluesopp har KNOLL med hudrester nederst og oftest ring på stilken; gulrød kremle har glatt stilk uten begge deler. Skjær så i kjøttet: gulrød kremle GRÅNER — hvitt kjøtt blir grått til nesten svart, og gamle eksemplarer har grå stilk og grå skiver. Rød fluesopp gråner ikke, og kjøttet er gult rett under hatthuden. Kremlestilken knekker som kritt, fluesoppstilken er seig. Ved tvil — la stå.',
  'high')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Hulriske -> Pluggsopp  (high)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (83, 18,
  'Begge er brunlige sopper med litt traktformet hatt og skiver som løper nedover stilken, og begge står i fuktig gran- og bjørkeskog fra august til oktober. Pluggsopp er ekstra vanlig der det finnes bjørk — nøyaktig der hulriska trives. Norske kilder peker på dette som en klassisk nybegynnerfeil: mange forveksler pluggsopp med risker. Pluggsopp gir magetrøbbel, og gjentatte måltider kan utløse en reaksjon der røde blodceller brytes ned — den kan bli livstruende.',
  'Skjær i kjøttet eller brekk av en skive: hulriske gir MELKESAFT — hvit melk som pipler ut med en gang (den kan gråne eller bli grønnlig etter noen minutter, men den ER der). Pluggsopp har ALDRI melkesaft, og skivene blir BRUNFLEKKETE der du trykker på dem — de lar seg dessuten skrape løs fra hatten som en matte. Hulriska har sprøtt kjøtt, klissen grålilla til gulgrå hatt og HUL stilk. Merk at innrullet hattkant IKKE skiller dem: unge risker har det også. Ingen melk og brune trykkflekker: la den stå.',
  'high')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Nøttekremle -> Giftkremle  (medium)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (39, 61,
  'Nøttekremle har kjøttrød til vinrød hatt, og giftkremle er den skarpe, klart røde kremla som står i fuktig barskog og torvmose i samme sesong. Rødlige kremler er nettopp den gruppa smaksregelen er laget for.',
  'Giftkremle står i FUKTIG BARSKOG og torvmose; nøttekremle i løvskog under eik, bøk og bjørk. Giftkremle har KLAR BLODRØD, klebrig hatt der hattehuden dras lett av nesten inn til midten, snøhvit stilk og BRENNENDE SKARP smak. Nøttekremle har mattere kjøttrød til teglbrun hatt der HATTEHUDEN IKKE NÅR HELT UT TIL KANTEN, så en smal naken rand synes, fast hvitt kjøtt og skiver som gjerne blir rustflekket med alderen, og mild nøttesmak. Smaksprøven gjelder BARE når du er sikker på at du har en kremle (sprøtt kjøtt som knekker uten trevler, ingen ring, ingen pose, ingen melkesaft): tygg en liten bit og spytt ut. Skarp = la den stå.',
  'medium')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Sildekremle -> Giftkremle  (medium)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (67, 61,
  'To kremler med rød hatt og hvite skiver i samme barskog, samme uker. Sildekremle står under gran og furu fra august til oktober; giftkremle står i fuktig barskog i samme periode, gjerne i hvitmose og søkk. Regn vasker fargen ut av begge, så hattefargen alene skiller dem ikke. Giftinformasjonen sier selv at rødkremle kan forveksles med andre røde kremler.',
  'Bruk smakstesten — den gjelder BARE kremler, og bare når du er sikker på at det ER en kremle (sprøtt kjøtt, ingen ring, ingen knoll). Ta en liten bit av hatten, tygg noen sekunder og SPYTT UT. Sildekremle er MILD. Giftkremle er BRENNENDE SKARP, som chili. To ting til: sildekremle LUKTER SILD/SKALLDYR (sterkere når den varmes), og stilken gulner og blir brunflekket der du tar på den. Giftkremla lukter fruktig og holder stilken rein hvit. Smaker den skarpt — la stå.',
  'medium')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Blek kantarell -> Falsk kantarell  (low)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (86, 22,
  'Falsk kantarell er den vanligste forvekslingsarten til alle kantareller. Den har samme trakt- og vifteform, står i samme skog fra sensommer til høst, og dukker opp i akkurat de kurvene der folk plukker fort. Den er ikke giftig, men regnes ikke som matsopp.',
  'Snu soppen og prøv med neglen. Blek kantarell har RIBBER — butte, gaffeldelte årer som ikke lar seg skrape bort uten at du skader selve soppen. Falsk kantarell har ekte SKIVER som er tynne, tette og LETT LAR SEG SKRAPE AV. Skjær den så i to: falsk kantarell er JEVNT ORANSJE tvers gjennom kjøttet, mens kantarellkjøttet er blekere enn utsiden. Falsk kantarell er dessuten tynn og myk å kjenne på og mangler den fruktige aprikoslukten. I Norden finnes det ingen DØDELIG giftsopp som ligner kantarell, men falsk kantarell hører hjemme i skogen, ikke i pannen — den gir magetrøbbel hos enkelte.',
  'low')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Blek kantarell -> Kantarell  (low)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (86, 1,
  'Blek kantarell ligner vanlig kantarell så mye at den lenge ble regnet som bare en blek form av den. Begge har gaffeldelte ribber som løper ned på stilken og samme fruktige aprikoslukt, og de kan stå i samme skog i samme uke.',
  'Blek kantarell er kraftigere og buttere, og hatten er BLEKGUL TIL NESTEN HVIT — den står i tydelig kontrast til de eggegule ribbene under. Det hvitlige er et fint, melaktig BELEGG som kan gnis vekk med fingeren, slik at det gule kommer fram under. Hattkanten holder seg innrullet også på eldre sopp. Vanlig kantarell er jevnt eggegul over hele soppen. Begge er førsteklasses matsopper, så denne forvekslingen koster deg ingenting annet enn navnet i notatboka.',
  'low')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Blek kantarell -> Piggsopp  (low)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (86, 7,
  'Blek piggsopp er like blek, like kjøttfull og like uregelmessig trakt-/vifteformet, og står i samme skog i samme periode. Ovenfra, halvveis dekket av strø, ser de nesten like ut — begge er blant de første artene nybegynnere lærer, nettopp fordi de er trygge.',
  'Snu soppen — det er hele svaret. Blek kantarell har RIBBER: butte, gaffeldelte årer som løper nedover stilken. Piggsopp har PIGGER: myke, lyse tagger tett i tett, som en børste. Begge er gode matsopper, så du kan ta med begge — bare vit hva du har, for de skal ha ulik steketid.',
  'low')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Fåresopp -> Franskbrødsopp  (low)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (26, 84,
  'Begge er faste, kjøttfulle kjuker som vokser rett på bakken i moserik granskog fra august til oktober, og begge har PORER i stedet for skiver under hatten. De er nært beslektet, står i samme skogtype og vokser gjerne i sammenvokste klynger.',
  'SKRAP PÅ PORELAGET under hatten: hos fåresopp blir det tydelig GULGRØNT (og hele soppen gulner når du steker den), hos franskbrødsopp blir det på sin høyde svakt gulaktig — aldri grønnskjær. Fåresopp er hvit til blek gråbrun; franskbrødsopp er kremgul til lakserosa og vokser oftere i tett sammenvokste klynger. Begge er spiselige, så en bytte her er ufarlig — franskbrødsopp blir bare besk når den blir gammel.',
  'low')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Lerkesopp -> Smørsopp  (low)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (66, 8,
  'Dette er de to vanlige rørsoppene i Norden som har RING på stilken, og de kommer i samme periode fra juli og utover høsten. Begge har slimete hatt i fuktig vær og gult rørlag. Norske kilder (SNL, Soppdilla) nevner smørsopp som lerkesoppens forvekslingsart.',
  'Se på TREET du står under: lerkesopp vokser så godt som bare under LERK, smørsopp under FURU. Lerkesopp har gyllengul til rødbrun, slimet hatt, en tynn hvitgul ringsone, og gult rørlag som får BRUNE flekker ved trykk. Smørsopp har mørk kastanjebrun, klissete hatt, smørgult rørlag og en tykk, varig ring som ofte er FIOLETTBRUN på undersiden. Begge er spiselige, så en forveksling koster deg ingenting. Dra av den slimete hattehuden på begge før steking.',
  'low')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Rødgul piggsopp -> Piggsopp  (low)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (36, 7,
  'Nære slektninger i den samme mosekledde gran- og bjørkeskogen, fra sensommer til november. Begge har lyse, sprø pigger under hatten i stedet for skiver, og de står ofte i samme rekke.',
  'Se hvor piggene slutter. Rødgul piggsopp er mindre, gyllen til rødoransje, og har pigger BARE UNDER HATTEN. Piggsopp (blek piggsopp) er større, kremhvit, og piggene LØPER NEDOVER STILKEN. Begge er blant våre sikreste matsopper — sopp med LYSE, sprø pigger under hatten har ingen giftige dobbeltgjengere her. Forbeholdet gjelder de lyse: sopp med mørkbrune eller svarte pigger er andre slekter, og flere av dem er uspiselige.',
  'low')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Sandsopp -> Seig kusopp  (low)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (35, 9,
  'Begge er gulbrune kusopper under furu, ofte i samme mose langs stien fra juli til oktober. På avstand ser de nesten like ut, og de vokser gjerne om hverandre i samme flekk.',
  'Snu hatten og se på rørmunningene. Sandsopp har VELDIG SMÅ, TETTE munninger som virker nesten fløyelsaktige og olivenbrune, og kjøttet BLÅNER når du skjærer i det. Seig kusopp har STORE, KANTETE munninger du ser tydelig med øyet, og kjøttet blir svakt rosa. Sandsopp brekker lett i to; seig kusopp er så seig at hatten kan bøyes mot stilken uten å knekke. Begge er spiselige — dette er kvalitetsforskjell, ikke fare.',
  'low')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Sandsopp -> Smørsopp  (low)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (35, 8,
  'Begge er kusopper i furuskog i samme periode, med gulbrun hatt og gult rørlag. Mange kaller alt sammen bare «kusopp».',
  'Kjenn på hatten. Smørsopp er STERKT KLEBRIG/SLIMET og har en RING på stilken etter dekkhinnen (hos gamle eksemplarer kan ringen være redusert til en mørk sone). Sandsopp er TØRR og RU — hatten ser ut som den er strødd med sandkorn — og har ALDRI ring. Begge er matsopp; smørsopp bør flås, ellers gir slimhinnen mange løs mage.',
  'low')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Sotvokssopp -> Gråmusserong  (low)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (85, 72,
  'Begge har mørk gråbrun til nesten svart hatt med radiære «blyantstreker», lyse skiver og lys stilk, og begge står i moserik barskog med gran i september og oktober. Ovenfra er de lette å blande. Skillet er verdt å lære, for i den samme skogen står det flere grå musseronger som ikke er matsopp.',
  'Se og kjenn på skivene. Sotvokssopp har TYKKE, VOKSAKTIGE, GLISNE skiver som løper NEDOVER stilken — de kjennes nesten fete mellom fingrene. Gråmusserong har tettere skiver som er utrandet (de bukter seg inn mot stilken i stedet for å løpe ned), de er ikke voksaktige, og både skiver og stilk har et gulskjær. Skraper du nederst på stilken til sotvokssopp, lukter det ofte søtt av honning. Får du ikke skiveskillet til å stemme, står du med en ubestemt grå barskogssopp — la den stå.',
  'low')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Svartbrun rørsopp -> Galleboletus  (low)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (65, 25,
  'Begge er brune rørsopper i barskog, vanligst under furu, fra sensommer til høst. Galleboletus er ikke giftig, men så bitter at én hatt ødelegger hele gryta – og den er den klassiske skuffelsen for nybegynnere som plukker brune rørsopper.',
  'Se på STILKEN: galleboletus har grovt, MØRKT ÅRENETT, mens svartbrun rørsopp har glatt stilk med fine lengdestriper og ALDRI nett. Rørlaget: svartbrun rørsopp har gult til grønngult rørlag som blir BLÅGRØNT der du trykker – galleboletus blåner aldri, men får brunrosa flekker. Vær klar over at galleboletus har HVITT rørlag når den er ung og først blir rosa med alderen, så fargen alene lurer deg; nettet og smaken er sikrest. Smak en liten flis av kjøttet og spytt ut – bittert = la den stå.',
  'low')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;

-- Svartbrun rørsopp -> Steinsopp  (low)
INSERT INTO look_alikes (species_id, look_alike_id, similarity_description, difference_description, danger_level)
VALUES (65, 2,
  'Begge er kraftige, brune rørsopper i barskog i samme periode, og svartbrun rørsopp regnes som nesten like god matsopp. Mange plukker den i den tro at de har funnet steinsopp.',
  'Trykk hardt på RØRLAGET med tommelen. Steinsopp får ALDRI blå flekker, verken i rørlaget eller i snittflaten; svartbrun rørsopp blir raskt BLÅGRØNN der du trykker, og kjøttet blåner svakt i snittet. Fargen på rørlaget alene holder ikke – unge eksemplarer av begge har blekt rørlag. Steinsopp har lyst årenett øverst på stilken, svartbrun rørsopp har ingen nett, bare fine lengdestriper. Ingen fare: begge er gode matsopper.',
  'low')
ON CONFLICT (species_id, look_alike_id) DO NOTHING;