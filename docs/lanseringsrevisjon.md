# Lanseringsrevisjon — protokoll

> Tilpasset fra revisjonsprompten som ble kjørt 1. august 2026 og som ga
> `technical-audit.md`, `risk-register.md`, `product-v2-roadmap.md` og
> `professional-handoff.md`.

## Hvorfor den forrige prompten ble skrevet om

Den forrige kjøringen er målt, ikke gjettet. Alle 39 konkrete funn i de to
rapportene ble sjekket mot koden på nytt:

| Dom | Antall |
|---|---:|
| fortsatt sant | 13 |
| allerede fikset | 11 |
| **aldri sant** | **7** |
| uverifiserbart | 6 |
| utdatert | 2 |

**Nesten ett av fem funn var ikke sant.** Tre av dem siterte kode som ikke
finnes — verifisert med `git log --all`:

- `supabase/migrations/029_findings_context.sql` — har aldri eksistert i noen
  branch. Den ekte filen heter `029_prediction_feedback_context.sql`, og
  linjenumrene 48 og 84 stemte eksakt for den. **Funnet var reelt. Henvisningen
  var oppdiktet.**
- `src/app/api/billing/stripe/webhook/route.ts` og
  `.../billing/revenuecat/webhook/route.ts` — begge oppdiktet. De faktiske
  stiene er `src/app/api/stripe/webhook/` og `src/app/api/revenuecat/webhook/`.
- `package.json:50` som bevis for en sårbar produksjonsavhengighet. Linje 50 er
  `"react": "^19.2.6"`.

To andre funn påsto at noe manglet som fantes **i selve commiten som ble
revidert** — identifiserende User-Agent mot MET, kildesiden `/datakilder`, og
replay-vern på tvers av Stripe og RevenueCat.

Samtidig fant den ingenting av det som faktisk var galt. Samme dag ble åtte
reelle feil funnet på andre måter, blant dem en kart-popup som hadde vært tom
for **alle** brukere i fem uker, og et kart som systematisk viste den dårligste
soppen på hvert sted.

Årsaken var ikke at prompten manglet temaer. Den listet alt. **Den sa aldri
hvordan man skal vite.** Denne versjonen bytter ut lengde med beviskrav.

## Slik starter du den

```
Kjør lanseringsrevisjonen for Mycelet. Protokollen står i docs/lanseringsrevisjon.md.
Følg beviskravene i del 2 — et funn uten bevis av riktig type er ikke et funn,
og en henvisning som ikke lar seg åpne er en fabrikasjon.
Ikke endre kildekode i revisjonsfasen. Ikke deploy. Rapporter, så bestemmer jeg.
```

---

## Del 0 — Det som ikke er sant

Målet er formulert som «100 % sikre på at appen er god nok for lansering». Det
tallet finnes ikke, og en revisjon som lover det lyver.

Det som **er** oppnåelig:

1. Hver påstand appen viser en bruker er sammenlignet med det som faktisk står i
   databasen.
2. Hver flate er åpnet, ikke bare lest.
3. Hvert funn har overlevd et forsøk på å motbevise det, og hver henvisning er
   åpnet og kontrollert.
4. Det som ikke kan avgjøres er navngitt, med hvem som må avgjøre det.

Punkt 4 er ikke en unnskyldning. Det er den delen av rapporten som har mest
verdi, fordi det er den eneste som forteller hvor du fortsatt er utsatt.

---

## Del 1 — Reglene

### Revisjonsfasen endrer ingenting

Ingen endringer i kildekode. Ingen nye eller slettede filer bortsett fra
rapportene i del 10. Ingen pakkeinstallasjoner. Ingen migrasjoner. Ingen
endringer i Supabase, Stripe, RevenueCat eller miljøvariabler. Ingen push, PR
eller deploy. Ingen destruktive git-kommandoer. Finnes det allerede endringer i
arbeidsområdet: dokumenter dem, bevar dem.

### Om hemmeligheter — dette er endret fra forrige versjon

Forrige prompt sa «ikke kjør kommandoer som krever produksjonsnøkler». **Den
regelen er grunnen til at de to alvorligste feilene forble usynlige.** Begge
krevde et oppslag mot ekte data for å se.

- **Lesende oppslag mot produksjon er påkrevd**, ikke forbudt.
- Nøkler leses fra miljøet for å autentisere. **Verdien skrives aldri ut, logges
  aldri, havner aldri i en rapport.** Variabelnavn er greit.
- **Aldri skriv til produksjonsdatabasen.** Ingen insert, update, delete, ingen
  RPC med bivirkninger. Det finnes ingen staging — én Supabase-instans, og den
  har ekte betalende kunder.
- **Aldri tast et passord, aldri logg inn som en bruker.** Flater bak innlogging
  verifiseres manuelt av eieren, med presis instruks om hva som skal ses etter. Det er en
  begrensning som skal stå i rapporten, ikke skjules.
- Ikke hamre på egne produksjonsendepunkter for å bevise et poeng.

---

## Del 2 — Hvordan du vet noe · beviskravene

Dette er kjernen. Alt annet er tema; dette er metode.

**Et funn uten bevis av riktig type er ikke et funn.** Skriv det ikke.

### Rangeringen er målt, ikke ment

De 40 reelle feilene som ble funnet i denne kodebasen 1. august 2026, fordelt
etter hvilken teknikk som skulle til:

| Teknikk | Fant |
|---|---:|
| Kjørte flyten | 10 |
| Kjørte et verktøy (bygg, `npm audit`, tester) | 10 |
| **Leste koden** | **7** |
| Spurte produksjonsdataene | 6 |
| Manuell inspeksjon | 3 |
| Rendret komponenten | 2 |
| Sammenlignet UI mot database | 2 |

**Kodelesing fant 7 av 40.** En revisjon som bare leser, ser under en femtedel.

### 1. Sammenlign det appen VISER med det som står i databasen

> Kartet viste «Soppforhold 2/100» på et sted. En spørring mot
> `prediction_tiles` viste sju rader per rute — én per art — og at kantarell på
> nøyaktig samme rute lå på **60**. Tallet brukeren så var vanlig morkel. I
> august.

Hvorfor kodelesing ikke fant den: *«Koden er korrekt på hvert eneste steg. Feilen
ligger utelukkende i en egenskap ved DATAENE — at rasteret har sju rader på samme
koordinat — som ikke står noe sted i koden, ikke i typene, ikke i kommentarene.»*

Ta et tall appen viser, finn hvor det beregnes, og spør kilden selv.

### 2. Rendre komponenten — ikke bare les den

> `FindingPopup` kastet på sin første linje fordi Leaflet rendrer den i en
> løsrevet React-rot, og React-kontekst krysser ikke rot-grenser. En tom hvit
> boks ved hvert klikk på en soppmarkør, for alle brukere, i fem uker. I
> produksjonsbygg kaster use-intl med **tom melding**, så konsollen var stille.

Hvorfor kodelesing ikke fant den: *«Alle tre delene er individuelt riktige.
Feilen er en usynlig egenskap ved kombinasjonen.»*

Regel: hver komponent som rendres utenfor det vanlige React-treet — Leaflet-
popups, portaler, `createRoot`, service worker-flater — **rendres i en test, og
det skal komme HTML ut**.

### 3. Kjør ruta mot ekte data

> `/api/prediction` returnerte 19 for Nesodden. Etter fiksen 55. Begge tall
> hentet fra et ekte produksjonsbygg mot ekte data, ikke resonnert fram.

`npm run build`, start på en ledig port, kall endepunktene.

### 4. Les alle konsumentene av samme ressurs SIDE OM SIDE

Denne er ny, og den forklarer hvorfor feilen overlevde i månedsvis.

> `/api/prediction/grid` og `species-spots` navngir allerede arten per sted.
> Rasterbanen gjorde det ikke. Tre av fire konsumenter av samme tabell gjorde én
> ting; den fjerde gjorde noe annet.

*«En revisjon som går fil for fil ser fire filer som hver for seg er
konsistente.»* Avvik mellom konsumenter er usynlig med mindre du legger dem ved
siden av hverandre. Gjør det for hver delt tabell, hvert delt endepunkt og hver
delt hjelpefunksjon.

### 5. Muter fiksen og se testen falle

> De elleve nye rutetestene besto med én gang. Mistenkelig. Jeg skrudde fiksen
> av igjen: **seks av elleve falt.** De fem som besto uansett var de som skulle
> bestå uansett.

For hver test du støtter deg på i en konklusjon: reverser det den tester, bekreft
at den blir rød. Gjør den ikke det, er den kulisse.

### 6. Les koden

Nødvendig for å vite hvor du skal se. Ikke tilstrekkelig for å konkludere.

### Beviskrav per alvorlighetsgrad

| Grad | Krever |
|---|---|
| **Kritisk** | Teknikk 1–5. Kodelesing alene er ikke nok. Pluss motbevisforsøk (del 7). |
| **Høy** | Teknikk 1–5, eller kodelesing der kodestien er entydig og sitert. Pluss motbevisforsøk. |
| **Middels** | Kodelesing med fil:linje. |
| **Lav** | Fritt. |

### Kontroller hver eneste henvisning

**Ikke-forhandlingsbart, og det billigste tiltaket i hele protokollen.**

Før en fil:linje-henvisning skrives: åpne den, og bekreft at den inneholder det
du påstår. Tre av forrige revisjons henvisninger pekte på filer som aldri har
eksistert, og én pekte på `"react"` der den påsto en sårbarhet.

En oppdiktet henvisning er verre enn et manglende funn. Den ser autoritativ ut,
koster timer å avvise, og gjør at leseren slutter å stole på resten.

### Ord du ikke skal bruke

«Bør forbedres», «kan være et problem», «vurder å», «det anbefales å styrke».
Skriv hva som er galt, hva som skjer når det slår ut, og hva som må endres.
Klarer du ikke det, har du ikke et funn — du har en følelse.

---

## Del 3 — Der automatikken er blind

`npm run qa` kjører 39 Playwright-tester og blir grønn. Her er hva den
**strukturelt ikke kan se**, uansett hvor mange tester man legger til i samme
form. Dette er kartet over hvor du skal lete.

**Riktighet av innhold.** Ingen test snakker med Supabase eller med en fasit.
Artsdetaljen sjekker «en heading finnes», ikke at navnet er artens navn.
Prissiden sjekker at «79» og «249» står et sted i DOM — ikke at de hører til
riktig plan eller matcher Stripe. `/api/prediction` leses aldri som JSON. Suiten
tester **form, ikke innhold** — og begge de alvorlige feilene 1. august var
innholdsfeil.

**Hele middleware-laget.** Turbopack kjører ikke middleware i dev. Auth-redirect
for `/profile`, `/map`, `/forum/new`, `/admin`, landingsside-rewriten, geo-IP og
språkvalg — ingenting av det finnes lokalt.

**Den statiske landingssiden utloggede faktisk ser.** Middleware rewriter `/` til
`public/landing/index.html`. Lokalt får testen React-siden i stedet. Samme test
asserterer to forskjellige sider i `qa` og `qa:prod`, og ingen av dem
sammenligner.

**Alt som bare finnes i produksjonsbygget.** Suiten kjører mot `next dev`, aldri
`next build`. CSP (nå enforcing), de seks sikkerhetsheaderne, prerender-feil,
service worker og offline-precache er utenfor rekkevidde. **Ingen test leser en
eneste response-header.**

**Hele den svenske brukeropplevelsen.** Ingen test setter `MYCELET_LOCALE` eller
`Accept-Language: sv`. «Svensk» dekning er utelukkende koordinater (57.71,
11.97), aldri språk. Den svenske katalogen, `getSpeciesDisplayName`-fallbacken
som feiler **stille** til norsk, og all serverside-generert prosa er utestet.

**Førstegangsopplevelsen.** `fixtures.ts` setter tre localStorage-flagg for
**alle** tester før første navigasjon. Onboarding, cookie-notis og kart-introen
rendres derfor aldri i noen kjøring. **Popups åpnes aldri** — det er derfor den
tomme funn-popupen overlevde fem uker med grønn QA.

**Alt som skriver.** Ingen staging → skrivetester er av som policy. Lagre funn,
poste innlegg, laste opp bilde, endre synlighet, slette konto, eksportere data,
kjøpe eller kansellere.

**Betalte nivåer og isolasjon mellom brukere.** QA-brukeren er én gratiskonto
uten `billing_subscriptions`-rad. Den betalte grenen kjøres aldri. Og med bare
én sesjon kan påstanden «bruker A ser ikke bruker Bs private funn» ikke testes i
det hele tatt.

**Betaling ende-til-ende.** «Native» er en injisert
`window.CapacitorCustomPlatform` i Desktop Chrome. Det beviser at React skjuler
knapper — ikke at iOS-skallet oppfører seg slik, ikke at RevenueCat virker, ikke
at webhooken skriver til databasen.

**Nedetid er hvitelistet som bestått.** 502 fra `/api/prediction` gir
`console.warn`, ikke feil. `/api/health/predictions` godtar både 200/`ok` og
503/`degraded`. Alle værkilder nede og alle prediksjonsfliser utdaterte gir
fortsatt grønn kjøring.

**Falsk grønt fra stille skip.** `test.skip` brukes tre steder. En kjøring der 13
av 39 hoppet over rapporterer nøyaktig like grønt som en full kjøring.

**Hvilken kode som testes.** `reuseExistingServer: true` uten commit-sjekk.
Kjører det allerede en dev-server fra en annen katalog — et kjent mønster her —
evaluerer `qa` den koden i stedet for den utsjekkede.

**Andre nettlesermotorer og mobil.** Bare Desktop Chrome. En kommentar i
`map-geo.e2e.ts:67` dokumenterer at en test var grønn mens WebKit viste grått
kart. Blindsonen har allerede sluppet en produksjonsfeil gjennom.

**Visuell riktighet.** Playwrights `toBeVisible()` godtar hvit tekst på hvit
bakgrunn, et element under et overlay, og noe skjøvet ut av skjermen på mobil.

---

## Del 4 — Karaktersett den forrige revisjonen først

Ikke start på null. Gå gjennom hvert konkrete funn i `docs/technical-audit.md`
og `docs/risk-register.md` og gi det én dom: **fortsatt sant · allerede fikset
(oppgi PR) · aldri sant · utdatert · uverifiserbart**.

Tallene fra forrige gjennomgang står øverst i dette dokumentet. Bruk dem som
utgangspunkt, men verifiser på nytt — main har flyttet seg.

**Merk om grunnlaget:** forrige revisjon ble kjørt mot `feat/ga4-pwa@c9ef78b` —
en branch, ikke main. Innholdet landet i main via squash-merge (PR #98, 29. juli),
men main hadde flyttet seg videre da rapporten ble skrevet 1. august.

**Din revisjon skal kjøres mot det produksjon faktisk kjører.** Slå opp hvilken
commit som er ute, oppgi den, og noter avstanden til main.

---

## Del 5 — Inventaret

Fem inventarer, alle med kontrollerte fil:linje-henvisninger.

1. **Flater** — hver side og hvert endepunkt. Krever den innlogging? Er den
   betalingsgated? Og viktigst: håndheves gatingen på **serveren**, eller er den
   bare skjult i klienten?

2. **Tall og påstander** — hvert tall og hver faktapåstand appen viser, sporet
   til der det beregnes, med svar på: *under hvilken omstendighet ville dette
   vært feil uten at en eneste test feilet?* Grunnlaget for teknikk 1, og den
   viktigste enkeltleveransen her.

3. **Soppsikkerhet** — hver flate der spiselighet, giftighet eller
   artsbestemmelse kommuniseres. Kan advarselen overses? Finnes den på begge
   språk?

4. **Penger** — hver betalingsflyt med status og hvor tilgangen håndheves.

5. **Posisjonspersonvern** — hver vei en koordinat kan bevege seg, og om den er
   eksakt eller grovkornet der den ender.

Klassifiser hver funksjon: **ferdig · delvis · prototype · kun dokumentert ·
ikke implementert · implementert men aldri verifisert**.

Den siste kategorien er den farligste, og forrige revisjon hadde den ikke.
Kart-popupen var «implementert» i fem uker mens den var tom.

---

## Del 6 — Kapitlene

Rekkefølgen er etter risiko for denne appen.

### 6.1 Soppsikkerhet

En bruker kan bli forgiftet. Alt annet er mindre viktig.

Kan noe få en leser til å tro at AI-forslaget er en bestemmelse, at «spiselig» er
en dom over soppen i hånden, at høy treffprosent betyr bekreftet art, at et
kartfunn betyr at soppen står der nå, eller at fellesskapsbekreftelse tilsvarer
soppkontroll?

Sjekk: står «spiselig» noe sted uten kontekst; leses grønt/rødt som en dom; kan
en advarsel scrolles forbi eller lukkes; finnes lenke til Giftinformasjonen og
offisiell soppkontroll **på begge språk**.

Skill i språket mellom fire ting: AI-forslag · brukerens egen bestemmelse ·
fellesskapets vurdering · soppsakkyndig kontroll.

**Felle med presedens:** den svenske advarselsteksten var oversatt, men
artsnavnene inni den var ikke. En svensk bruker fikk «Kan förväxlas med grønn
fluesopp» — det norske navnet på katalogens dødeligste art, skrevet slik at
leseren ikke kjenner den igjen. Sjekk at hver sikkerhetstekst er lokalisert *hele
veien*, ikke bare rammen.

### 6.2 Prediksjonsmotoren og hva den har lov til å påstå

**Den bindende ærlighetsrammen:** den romlige delen har en ærlig AUC rundt
**0,52** — nær myntkast. Tidsdelen er validert til **0,89**. Ingenting i appen
har lov til å påstå mer om *hvor* enn 0,52 bærer. Det er *når* som er styrken.

For hver datakilde: brukes den **faktisk** i produksjon, eller finnes bare koden?
Hva ser brukeren når den er nede? Geografisk dekning? Ikke anta at satellittdata,
NDVI eller vegetasjonsindekser er i bruk fordi det finnes en fil om dem — sjekk
om de påvirker et tall brukeren ser.

Satellittdata skal aldri presenteres som observasjon av sopp.

Avgjør hva scoren måler, og at appen sier det samme: sannsynlighet for at arten
finnes · habitategnethet · værmessige vekstforhold · observerte funn · en blandet
heuristikk. Disse må ikke smelte sammen til ett umerket tall — det var nøyaktig
feilen 1. august.

### 6.3 Posisjonspersonvern

Spor hver vei en eksakt koordinat kan lekke: API-svar, views, klientspørringer
som henter mer enn de viser, RLS-hull, EXIF i bilder, serverlogger, foruminnlegg,
delingsbilder, URL-parametere, adminfunksjoner, dataeksport, og tredjeparter —
særlig bildet som sendes til Kindwise.

Sjekk at grovkorningen er **stabil**: samme funn skal ikke flytte seg mellom to
visninger, ellers kan den eksakte posisjonen trianguleres.

### 6.4 Penger

Live med ekte betalende kunder. To feilretninger, begge alvorlige:

- **En betalende kunde mister tilgang.** Presedens: checkout-ruta fjernet betalt
  tilgang *før* betalingen var gjennomført.
- **En gratisbruker får tilgang.** Håndheves hver premiumfunksjon på serveren?

Kontroller webhook-signatur, idempotens, kansellering vs. utløp, refusjon,
prøveperiode, sesongpass, gjenoppretting av kjøp, og at Apple-utløp ikke kan
overstyre et aktivt Stripe-abonnement. Sjekk hva som faktisk er koblet, ikke hva
planen sier.

### 6.5 Auth og autorisasjon

Åpne redirects (det finnes en delt `getSafeNext()` — bruker *alle* kallsteder
den?), middleware-gating, `PROTECTED_PATHS`, sesjon, cookies, roller, og om noen
autorisasjon avgjøres i klienten. Middleware må verifiseres mot produksjon (del 3).

### 6.6 Database og RLS

Sjekk særlig at `SECURITY DEFINER`-funksjoner ikke omgår RLS på en måte som gjør
dem kallbare av `anon` med et stort bounding-box. At views respekterer det de
skal, at migrasjonene kan kjøres i rekkefølge, og at romlige indekser matcher
spørringene som faktisk kjøres.

### 6.7 De øvrige

Kortere, samme beviskrav: **API og serverkode** (validering, rate limiting, SSRF,
filopplasting, webhook-signaturer, persondata i logger) · **GDPR og juridisk** ·
**offline, PWA og Capacitor** — skill hardt mellom implementert offline-støtte og
påstander i markedsføringen · **ytelse** · **tester** (del 2 punkt 5) ·
**kodekvalitet** (risiko og vedlikeholdbarhet, ikke estetikk) ·
**avhengigheter** (ikke oppgrader nå, lag en plan) · **drift** (rollback,
logging, backup — og om restore faktisk er testet) · **kommersiell risiko**
(kostnad per AI-kall og per prediksjon ved 1 000, 10 000 og 100 000 brukere, med
antakelsene skrevet ut).

---

## Del 7 — Prøv å rive ned dine egne funn

Sju av 39 funn forrige gang var ikke sanne. Det er verre enn å bomme: det koster
tid å avvise dem, og det gjør resten mindre troverdig.

For hvert **Kritisk** og **Høy**-funn, før det skrives:

1. Formuler den sterkeste grunnen til at funnet er **feil**.
2. Sjekk den grunnen i koden eller mot data.
3. Overlever funnet, skriv ned hva du forsøkte. Gjør det ikke, forkast det.

Måter et funn viser seg å være feil på, alle med presedens herfra:

- Det er allerede rettet i en nyere commit.
- Det var **aldri sant** — funksjonen fantes i commiten som ble revidert.
- Henvisningen peker på en fil eller linje som ikke finnes.
- Kodestien er død — ingen kaller den.
- Det finnes en vakt lenger oppe i kallkjeden.
- Funnet hviler på en lesning av markedsføringsteksten som teksten ikke sier.
- Symptomet kommer fra testoppsettet, ikke fra appen.
- Det ble observert mot en preview bak Vercel-SSO, ikke mot appen.
- Filene i den «lekkende» bøtta er null.

De to siste er feil jeg selv rapporterte og måtte trekke tilbake samme dag.

---

## Del 8 — Hva vi ikke kan vite

Egen seksjon, ikke en fotnote. For hvert punkt: hva det er, hvorfor det ikke kan
avgjøres herfra, **hvem** som kan avgjøre det, og hva konsekvensen er hvis det
viser seg å være galt.

### Krever soppsakkyndig

Dette er ikke teoretisk: ved gjennomgang av eksisterende svenske artsnavn viste
**fire av 26** seg å være feil, og tre av dem var navnet på en *annen* art.

- Biologisk korrekthet i artskatalogen (72 arter). *Hvis galt: en bruker spiser
  feil sopp. Den ene feilklassen i appen som kan drepe.*
- Symptom- og latenstidsbeskrivelser for giftige arter. *Hvis galt: feil latenstid
  kan få en forgiftet bruker til å utsette legekontakt — nøyaktig det teksten skal
  hindre.*
- Fullstendigheten i forvekslingsgrafen. *Hvis galt: en bruker får forslag på en
  spiselig art uten å se advarselen om den dødelige tvillingen, fordi paret aldri
  ble lagt inn. Systemet vil se ut som det virker.*
- At artsbildene faktisk viser riktig art.
- Kindwises reelle treffsikkerhet på nordiske arter.

### Krever jurist

- Om ansvarsfraskrivelsen i vilkårene holder. *Hvis galt: eieren hefter
  personlig — ØVERÅS APPS er et ENK, ikke et AS.*
- GA4 og overføring til USA.
- Om jitteren på «omtrentlig» er tilstrekkelig anonymisering. *Et posisjonslekk
  er meldepliktig etter art. 33.*
- Bildeattribusjon og lisenssmitte.
- Markedsføringen av det romlige signalet. *Hvis galt: krav om tilbakebetaling
  fra alle som kjøpte for «hvor»-funksjonen.*

### Krever eieren

- **Ansvars- og produktansvarsforsikring.** *Ett erstatningskrav etter forgiftning
  treffer privatøkonomien direkte. Dette er den største enkeltrisikoen ved å
  lansere som ENK.*
- Databehandleravtaler for hver underleverandør.
- Alt bak innlogging, og alt på fysisk iPhone.

### Krever tid

Om prediksjonene stemmer kan bare måles mot ekte funn over en hel sesong.

---

## Del 9 — Lanseringsbeslutningen

Erstatter poengtabellen. En kolonne med «6/10» ser presis ut og kan ikke
etterprøves.

Gi i stedet, per flate: **Klar** (verifisert med teknikk N — skriv hvilken) ·
**Klar med kjent begrensning** (hva, og hvem som bærer den) · **Blokkerer** (hva
som må fikses, og hvor lenge det tar).

Så en samlet anbefaling med **navngitte** blokkeringer. Ikke «trenger mer
arbeid» — en liste med et tall foran.

**Ramme beslutningen i den faktiske situasjonen:**

- Web-appen er **allerede live** med betalende kunder. Enhver feil du finner
  rammer noen **i dag**, ikke ved en fremtidig lansering.
- Det som skal lanseres er **App Store-innsendingen**. Det som stopper en
  Apple-review eller rammer en betalende kunde slår alt annet.
- Det er **august**. Soppsesongens topp er nå. Et funn som tar tre uker å fikse
  koster en sesong. Skriv den avveiningen ut i stedet for å skjule den i en
  prioriteringstabell.

---

## Del 10 — Leveranser

**Ikke overskriv de fire eksisterende rapportene.** De er historikk, og
karaktersettingen i del 4 gir dem verdi som sammenligningsgrunnlag.

| Fil | Innhold |
|---|---|
| `docs/lanseringsrevisjon-funn.md` | Alle funn, sortert etter alvorlighet. |
| `docs/lanseringsrevisjon-inventar.md` | De fem inventarene fra del 5. |
| `docs/lanseringsrevisjon-beslutning.md` | Del 8 og 9: hva vi ikke vet, og klar/blokkerer per flate. |

Legg en linje øverst i hver av de fire gamle rapportene om at de er avløst, med
dato. Ikke slett dem.

Hvert funn skal ha: alvorlighetsgrad · tittel som sier hva som er galt, ikke
hvilket område det gjelder · **kontrollert** fil:linje · **hvilken teknikk fra
del 2 som beviste det, og hva den ga** · hva som skjer for en bruker · hva
motbevisforsøket ga (kritisk og høy) · konkret tiltak · estimert innsats · før
beta / før innsending / etterpå.

**Kritisk:** datalekkasje · uautorisert tilgang · betalingsfeil · eksponerte
hemmeligheter · noe som kan bidra til soppforgiftning · tap av brukerdata ·
produksjonsstopp.
**Høy:** alvorlig auth-feil · private posisjoner kan eksponeres · premium kan
omgås · prediksjoner fremstilt misvisende · kritisk brukerflyt virker ikke ·
GDPR-kjernekrav mangler.
**Middels:** svak feilhåndtering · ytelse · manglende test som ville fanget en
reell feilklasse · tilgjengelighet · inkonsistent UX.
**Lav:** navngivning · opprydding · kosmetikk.

---

## Del 11 — Etterpå: fiksefasen

Rapporten er ikke målet. En app som tåler lansering er målet.

1. Eieren velger hva som fikses og i hvilken rekkefølge.
2. Én ting per PR, med **sveip etter søsken** — samme gale antakelse andre
   steder. Vanen har bevist seg gjentatte ganger: den svenske blanke-kart-feilen
   hadde et søsken i Göteborg-rutingen, og artsstablingen på kartet hadde et
   søsken i snittberegningen server-side.
3. Verifiser hver fiks med teknikken som fant feilen — ikke en svakere.
4. Deploy først når eieren sier ok.
5. Etter deploy: verifiser mot **produksjon**, ikke preview. Før i
   `docs/reports/deploys.md`.
6. Når listen er tom: kjør del 2-verifiseringene på nytt. En fikset app er ikke
   en verifisert app.

---

## Vedlegg — fallgruver som har kostet tid her før

- **iCloud-dupefiler** (`* 2.ts`) gir falske `tsc`-feil. Rydd før verifisering.
- **Turbopack kjører ikke middleware i dev.**
- **Ingen staging.** Dev-serveren snakker med produksjons-Supabase.
- **CLAUDE.md er delvis utdatert** (antall migrasjoner, CSP-status, enkelte
  kolonner). Orientering, ikke fasit.
- **Artsnavn kommer fra databasen, ikke fra meldingskatalogen.** En oversatt
  ramme rundt et norsk artsnavn er fortsatt en feil.
- **Server-generert tekst dekkes ikke av next-intl.** Språket må tres inn
  eksplisitt, og hvis ruta cacher, må språket inn i cache-nøkkelen.
- **`getSpeciesDisplayName` faller stille tilbake til norsk.** En manglende
  svensk verdi gir norsk tekst, ikke en feil — den er usynlig i test.
- **`npm run qa` åpner aldri popups.** Grønn QA beviser ikke at det brukeren
  klikker på virker.
