---
slug: hva-viser-soppkartene
kicker: Data og kart · 9 min
summary: Prikkene på et soppkart viser hvor folk har registrert funn — ikke hvor sopp vokser. Her er forskjellen, målt på våre egne data.
---

# Hva viser soppkartene egentlig?

Et soppkart viser hvor noen har registrert et funn. Det er ikke det samme som hvor sopp vokser, og avstanden mellom de to tingene er større enn de fleste kart lar deg ane. Vi har målt vårt eget kart, og resultatet er den ubehagelige delen av dette svaret: vi kan si ganske godt *når*, og dårlig *hvor*.

*Denne artikkelen handler om hva punktdata kan og ikke kan si. Den handler ikke om artsbestemmelse eller om hva som er spiselig. Den er heller ikke en kritikk av Artsdatabanken eller GBIF — de dataene er gode til det de er laget for. Problemet oppstår først når de leses som noe annet.*

## Prikken betyr «her sto det et menneske»

En registrert soppobservasjon blir til når fire ting skjer samtidig:

1. soppen fruktifiserte,
2. et menneske var på stedet,
3. mennesket kjente igjen arten,
4. mennesket gadd å registrere den.

Kartet viser produktet av alle fire. Bare det første punktet handler egentlig om sopp. De tre andre handler om mennesker — hvor de går, hva de kan, og hva de bryr seg om.

Det er ikke en spissformulering fra vår side. Det står i Miljødirektoratets egen veileder for konsekvensutredninger, i en setning som burde vært trykt på hvert eneste soppkart som selges:

> «Vær klar over at kartlagte naturtyper og antall artsobservasjoner som regel er overrepresentert i områder som er lett tilgjengelige for mennesker, som langs veier eller omkring større byer.»

Samme veileder er like tydelig på hva et tomt område betyr:

> «At det ikke er dokumentert funn av en art på et område behøver derfor ikke bety at arten ikke finnes der. Manglende funn kan skyldes at området ikke er undersøkt eller at artsfunnene ikke er digitalisert og gjort tilgjengelig.»

Der har du hele artikkelen i to sitater. Resten er tallene.

## Hvor tallene kommer fra

Norske soppfunn samles i hovedsak inn gjennom [Artsobservasjoner](https://artsdatabanken.no/rapporter-funn), Artsdatabankens rapporteringstjeneste, der hvem som helst med artskunnskap kan melde inn det de ser. Derfra flyter dataene videre til Artskart og til GBIF, den globale databasen Mycelet henter fra.

Det er en formidabel dugnad. Da vi slo opp i GBIF 9. august 2026, lå det **2 358 630 registrerte soppfunn fra Norge**. Av dem er 61 prosent merket «human observation» — noen så en sopp og skrev det ned — og 30 prosent er herbariebelegg. Artsobservasjoner alene står for 46 prosent av hele bunken.

Men riket Fungi rommer langt mer enn matsopp. Vi delte de norske postene på klasse: 48 prosent hører til *Agaricomycetes*, der nesten alt folk plukker finnes — hatt-, rør- og kantarellsopper. Rundt 35 prosent er lavdannende sopp. Sju prosent kommer fra ett eneste datasett med DNA fra jordprøver. Over en tredjedel av «soppfunnene» i Norge er altså lav.

Vi tar med den oppdelingen fordi den illustrerer artikkelens eget poeng på vår egen bekostning: et tall er sjelden det leseren tror, heller ikke når det er vi som oppgir det.

Mycelet bruker et smalere uttrekk enn dette: 327 298 forekomstpunkter for de artene som står i artskatalogen vår, hentet fra **både Norge og Sverige**, hvorav 316 542 har en brukbar dato. Sesongkurvene i appen er bygget på de sistnevnte, for 70 arter. Appen har drøyt 428 000 registrerte funn i basen totalt.

Merk hva som *ikke* finnes i noen av disse tallene: nullpunktene. Ingen registrerer «jeg gikk i denne lia i tre timer og fant ingenting». Dataene er det fagfolk kaller *presence-only* — bare tilstedeværelse. GBIF har riktignok et eget felt for ekte fraværsobservasjoner, men det står nesten tomt: for sopp i Norge er **348 poster** registrert som fravær, mot 2 358 282 som tilstedeværelse. Det er 0,015 prosent. Nullpunktene finnes formelt, men ikke i praksis.

Konsekvensen er hard. Uten nullpunkter kan du ikke skille «her er det ingen sopp» fra «her har ingen lett». Og et kart som fargelegger tomme områder som dårlige, gjør nettopp den forvekslingen.

## Fire skjevheter, hvorav én vi målte selv

**Veien.** Tilgjengelighet er den best dokumenterte skjevheten i biologiske forekomstdata. Det finnes egne metoder for å tallfeste den — [sampbias](https://doi.org/10.1111/ecog.05102) (Zizka, Antonelli & Silvestro, *Ecography* 2021) estimerer hvor mye innsamlingsraten stiger nær veier, byer, elver og flyplasser. At effekten finnes, er ikke omstridt.

**Helgen.** Denne ville vi måle selv, på norske soppdata. Vi prøvde først å trekke et utvalg, og bommet to ganger — det står under «Fellen vi selv gikk i» lenger nede. Til slutt talte vi opp hver eneste dag: alle 4 018 dagene fra 1. januar 2015 til 31. desember 2025, med samme filter hele veien (Norge, sopp, «human observation», med koordinat). Det ble **907 069 registrerte funn**, ingen dag utelatt.

Samlet ble **31,8 prosent av funnene gjort i helgen**, mot 28,6 ved jevn fordeling. Lørdag er den travleste dagen (16,6 prosent av alle funn), mandag den roligste (11,6 prosent). Regnet per dag er det 1,17 ganger så mange registreringer i helgen som på en hverdag.

Men snittet skjuler det som faktisk er interessant. Helgeandelen har falt nesten hvert eneste år:

- 2015: 36,6 % — 2016: 36,5 % — 2017: 36,2 %
- 2018: 35,0 % — 2019: 33,2 % — 2020: 32,6 %
- 2021: 32,6 % — 2022: 31,3 % — 2023: 29,6 %
- 2024: 28,5 % — 2025: 28,0 %

Fra 36,6 til 28,0 prosent på elleve år. De to siste årene ligger *under* jevn fordeling. Helgeskjevheten i norske soppregistreringer var reell for ti år siden; i dagens data er den i praksis borte.

Hvorfor, vet vi ikke. Det kan være at registreringen har flyttet fra skrivebordet om kvelden til telefonen i skogen, eller at mer hjemmekontor har jevnet ut hvilke dager folk er ute. Vi har ikke data som skiller de forklaringene, og vi skal ikke late som noe annet. Én ting kan vi derimot utelukke: at profesjonelle kartleggere har fortynnet frivilligdataene. Den frivillige tjenesten Artsobservasjoner sto for 78 prosent av postene i 2015 og 88 prosent i 2025 — en større andel, ikke mindre. Fallet skjer altså *innenfor* dugnaden.

Til sammenligning fant [Courter og medarbeidere (2013)](https://pubmed.ncbi.nlm.nih.gov/23104424/) en helgeandel på 32 prosent for førsteankomster av trekkfugl i Nord-Amerika, ned fra 33,7 prosent i eldre data. Samme retning som de norske tallene, bare mye svakere. Og [Rosário og medarbeidere (2025)](https://doi.org/10.1002/pan3.70017) fant ukedag blant de sterkeste prediktorene for når folk registrerer i det hele tatt — riktignok for seks trearter på Den iberiske halvøy, på iNaturalist-data, ikke for sopp i Norden. Skjevheten er altså ikke avskaffet som fenomen. Den er svekket her, i disse dataene, i denne perioden.

**Sesongen.** Soppfunn hoper seg opp om høsten. Det er åpenbart riktig — det er da soppen fruktifiserer. Men det er også da folk går ut for å lete. De to årsakene er vevd sammen i dataene, og med presence-only-data kan de ikke skilles helt fra hverandre. Enhver sesongkurve bygget på funndata inneholder begge deler.

**Arten.** Folk registrerer ikke alt de ser. Sjeldne og rødlistede arter meldes ivrigere enn vanlige, og attraktive matsopper oftere enn små brune. Hughes og medarbeidere fant i en [gjennomgang av 742 millioner forekomstposter](https://doi.org/10.1111/ecog.05926) (*Ecography* 2021) at over halvparten av postene i de fleste grupper gjelder under to prosent av artene — og at bare 6,74 prosent av kloden i det hele tatt er prøvetatt. Den analysen dekker dyr, ikke sopp, så tallene skal ikke flyttes rått hit. Men mønsteret er det samme.

## Vi målte vårt eget kart, og det besto ikke

Her er tallene vi helst skulle sluppet å publisere.

Først et ord om målestokken. AUC er et mål på rangeringsevne, ikke på treffprosent. Tenk deg at du tar et sted der det faktisk ble funnet sopp, og et tilfeldig annet sted, og spør modellen hvilket av de to som er best. Gjetter den rent tilfeldig, treffer den halvparten av gangene — AUC 0,50. Treffer den alltid, er AUC 1,00.

Mycelets **tidsmodell** — den empiriske fenologien, altså når på året hver art dukker opp — har AUC **0,88**, trent på data før 2021 og testet på 2021 og senere. Det er klart bedre enn tilfeldig, og klart bedre enn den håndskrevne månedsheuristikken vi startet med (0,83).

Mycelets **romlige modell** — den som skulle si *hvor* — måler slik, i en validering bygget for å motstå lekkasje mellom trening og test:

- hele den romlige modellen: **0,504**
- bare habitat (skogtype, bonitet, volum): **0,536**
- bare tetthet av historiske funn: **0,472**
- jordas dreneringsgrad, målt på svenske data: **rundt 0,47** — den ble aldri koblet inn i modellen, nettopp fordi den ikke skilte

Ulike kjøringer av fullmodellen har landet på 0,504 og 0,521, avhengig av hvordan bakgrunnspunktene velges. Uansett hvilken vi bruker: nær myntkast. Legg spesielt merke til den tredje linjen: ren forekomsttetthet gjorde det *verre* enn tilfeldig. Å sende folk dit det er registrert mest sopp fra før var, i vår måling, marginalt dårligere enn å velge et sted i blinde.

Derfor er den delen slått av. I koden står den nå som en enkelt linje der forekomstfaktoren er satt til 1 — altså ingen effekt — med målingen skrevet inn som begrunnelse rett ved siden av.

## Fellen vi selv gikk i

Vi hadde en fasit på 26 steder som erfarne plukkere hadde anbefalt, og vi testet om tetthet av historiske funn kunne forutsi dem. Tallene så lovende ut:

- antall funn innen 3 km: AUC 0,671
- antall ulike år med funn: 0,685
- antall ulike arter: 0,683

Bedre enn modellens egen score. I noen timer så det ut som forekomstdataene virket likevel.

Så leste vi fasiten på nytt. **23 av de 26 anbefalte stedene nevnte parkering, kollektivtransport eller merket sti i adkomstbeskrivelsen.** Testen målte ikke om det vokser sopp der. Den målte om folk kan komme seg dit — på begge sider av sammenligningen samtidig. Den strengere målingen på 0,472 var den riktige.

Vi gikk i den samme fellen mens vi skrev denne artikkelen. Første forsøk på å måle helgeskjevheten hentet de første 3 000 postene per år fra GBIF, uten å tenke over at API-et leverer dem i datorekkefølge. Utvalget besto nesten utelukkende av januar og februar, og ga en helgeandel på 44,8 prosent. Vintersopping *er* en utpreget helgeaktivitet — opptellingen vår viser 42,9 prosent for januar og februar, mot 25,9 prosent i juli — så tallet var omtrent riktig for det utvalget, og fullstendig feil som svar på spørsmålet vi stilte. Andre forsøk trakk et lagdelt utvalg, men trakk det i sammenhengende blokker, og blokker klumper seg etter hvem som har meldt inn; det ga 32,6 prosent, drøyt ett prosentpoeng for høyt. Til slutt gjorde vi det eneste som ikke kan trekke skjevt: talte opp alle dagene.

Lærdommen er den samme hver gang: **et tall som ser lovende ut, fra en test som ikke kontrollerer for den ene tingen du vet er en konfunderende faktor, er verdiløst.** Det gjelder også når tallet er ditt eget og du gjerne vil at det skal stemme.

## Hvorfor «når» overlever det «hvor» ikke gjør

Hvis dataene er så skjeve, hvorfor virker tidsmodellen?

Fordi skjevheten i stor grad er den samme for alle arter. Går folk mest i skogen i september, løftes alle september-arter like mye. Men *forskjellen* mellom en art som topper i juni og en som topper i oktober overlever den felles skjevheten. Sesongkurvene sammenligner arter mot hverandre innenfor den samme skjeve innsamlingen, og da forsvinner mye av problemet.

Romlig går det motsatt vei. Der er skjevheten selve variasjonen du prøver å måle. Tettheten av funn i en rute *er* i praksis et mål på hvor lett den ruta er å komme til.

Vi skal ikke overdrive renheten her heller: helgeskjevheten er en tidsskjevhet, og i eldre data traff den tidsmodellen vår også. Courter og medarbeidere målte at helgeeffekten forskjøv beregnede ankomstdatoer for fugl med rundt en halv dag. Det er lite sammenlignet med usikkerheten ellers i et soppvarsel, men det er ikke null — og det er en av grunnene til at kurvene bør bygges på nyere data når de finnes.

## Hva kartet faktisk er godt til

Alt dette betyr ikke at soppkart er verdiløse. Det betyr at de svarer på et annet spørsmål enn folk tror.

Den avgjørende asymmetrien: **et punkt er informasjon. Et tomt område er ingen informasjon.** Er kantarell (*Cantharellus cibarius*) registrert i en li, har et menneske ment å se kantarell der — en observasjon, ikke en garanti, og bestemmelsen kan være feil. At nabolia er blank, forteller deg derimot ingenting i det hele tatt, bortsett fra at ingen har meldt derfra.

Med den asymmetrien i bakhodet er kartet nyttig til:

- **Hvilke arter som er meldt i din landsdel.** Artslisten for et fylke er langt mer pålitelig enn plasseringen av hvert enkelt punkt.
- **Når på året de ble meldt.** Datoene er den sterkeste delen av datasettet. Det er derfor sesongkurvene virker.
- **Å vite hva du bør lære å kjenne igjen — også det farlige.** Hvit fluesopp (*Amanita virosa*) og spiss giftslørsopp (*Cortinarius rubellus*) er dødelige, og dem må du kunne uansett hva kartet viser for ditt område. Et tomt område betyr «ingen har meldt fra», ikke «her finnes den ikke» — og det er trolig mest villedende akkurat her: en sopp ingen vil ha i kurven, blir sjeldnere lagt merke til og meldt inn enn en matsopp. Hvor stor den forskjellen er for norske giftsopper, har vi ikke målt. Spiss giftslørsopp vokser ofte side om side med traktkantarell i samme fuktige, mosekledde barskog, og symptomene på nyreskade kan komme flere døgn etter måltidet, lenge etter at man har glemt hva man spiste. Hvit fluesopp er lumsk på en annen måte: magesymptomene kommer 6–24 timer etter måltidet, så følger en tilsynelatende bedring før lever- og nyreskaden slår inn. Den bedringen skal aldri roe deg ned.
- **Et utgangspunkt for egne turer.** Ikke en fasit — en hypotese om *hvor du skal gå*, ikke om hva du kommer til å finne.
- **Å finne skogtypen, ikke stedet.** Ser du at en art er meldt fra gammel granskog med høy bonitet, er det den *typen* skog du skal lete i. Det generaliserer. Selve punktet gjør det ikke. Men skogtypen sier bare hvor du skal lete — den sier ingenting om det du står med i hånden. Ved tvil, la den stå.

Og det beste kartet over ditt eget terreng lager du selv. Noen sesonger med egne, daterte notater slår enhver generell modell på akkurat de liene du faktisk går i. Men et eget kart har samme begrensning som alle andre: det forteller deg hvor du skal se, ikke hva du fant i dag. Arten avgjøres i hånda, hver gang, også på en plass du har plukket på i ti år.

## Slik leser du et soppkart uten å bli lurt

- **Spør alltid: hvor går veien?** Ligger prikkene langs stier, veier og hytteområder, ser du på et kart over mennesker.
- **Les tomme områder som «ukjent», aldri som «tomt».**
- **Vær skeptisk til fargelagte flater.** Punkter er observasjoner. En sammenhengende farge er en modell — spør hva den er validert mot, og mot hva slags fasit.
- **Sjekk om tjenesten oppgir hvor godt den treffer.** Gjør den ikke det, er det som regel fordi den ikke har målt det.
- **Bruk datoene mer enn koordinatene.** Det er der signalet er sterkest.
- **Husk at artsnavnet på en prikk er noens bestemmelse.** Den kan være feil, og den sier uansett ingenting om soppen du står med i hånden.

Mycelet viser derfor forekomstpunkter som kontekst på kartet, men lar dem ikke påvirke poengsummen. Den daglige vurderingen av soppforholdene for 22 områder ligger åpent på [/soppforhold](/soppforhold) — det er «når»-delen, den vi faktisk har målt at virker.

## Til slutt: sikkerhet

Ingenting på et kart kan fortelle deg om en sopp er trygg å spise. En prikk sier at noen mente de så en art der, en gang. Den sier ingenting om eksemplaret du har i kurven.

Artsbestemmelse er en egen ferdighet, og det er den eneste av ferdighetene i denne artikkelen der en feil kan drepe deg. En felttest kan avsløre at et funn *ikke* er den arten du håpet — den kan aldri frikjenne det.

Er du det minste i tvil: la den stå. Bruk soppkontroll. Norges sopp- og nyttevekstforbund har fysiske kontroller rundt om i landet fra august og utover i sesongen — finn nærmeste på [soppkontroll.no](https://soppkontroll.no). Der ligger også *Digital soppkontroll*, som åpner 1. juli og bemannes av faktiske soppkontrollører, som app og på nett.

Verken kartet, prediksjonen eller bildeidentifiseringen i Mycelet er en spiselighetsdom, og ingen av dem skal være siste ord. Vi har brukt denne artikkelen på å vise fram svakhetene i «hvor»-delen vår — det gjør ikke resten av appen til en fasit.

Mistenker du at noen har spist en giftig sopp, ring **Giftinformasjonen på 22 59 13 00** — døgnåpent. Ring med en gang, selv om ingen har symptomer ennå, og selv om noen først ble dårlige og så virker friskere. I Sverige: **112** ved akutt fare, ellers Giftinformationscentralen på **010-456 67 00**.

## Kilder

- Miljødirektoratet, veileder for konsekvensutredninger, [1.2 Kunnskapsgrunnlaget](https://www.miljodirektoratet.no/ansvarsomrader/overvaking-arealplanlegging/arealplanlegging/konsekvensutredninger/metode-for-utredning/naturmangfold/1.2.-kunnskapsgrunnlaget) — overrepresentasjon nær vei og by; manglende funn er ikke fravær; om lag 81 % av Norges kjente arter er dokumentert i Artskart.
- Artsdatabanken, [Rapporter funn / Artsobservasjoner](https://artsdatabanken.no/rapporter-funn) — frivillig innrapportering.
- Hughes m.fl. (2021), *Ecography* 44: 1259–1269, [Sampling biases shape our view of the natural world](https://doi.org/10.1111/ecog.05926) — 742 millioner poster; 6,74 % av kloden prøvetatt; over 50 % av postene gjelder under 2 % av artene. **Dekker dyr, ikke sopp.**
- Zizka, Antonelli & Silvestro (2021), *Ecography* 44: 25–32, [sampbias](https://doi.org/10.1111/ecog.05102) — metode for å tallfeste tilgjengelighetsskjevhet (vei, by, elv, flyplass).
- Courter m.fl. (2013), *International Journal of Biometeorology* 57: 715–720, [Weekend bias in Citizen Science data reporting](https://pubmed.ncbi.nlm.nih.gov/23104424/) — helgeandelen for førsteankomster falt fra 33,7 % i historiske data (1880–1969) til 32 % i nyere (1997–2010); forskyver beregnede datoer med rundt en halv dag. **Fem fuglearter i Nord-Amerika.**
- Rosário, Tiago, Chozas & Capinha (2025), *People and Nature* 7: 860–870, [When do citizen scientists record biodiversity?](https://doi.org/10.1002/pan3.70017) — ukedag, måned og temperatur er de sterkeste prediktorene for registreringsaktivitet; aktiviteten er høyere i helgene. **Seks trearter på Den iberiske halvøy, på iNaturalist-data — ikke sopp, ikke Norden.**
- Norges sopp- og nyttevekstforbund, [soppkontroll.no](https://soppkontroll.no) og [Soppsesongen 2026](https://soppognyttevekster.no/soppsesongen-2026/) — Digital soppkontroll åpner 1. juli; de fysiske kontrollene «starter opp i løpet av august og holder det gående i løpet av sesongen».
- Egne uttrekk fra GBIFs åpne API, 9. august 2026: 2 358 630 soppfunn fra Norge; 61 % «human observation», 30 % herbariebelegg; 48 % *Agaricomycetes*, 35 % lavdannende sopp, 7 % fra ett eDNA-datasett fra jordprøver; 348 fraværsposter mot 2 358 282 tilstedeværelsesposter.
- Egen fullstendig dagsopptelling mot samme API, 9. august 2026: alle 4 018 dager fra 2015 til 2025, filtrert på Norge, sopp, «human observation» og koordinat — 907 069 funn, ingen dag utelatt. Helgeandel 31,84 % samlet; 36,64 % i 2015, fallende til 27,96 % i 2025. Lørdag 16,59 %, mandag 11,64 %. Januar–februar 42,91 %, juli 25,88 %. (Samme filter med årsintervall i stedet for dag-for-dag gir 907 363 — de vel 290 postenes forskjell er datoer som ikke lar seg feste til én enkelt dag.)
- Mycelets egne valideringskjøringer: fenologi AUC 0,88 (mot 0,83 for den gamle månedsheuristikken); romlig fullmodell 0,504 og 0,521 i to kjøringer, habitat 0,536, forekomsttetthet 0,472.
