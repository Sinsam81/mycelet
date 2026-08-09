---
slug: derfor-aldri-spiselig
kicker: Om appen · 9 min
summary: Et bilde kan foreslå en art. Det kan ikke avgjøre om noe er trygt å spise — her er grunnen, og hva appen gjør i stedet.
---

# Derfor sier Mycelet aldri at en sopp er spiselig

Fordi et bilde ikke kan bære den dommen. En bildemodell kan si hva soppen din **ligner på**. Den kan ikke si hva den **er**, og selv om den treffer arten, er «riktig art» og «trygt å spise» to forskjellige påstander. Vi har derfor bygget appen slik at den svarer på det første og aldri later som den svarer på det andre.

*Denne artikkelen handler om hva en app kan og ikke kan avgjøre. Den er ikke en innføring i artsbestemmelse — se [De fem forvekslingene nybegynnere gjør](/sanketips/fem-forvekslinger) for det.*

## To spørsmål som ser ut som ett

Når du holder en sopp i hånda og løfter telefonen, føles det som om du stiller ett spørsmål. Du stiller egentlig to.

Det første er **artsbestemmelse**: hvilken art er dette? Det andre er en **spiselighetsdom**: kan jeg spise akkurat denne, tilberedt på den måten jeg har tenkt?

De henger sammen, men de har helt ulik feilkostnad. Bommer du på det første og appen sier «kremle» der det står en annen kremle, har du fortsatt ikke fått vite om du kan spise den — flere kremler gir kraftige mageplager, blant dem rødkremle (*Russula emetica*), som [Giftinformasjonen fører som giftig og vanlig i hele landet](https://www.helsenorge.no/giftinformasjon/sopp/roedkremle-er-en-giftig-sopp/). Men den feilen er i seg selv reparerbar: du kan sjekke videre. Bommer du på det andre, kan det koste en lever eller to nyrer.

Det er verdt å si det rett ut, slik det står i en av migrasjonene i vår egen kodebase: ingen blir forgiftet fordi en database har feil kategori. Folk blir forgiftet fordi de tok feil sopp. Et spiselighetsmerke i en artsdatabase svarer på et generelt spørsmål om en art. Det farlige øyeblikket handler om noe helt annet: «**er dette** kantarell?» — og det svarer merket ikke på i det hele tatt.

## Det avgjørende er som regel det du ikke ser ovenfra

De fleste soppbilder tas ovenfra. Det er den naturlige vinkelen når soppen står i mosen og du står oppreist. Det er også den vinkelen som utelater nesten alt som betyr noe.

Her er noe av det som avgjør, og som et hattbilde ikke inneholder:

- **Undersiden.** Skiver, rør, pigger, ribber eller porer. Dette er grovsorteringen som plasserer funnet i riktig hovedgruppe, og den er usynlig ovenfra. Men ingen hovedgruppe er trygg i seg selv: rødskrubb er en rørsopp og gir like fullt mageforgiftninger, og sandmorkel har verken skiver eller rør — Giftinformasjonen skriver at [både forvellet, varmebehandlet og tørket sandmorkel kan gi forgiftning](https://www.helsenorge.no/giftinformasjon/sopp/sandmorkel/). Grovsorteringen betyr bare at du ikke engang har begynt før du har sett undersiden.

  Den klassiske dødelige forvekslingen i Norge går på nettopp dette punktet. Unge eksemplarer av hvit fluesopp (*Amanita virosa*) kan ligne sjampinjong, og [Giftinformasjonen skriver at skivene hos hvit fluesopp alltid er hvite](https://www.helsenorge.no/giftinformasjon/sopp/hvit-fluesopp-er-en-svart-giftig-sopp/); sjampinjongene får [tidlig rosa skiver som til slutt blir svartbrune av sporene](https://snl.no/sjampinjong). Merk retningen: hvite skiver dømmer funnet *ut* som sjampinjong. Mørke skiver frikjenner ingenting — det finnes også sjampinjonger som ikke skal spises, som giftsjampinjong (*Agaricus xanthodermus*).

- **Foten, hele veien ned i bakken.** Slirebeger og knoll sitter ved basis, ofte skjult i jorda; ringen sitter høyere oppe på stilken. Grønn fluesopp (*Amanita phalloides*) har både ring og et poseformet slirebeger — og du får ikke se slira uten å ta hele soppen opp. Kutter du stilken med kniv, kutter du bort beviset. Motsatt vei holder det ikke: spiss giftslørsopp har verken ring eller slire, og er blant de farligste artene vi har.

- **Snittfargen.** Hva skjer i kjøttet når du deler soppen? Falsk kantarell (*Hygrophoropsis aurantiaca*) er jevnt oransje tvers gjennom; kantarell er hvit til kremhvit inni. Merk retningen her også: gjennomgående oransje kjøtt taler *mot* kantarell, men lyst kjøtt gjør ingen sopp til kantarell — det utelukker bare én mulighet av mange. En ung fluesopp som ligner en røyksopp avslører anlegg til hatt og skiver når du deler den på langs. Ser du det, er funnet ute. Ser du det ikke, har du utelukket én ting, ikke bekreftet noen.

- **Melkesaft og fargeendring.** Risker gir melkesaft med en bestemt farge, som ofte endrer seg over minutter. Blåner soppen i snittet? Flekker skivene seg brunt eller grønt ved trykk?

- **Lukt.** Reddik, mel, anis, klor, blekk. Enkelte skiller går praktisk talt bare på lukt.

- **Sporeavtrykk.** Fargen på sporene, tatt ved å legge hatten på papir over natta.

- **Underlaget og vertstreet.** Står den på jord, på ved, på kongle? Under bjørk, gran, eik?

Den forvekslingen som virkelig betyr noe i kantarellfamilien, er for øvrig ikke falsk kantarell. Det er traktkantarell (*Craterellus tubaeformis*) mot spiss giftslørsopp (*Cortinarius rubellus*). Giftinformasjonen har [en egen side om paret](https://www.helsenorge.no/giftinformasjon/sopp/traktkantarell-og-spiss-giftslorsopp/) og skriver at de «vokser ofte side om side». Skillene ligger nettopp der et hattbilde ikke når: traktkantarell har hul stilk og ribber under hatten som ikke lar seg fjerne, mens spiss giftslørsopp har stilk som ikke er hul, med okergule slørbelter i sikksakkmønster, og oransje til rustbrune skiver som kan løsne fra hatten. Ved tvil — la den stå.

Alle kjennetegnene over har samme egenskap: de kan felle et funn. Ingen av dem kan frikjenne det. Slår ett av dem ut, la soppen stå — og er du i tvil, la den stå uansett.

En bildemodell får ingen av disse. Den får piksler. Den kan i beste fall lære seg korrelasjoner mellom hvordan noe ser ut på overflaten og hva det pleier å være — og det er en reell ferdighet, men den er ikke det samme som å undersøke en sopp.

## En modell svarer på hva bildet ligner på

Det er en teknisk grunn til at prosenttallet i en soppapp ikke betyr det folk tror.

En bildeklassifiserer velger mellom de klassene den er trent på. Den fordeler sannsynlighet mellom dem, og summen blir hundre. Det finnes ingen kategori som heter «dette er en art jeg ikke kjenner». Får den et bilde av noe utenfor katalogen, fordeler den likevel hele sannsynligheten på artene den kjenner — og en av dem kommer ut på topp, med et tall som ser like selvsikkert ut som ellers.

Skalaen på problemet er verdt å ta inn. Artsdatabanken oppgir at det [globalt er kjent om lag 150 000 arter av sopp, og fra Norge over 9 000](https://artsdatabanken.no/arter/takson/975). Ingen bildemodell dekker den listen. Vår egen artskatalog er på rundt 80 arter — den er kuratert for de soppene folk faktisk leter etter og de som er farlige å forveksle med dem, ikke for å være komplett.

Derfor kaller vi tallet i resultatet **bildelikhet**, ikke treffsikkerhet og ikke sikkerhet. «84 % bildelikhet» betyr at modellen synes bildet ditt ligner mest på den arten. Det er ikke en påstand om at det er 84 prosent sjanse for at du har den arten i hånda, og det er ingen påstand i det hele tatt om hvorvidt du kan spise den.

## Hva målingene faktisk viser

Det finnes forbausende lite publisert forskning på hvor godt soppapper treffer. Den grundigste vi har funnet, er en studie i *Clinical Toxicology* fra 2023, der tre forskere uavhengig testet tre bildegjenkjenningsapper på fotografier av 78 soppeksemplarer som var sendt inn til giftinformasjonen og den botaniske hagen i delstaten Victoria i Australia i løpet av 2020–2021, med artsbestemmelsen bekreftet av en ekspertmykolog ([Hodgson m.fl. 2023](https://pubmed.ncbi.nlm.nih.gov/36794335/)). Utvalget er altså ikke en kartlegging av skogen, men sopp noen allerede hadde grunn til å lure på.

Den beste appen bestemte 49 prosent av eksemplarene riktig. De to andre lå på 35 prosent hver. For de giftige soppene lå den beste på 44 prosent.

På grønn fluesopp spesifikt — arten som er involvert i de fleste dødelige soppforgiftningene i verden — spente treffene fra 27 til 67 prosent. Og her snudde rangeringen: appen som var best totalt, var ikke den som traff best på grønn fluesopp. To av appene bommet dessuten på arten, i til sammen tre tilfeller.

Forfatternes konklusjon, ordrett: apper for soppidentifikasjon kan bli nyttige verktøy i framtida, men er per i dag «not reliable enough to exclude exposure to potentially poisonous mushrooms when used alone».

To forbehold som er viktige:

- **Konfidensintervallene er svært vide.** For den beste appen oppgis intervallet som 0–100 prosent. Tallene skal leses som størrelsesorden, ikke som en presis karakter. Det er 78 eksemplarer, ikke tusenvis.
- **Materialet er australsk.** Artsutvalget der er ikke vårt. Hvordan appene er trent, vet vi ikke — studien sier ingenting om treningsdataene, og vi har ikke funnet noen kilde som gjør det. Tallene kan derfor ikke overføres rått til norsk skog, verken opp eller ned.

Så: dette er ikke bevis for at enhver soppapp tar feil halvparten av gangene i Norge. Det er godt nok belegg for at et bilde alene ikke er et forsvarlig grunnlag for å utelukke at du har en giftig sopp. Og det er den påstanden som betyr noe her.

## Selv riktig art er ikke det samme som trygt

Anta at bildemodellen treffer perfekt. Arten er riktig. Da gjenstår fortsatt fire ting som en app ikke kan se.

**Tilberedningen.** Rødskrubb (*Leccinum versipelle*) regnes som matsopp, men Giftinformasjonen skriver at den [må varmebehandles på middels til høy varme i minst 15 minutter](https://www.helsenorge.no/giftinformasjon/sopp/rodskrubb-kan-vare-en-giftig-sopp/), og at den «trolig er den soppen som forårsaker flest tilfeller med magesymptomer i Norge». Symptomene kommer 30 minutter til tre timer etter måltidet. Riktig art, feil panne.

**Hva du drikker til.** Grå blekksopp (*Coprinopsis atramentaria*) inneholder coprin, som virker som antabus i kroppen. Giftinformasjonen [regner den ikke som matsopp](https://www.helsenorge.no/Giftinformasjon/Sopp/Gra-blekksopp) nettopp derfor, og skriver at reaksjonen kan utløses av alkohol fra ett døgn før til en uke etter måltidet. Den viser hvor lite «spiselig» er en egenskap ved arten alene.

**Tilstanden og alderen.** Gamle, bløte, marketne fruktlegemer gir mageplager uansett hvor spiselig arten er. Sopp som har frosset og tint flere ganger, brytes ned og får bakterievekst. Dette er en forgiftningsvei som ikke handler om artsbestemmelse i det hele tatt — og et bilde av en fersk hatt ovenfra viser sjelden at undersiden er begynt å gå i oppløsning.

**Hvor den vokste.** Sopp har «en helt spesiell egenskap til å ta opp» radioaktivt cesium fra jorda, skriver Strålevernet i [en gjennomgang fra 2013](https://www.dsa.no/publikasjoner/straleverninfo-12-2013-radioaktivitet-i-sopp/StralevernInfo_11-2013.pdf). Nivåene holder seg høye tiår etter Tsjernobyl, ulike arter tar opp svært ulike mengder, og de høyeste verdiene kom fra steder i Nord-Trøndelag, Oppland og Hedmark. Notatet peker også på at nedgangen uteblir der den kom andre steder: «I motsetning til radioaktivitetsnivåene i planter, er det liten nedgang i sopp de siste 10-15 årene.» De nasjonale grenseverdiene for cesium-137 ble opphevet 1. januar 2025, men [DSA og Mattilsynet anbefaler fortsatt at man ikke får i seg mer enn 80 000 becquerel i året](https://www.dsa.no/radioaktivitet-i-mat-og-miljo/radioaktivitet-i-mat-og-drikke) — et råd som ifølge DSA «gjelder både barn og voksne inkludert gravide». Dette er en doseproblemstilling over tid, ikke en akutt fare — men det er nok et eksempel på at spørsmålet «kan jeg spise denne?» har med sted å gjøre, og et bilde vet ikke hvor det ble tatt.

Legg til individuell toleranse, som varierer mellom folk og ikke lar seg lese av noe fotografi, og bildet er komplett: **spiselighet er ikke en egenskap ved et bilde.**

## Hva Mycelet gjør i stedet

Vi har ikke løst dette. Vi har prøvd å bygge appen slik at den ikke lyver om det.

**Du får inntil tre forslag, ikke ett svar.** Hvert med bildelikhet oppgitt. Ett tall på ett navn ville skjult at modellen var i tvil.

**Advarsler og invitasjoner behandles ulikt, med vilje.** Et forslag som er merket giftig, dødelig, uspiselig eller ukjent beholder merket sitt. De to spiselige klassene mister stempelet i AI-resultatet og får i stedet en nøytral merking: «Ikke matvurdert». Asymmetrien er poenget. En advarsel er nyttig selv når artsbestemmelsen er feil — får du vite at noe i dette landskapet av forslag er dødelig, skjerper du deg, og det er riktig respons uansett. Et grønt «spiselig» er derimot skadelig nettopp når artsbestemmelsen er feil. Det er da folk blir forgiftet.

**Rangeringen kan aldri begrave et farlig forslag.** Vi justerer rekkefølgen etter sesong og funn i nærheten — en kantarellgjetning i desember synker. Men et giftig eller dødelig forslag kan bare løftes av den justeringen, aldri senkes, og det havner aldri lenger ned enn der bildemodellen selv plasserte det.

**Farlige forvekslingsarter vises i selve resultatet**, ikke gjemt på en artsside. Vi henter dem vi har klassifisert som høy eller kritisk fare, med hvorfor de forveksles og hvordan du skiller dem. Men et tomt felt betyr ikke at det er trygt: dekningen er ufullstendig, og fravær av advarsel skal aldri kunne leses som en trygghetserklæring.

**Og vi skiller tre tilstander, ikke to.** «Her er forvekslingsartene», «vi har ikke ført inn forvekslingsarter for denne arten ennå», og «vi klarte ikke å hente sikkerhetsdataene akkurat nå». Dette høres pedantisk ut. Det er den viktigste distinksjonen i hele kodebasen. Da vi gikk gjennom katalogen i august 2026, hadde 24 av 48 matsopper ingen forvekslingsrad i det hele tatt — og et helt rent resultat så nøyaktig likt ut enten vi hadde sjekket og funnet ingenting, eller aldri hadde sjekket. Det er derfor de tre tilstandene nå står hver for seg.

Det arbeidet lærte oss noe om kilder også. Av 35 foreslåtte forvekslingspar gikk vi gjennom hvert enkelt med en skeptiker som skulle rive det ned. **17 ble forkastet**, og 14 av de 18 godkjente ble skrevet om. Blant det som ble stoppet: påstanden «ingen andre risker har oransje melkesaft», som vår egen katalog motbeviser, og en advarsel der kilden viste seg å handle om en annen kremleart enn den vi holdt på med. Uten motprøven ville alle stått i appen som feltråd. Tre arter fikk bevisst ingen rad, fordi vi ikke fant en dokumentert forveksling verdt å vise — tomt er riktigere enn oppspinn.

To regler kom ut av det, og de gjelder alt sikkerhetsinnhold vi skriver:

1. **En felttest kan dømme et funn ute. Den kan aldri frikjenne det.**
2. **En alvorlig advarsel må ende i noe brukeren kan gjøre.**

Den andre ble gjort om til en test som kjører mot innholdet. Den fant med én gang at 17 av 22 kritiske og høye advarsler som allerede sto i produksjon manglet handlingsråd. Tekstene beskrev faren presist. De sa bare aldri hva man skulle gjøre med den.

## Det vi fortsatt ikke har løst

Appen er bygget rundt et annet spørsmål enn artsbestemmelse: **når** det er verdt å dra ut, og **hva slags skog** arten hører hjemme i. Der har vi målt oss selv, og resultatet er delt. Modellens evne til å rangere tidspunkt er god (AUC rundt 0,89). Evnen til å rangere sted ligger på rundt 0,52 — så vidt over myntkast, fordi funndataene i stor grad viser hvor folk går, ikke hvor soppen står. Det står åpent på [/soppforhold](/soppforhold), hvor vi publiserer den daglige vurderingen for 22 områder.

Forvekslingsdekningen er heller ikke komplett, artskatalogen er liten, og bildemodellen er en ekstern tjeneste vi ikke kontrollerer treffsikkerheten til. Alt dette er grunner til at dommen ikke hører hjemme hos oss.

## Hvor dommen faktisk hører hjemme

Hos et menneske som har soppen i hånda.

Giftinformasjonen skriver at [soppsakkyndige fra Norges sopp- og nyttevekstforbund kan kontrollere soppkurven din gratis mange steder i Norge i soppsesongen](https://www.helsenorge.no/giftinformasjon/sopp/soppkontroll/) — oversikt og åpningstider på [soppognyttevekster.no](https://soppognyttevekster.no). Forbundet arrangerer også soppturer og nybegynnerkurs, og det er der du lærer artene positivt, ikke bare som kontrast til giftsoppene.

Finnes det ingen kontroll i nærheten, finnes *Digital soppkontroll*, bemannet av faktiske soppkontrollører, som app og som nettversjon på [soppkontroll.no](https://soppkontroll.no). Merk at den er sesongåpen: FHI oppgir at [soppkontrollen er åpen fra 1. juli til 31. oktober](https://www.fhi.no/nyheter/2025/giftinformasjonen-advarer-for-arets-soppsesong/). Resten av året må du ha en annen plan.

At behovet er reelt, er ikke noe vi trenger å pynte på. Giftinformasjonen meldte om [rekordmange henvendelser om alvorlig forgiftning etter uhellsinntak av spiss giftslørsopp i 2024](https://www.fhi.no/nyheter/2025/giftinformasjonen-advarer-for-arets-soppsesong/), og i sju tilfeller var det bekreftet eller sterk mistanke om soppforgiftning forårsaket av arten. Rekorden gjaldt altså den ene arten, ikke sopphenvendelser generelt.

## Ved tvil

Spis bare sopp du er helt sikker på. Er du i tvil, la den stå.

Hvit fluesopp (*Amanita virosa*) og grønn fluesopp (*Amanita phalloides*) er begge dødelige. Amatoksinene tåler varme — steking og koking hjelper ikke. Helsebiblioteket beskriver [en karakteristisk latensperiode på 6 til 24 timer](https://www.helsebiblioteket.no/forgiftninger/sopp/sopp-amatoksin-hvit-fluesopp-gronn-fluesopp-kastanjeparasollsopp-rustbrun-parasollsopp-og-flatklokkehatt-behandlingsanbefaling-ved-forgiftning) før de kraftige magesymptomene kommer, en «forbigående noe bedring» 12 til 36 timer etter inntak, og deretter gradvis forverring med lever- og eventuelt nyreskade 2 til 6 døgn etter måltidet.

Spiss giftslørsopp (*Cortinarius rubellus*) gir orellanin, som angriper nyrene. Giftinformasjonen oppgir at [symptomene vanligvis kommer fra 36 timer til 6 dager etter inntak](https://www.helsenorge.no/giftinformasjon/sopp/spiss-giftslorsopp-er-en-meget-giftig-sopp/), at tegn på nyresvikt kan utvikle seg fra 3 til 17 dager etter, og at nyresvikten kan føre til behov for langvarig dialysebehandling eller nyretransplantasjon.

Tidsforskjellen er verdt å merke seg, for den er ikke lik. Ved giftslørsopp kan du rekke å glemme soppturen før du blir syk. Ved fluesopp drøyer det som regel bare til samme kveld eller dagen etter — og at det drøyer så lenge etter et måltid, er i seg selv faresignalet.

Om behandling: for orellanin finnes det ingen. Helsebiblioteket skriver rett ut at [«det finnes ingen antidot eller annen spesifikk behandling, kun symptomatisk behandling»](https://www.helsebiblioteket.no/forgiftninger/sopp/sopp-orellanin-spiss-giftslorsopp-og-butt-giftslorsopp-behandlingsanbefaling-ved-forgiftning). For amatoksin finnes det derimot behandling: behandlingsanbefalingen doserer silibinin (Legalon) konkret, og acetylcystein står på [Giftinformasjonens antidotliste](https://www.helsebiblioteket.no/forgiftninger/antidoter-og-eliminasjon/bruk-av-antidoter-giftinformasjonens-anbefalinger-antidotlisten) som «indisert ved forgiftning med amatoksinholdig sopp». Det gjør ikke forgiftningen ufarlig, og behandlingen virker best jo tidligere den starter. Det er en grunn til å ringe med en gang — ikke en grunn til å la være.

Mistenker du at noen har spist en giftig sopp, ring **Giftinformasjonen på 22 59 13 00** — døgnåpent. Ring med en gang, selv om ingen har symptomer ennå, og selv om noen først ble dårlige og så virker friskere. I Sverige: **112** ved akutt fare, ellers Giftinformationscentralen på **010-456 67 00**.

Og det som er hele poenget med denne artikkelen: bruk gjerne en app til å komme på sporet av en art, til å lære hvilke forvekslinger du bør kjenne, og til å finne ut når det er verdt å gå. Ikke bruk den — vår egen inkludert — som siste ledd før panna. Det leddet skal være et menneske.

## Kilder

- Hodgson m.fl. (2023), *Clinical Toxicology*: [«Comparison of three mushroom identification applications»](https://pubmed.ncbi.nlm.nih.gov/36794335/) — 78 eksemplarer sendt inn til Victorian Poisons Information Centre og Royal Botanic Gardens Victoria, 2020–2021.
- Artsdatabanken: [antall kjente sopparter globalt og i Norge](https://artsdatabanken.no/arter/takson/975).
- Giftinformasjonen / Helsenorge: [rødkremle](https://www.helsenorge.no/giftinformasjon/sopp/roedkremle-er-en-giftig-sopp/), [hvit fluesopp](https://www.helsenorge.no/giftinformasjon/sopp/hvit-fluesopp-er-en-svart-giftig-sopp/), [spiss giftslørsopp](https://www.helsenorge.no/giftinformasjon/sopp/spiss-giftslorsopp-er-en-meget-giftig-sopp/), [traktkantarell og spiss giftslørsopp](https://www.helsenorge.no/giftinformasjon/sopp/traktkantarell-og-spiss-giftslorsopp/), [sandmorkel](https://www.helsenorge.no/giftinformasjon/sopp/sandmorkel/), [rødskrubb](https://www.helsenorge.no/giftinformasjon/sopp/rodskrubb-kan-vare-en-giftig-sopp/), [grå blekksopp](https://www.helsenorge.no/Giftinformasjon/Sopp/Gra-blekksopp), [soppkontroll](https://www.helsenorge.no/giftinformasjon/sopp/soppkontroll/).
- Helsebiblioteket: behandlingsanbefaling ved [amatoksinforgiftning](https://www.helsebiblioteket.no/forgiftninger/sopp/sopp-amatoksin-hvit-fluesopp-gronn-fluesopp-kastanjeparasollsopp-rustbrun-parasollsopp-og-flatklokkehatt-behandlingsanbefaling-ved-forgiftning) og ved [orellaninforgiftning](https://www.helsebiblioteket.no/forgiftninger/sopp/sopp-orellanin-spiss-giftslorsopp-og-butt-giftslorsopp-behandlingsanbefaling-ved-forgiftning), samt [Giftinformasjonens antidotliste](https://www.helsebiblioteket.no/forgiftninger/antidoter-og-eliminasjon/bruk-av-antidoter-giftinformasjonens-anbefalinger-antidotlisten).
- FHI (2025): [Giftinformasjonen advarer før årets soppsesong](https://www.fhi.no/nyheter/2025/giftinformasjonen-advarer-for-arets-soppsesong/) — rekordtall for spiss giftslørsopp, og åpningstiden til Digital soppkontroll.
- Statens strålevern: [StrålevernInfo 11/2013, «Fortsatt mye radioaktivitet i sopp»](https://www.dsa.no/publikasjoner/straleverninfo-12-2013-radioaktivitet-i-sopp/StralevernInfo_11-2013.pdf), og DSA: [radioaktivitet i mat og drikke](https://www.dsa.no/radioaktivitet-i-mat-og-miljo/radioaktivitet-i-mat-og-drikke) (gjeldende 80 000 Bq/år-råd). Mattilsynet: [Tsjernobyl-ulykken og konsekvenser for mat i Norge](https://www.mattilsynet.no/mat-og-drikke/radioaktivitet/tsjernobyl-ulykken-og-konsekvenser-for-mat-i-norge) (grenseverdiene opphevet 1. januar 2025).
- Store norske leksikon: [sjampinjong](https://snl.no/sjampinjong) (skivefarge og giftsjampinjong) og [falsk kantarell](https://snl.no/falsk_kantarell).
- Norges sopp- og nyttevekstforbund: [soppognyttevekster.no](https://soppognyttevekster.no) og [soppkontroll.no](https://soppkontroll.no).
- Mycelets egne tall (24 av 48 matsopper uten forvekslingsrad, 17 av 35 par forkastet, 17 av 22 advarsler uten handlingsråd, AUC 0,89 / 0,52) er hentet fra prosjektets egne migrasjoner og revisjonsnotater.
