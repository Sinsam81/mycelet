# GPX-import av veipunkter — design til beslutning

**Status: BYGGET etter modell (c). Sindre valgte anbefalingen på alle fire
spørsmålene 26. august 2026. Eneste gjenstående steg før den virker i prod:
kjør `supabase/migrations/055_saved_places.sql` i Supabase SQL Editor
(se `docs/migrasjoner-a-kjore.md`).**

Levert: `saved_places` (migrasjon 055) · GPX-lesing i nettleseren
(`src/lib/gpx/les-gpx.ts`) · validering delt mellom klient og rute
(`src/lib/steder/veipunkt.ts`) · `/api/me/steder` (import, omdøping, sletting,
angre hele importen) · «Steder du har markert» og importknapp på `/mine-steder`
· eget kartlag med «Jeg fant sopp her» · stedene med i GPX-eksporten, i
GDPR-eksporten og i slettekvitteringen.

Avgjørelsen på spørsmål 4 ble som anbefalt: tabellen er BYGGET så «parkert
bil» får plass senere (`source`-kolonnen), men v1 gjør ikke noe med den.

Resten av dokumentet er beslutningsgrunnlaget slik det ble lagt fram, beholdt
som det var — det forklarer hvorfor modellen ble som den ble.

Importen sto igjen fra stjelelista («GPX-eksport/import av Mine steder», fra
Svampguiden+), etter at eksporten var levert. Poenget med importen er ikke
filformatet — det er **byttespaken**: en svenske med 200 soppsteder i
Svampguiden+ kan ta dem med seg til Mycelet i stedet for å begynne på null.

Men det fantes ingen «steder»-tabell i basen. Derfor måtte ett produktvalg tas
før noe kunne bygges: **hva BLIR et importert veipunkt i Mycelet?**

---

## 1. Hva et veipunkt faktisk er

Et `<wpt>` i en GPX-fil har: koordinat, navn, valgfri beskrivelse, valgfritt
tidspunkt, valgfritt symbol. Det er alt.

Det er ikke det samme som et funn hos oss. Et `findings`-rad hos Mycelet bærer
art, dato for observasjonen, værsnapshot, habitat-tagger, synlighet, og teller
i brukerens statistikk. Et importert veipunkt har typisk **ingen art**, og
tidspunktet er som regel når nåla ble satt — ikke når soppen sto der. En del av
punktene i en ekte fil er dessuten ikke sopp i det hele tatt: «Parkering»,
«Hytta», «Bom».

Kort sagt: brukeren tar med seg et **stedsbibliotek**, ikke en observasjonslogg.

---

## 2. Tre kandidater

### (a) Private funn — `findings` med `visibility='private'`, art = null, navn i `notes`

**For:** null ny infrastruktur. Punktene dukker opp gratis i «Kun mine funn» på
kartet, på `/mine-steder`, i GPX-eksporten, i GDPR-eksporten, og de synkes til
telefonen fordi de ligger i basen.

**Imot — fire konkrete problemer, alle verifisert i koden:**

1. **Skrivelinja har ikke noe stedsnavn-felt.** `parseFindingRequest`
   (`src/lib/findings/request.ts`) kjenner ikke `location_name`. Kolonnen LESES
   fire steder (`src/app/page.tsx:102`, `src/app/mine-steder/page.tsx:111`,
   `src/app/profile/page.tsx:78`, `src/app/api/me/gpx/route.ts:60`) men SKRIVES
   ingen steder i appen — den er død i praksis i dag. Uten å utvide skrivelinja
   havner «Kantarellskogen» nede i `notes`, og `/mine-steder` grupperer
   importen i 1 km-bøtter med etiketten «Nær 59.123, 10.456». Navnene er hele
   verdien i en import; å miste dem er å miste importen.
2. **Funn-ruta stempler dagens vær på et gammelt veipunkt.**
   `/api/findings` slår opp vær og skogdata live per innsetting
   (`src/app/api/findings/route.ts:50-56`). En import av 200 punkter blir 200
   eksterne oppslag, mot en ratelimit på 20/min — og det som lagres er været i
   dag, på en nål fra 2019. Det er direkte gale data i den tabellen modellen og
   feltkonteksten leser.
3. **Statistikken blåses opp.** Både forsida (`src/app/page.tsx:159`) og
   `get_user_stats` (migrasjon 029, linje 97) teller ALLE egne funn, også
   private. Etter en import står det «312 funn, 4 arter» hos en bruker som har
   funnet sopp tolv ganger. Det er tallet appen bruker til å fortelle brukeren
   hvem hen er.
4. **Det finnes ingen angrevei.** RLS tillater sletting (migrasjon 001, linje
   333), men **ingen rute og ingen knapp i hele appen sletter et funn** —
   verifisert: `/api/findings` har bare `POST`, og ingen `.delete()` på
   `findings` finnes i `src/`. En feilimport av 500 punkter er permanent, og
   den eneste utveien er å slette hele kontoen.

Det finnes en variant: legg til `source='gpx_import'` på `findings` og filtrer
den bort i statistikk. Da bygger man i praksis modell (c) inne i funn-tabellen,
og hvert eneste framtidige oppslag på `findings` (14+ steder i dag) må huske
flagget. Én tabell med to betydninger er nettopp fella her.

**Personvernet er derimot i orden i (a):** prediksjonsfallbacken leser
`get_findings_in_bounds` → `public_findings`, som kun har `public` og
`approximate` (`src/app/api/prediction/route.ts:562`). Private importer ville
ikke lekket inn i modellen eller til andre brukere.

### (b) Eget visningslag i klienten (localStorage)

**For:** billigst, ingen migrasjon, null risiko for basen, og fullt reversibelt
— «Fjern importen» er én `removeItem`.

**Imot:** det gjør ikke jobben importen finnes for. Lagringen forsvinner ved
reinstall, ved bytte av telefon, ved tømming av nettleserdata, og den følger
ikke brukeren mellom web og app. I app-skallet (Capacitor mot
www.mycelet.com) er weblagring dessuten noe systemet kan rydde bort — vi vet
allerede at den til og med kan være **helt blokkert**, det er hele grunnen til
at `src/lib/utils/safe-storage.ts` finnes. En svenske som flytter 200 steder
inn og mister dem etter en oppdatering, har fått et argument for å gå tilbake,
ikke for å bli. Det er byttespaken i revers.

### (c) Ny tabell `saved_places` med eier-RLS  ← **anbefalt**

Et sted er en egen ting: koordinat + navn + notat, uten art, uten
observasjonsdato, uten værsnapshot og uten delingsmodell.

**For:**
- **Riktig semantikk.** Ingen falske funn, ingen forurenset statistikk, ingen
  feil værdata. Sida heter allerede «Mine steder», men har til nå ikke hatt noe
  sted-begrep — den utleder «steder» fra funn. Dette gir ordet innhold.
- **Sterkere personvern enn funn.** Ingen offentlig view, ingen
  `display_location`-trigger, ingen synlighetsvalg som kan feilklikkes: et sted
  er privat *ved konstruksjon*, ikke ved standardvalg. Hemmelige soppsteder er
  akkurat det folk er reddest for å dele.
- **Sletting er gratis å bygge her.** Ny tabell, ny CRUD — slett per sted og
  «angre hele importen» kan ligge i samme leveranse. Det er svaret på det
  farligste ved (a).
- **Plass til det som kommer.** «Parkert bil»-markøren og egne nåler på kartet
  står allerede på stjelelista fra tre konkurrenter. De hører hjemme her, ikke
  i funn-tabellen.
- **Overlever alt.** Base, ikke nettleser: reinstall, telefonbytte, web ↔ app.

**Imot:** én migrasjon, ett nytt kartlag, én ny seksjon på `/mine-steder`, og
eksport-ruta må utvides for å få rundturen (inn → ut) komplett. Det er reelt
mer arbeid enn (a) — anslagsvis halvannen gang så mye — men det meste av det
ekstra er slettefunksjonen, som uansett må finnes før en import er forsvarlig.

---

## 3. Anbefaling

**Bygg (c): `saved_places`, med sletting og «angre import» i samme leveranse.**

Begrunnelsen i én setning: (a) er billigst å skrive og dyrest å ta feil i —
den skriver uslettbare rader med feil vær og feil semantikk inn i tabellen som
hele produktet hviler på — og (b) er trygg, men gjør ikke jobben, fordi et
stedsbibliotek som fordamper ved reinstall aldri blir en grunn til å bytte app.

Hvis budsjettet uansett ikke rekker til (c) nå, er riktig rekkefølge å **utsette
importen**, ikke å ta (a). Importen er en middels-stor spak; å reparere 500
feilimporterte funn uten slettefunksjon er en liten katastrofe.

---

## 4. Slik ser (c) ut i praksis

**Tabellen** (migrasjon 055):

```
saved_places
  id, user_id → profiles (cascade)
  name            text  (påkrevd, kappes til 120 tegn)
  note            text  (fra <desc>, kappes til 500)
  latitude, longitude
  waypoint_time   timestamptz null   -- <time> fra fila, for eksport tilbake
  source          text  ('manual' | 'gpx_import')
  source_file     text null          -- filnavnet, så importen kan navngis
  import_batch_id uuid null          -- én import = én angreknapp
  created_at, updated_at
```

RLS: eier-only på alle fire verb (`auth.uid() = user_id`). Ingen anon-tilgang,
ingen offentlig view, aldri med i noe aggregat eller i modellen.

**Flyten:**

1. Brukeren velger fil (`<input type="file">` — samme mønster som
   bildeopplastingen i `src/app/identify/page.tsx:284`, ingen nytt native-bygg
   nødvendig).
2. **Fila parses i nettleseren med `DOMParser`, aldri på serveren.** Serveren
   ser bare ferdig validert JSON. Det er både sikrere (se punkt 5) og bedre
   feilmeldinger: en ødelagt fil feiler på brukerens egen enhet.
3. **Forhåndsvisning før noe skrives** — dette er den viktigste skjermen:
   «Fant 143 veipunkter. 12 ligger nærmere enn 25 m fra et sted du har fra før
   og hoppes over. Fila inneholder også en sporlogg (4 812 punkter) — den
   importeres ikke.» Brukeren ser navnene og trykker «Importer 131 steder».
   Ingenting lagres før det trykket.
4. `POST /api/me/steder/import` med den validerte lista → én bulk-insert med
   felles `import_batch_id`. Serveren validerer alt på nytt (klienten er aldri
   å stole på).
5. Kvittering + «Angre importen» (sletter batchen). Etterpå: slett per sted, og
   «slett alle N steder fra denne importen» på `/mine-steder`.

**Hvor de vises:**
- `/mine-steder`: egen seksjon «Steder du har markert», over funn-stedene, med
  endre navn / slett.
- Kartet: eget lag med en **tydelig annerledes nål** enn soppmarkørene — et
  markert sted skal aldri kunne forveksles med et funn eller med varselet.
- Per sted: «Jeg fant sopp her» → åpner `AddFindingSheet` med koordinatet
  ferdig utfylt. Det er broen fra importert sted til ekte funn, og den holder
  de to begrepene rene.
- `/api/me/gpx`: stedene blir med i eksporten med eget `<sym>`, så rundturen er
  komplett — inn fra Svampguiden+, ut igjen når som helst. Det er samme
  ærlighetslinje som eksporten allerede står på.

---

## 5. Sikkerhet, tak og misbruk

XML fra en vilkårlig fil er angrepsflate. Tiltakene, i rekkefølge:

- **Ingen XML-parsing på serveren.** `DOMParser` i nettleseren følger ikke
  eksterne entiteter (XXE er utelukket), og filen når aldri infrastrukturen vår
  eller loggene. Serveren tar imot JSON og ingenting annet.
- **Størrelsestak før parsing:** avvis filer over ~5 MB med en klar melding.
  Sporlogger blir fort titalls MB, og 20 000 punkter i React-state tar ned en
  eldre telefon.
- **Kun `<wpt>`.** `<trk>` og `<rte>` ignoreres helt i v1 — men det skal STÅ i
  forhåndsvisningen at fila inneholdt en sporlogg som ikke ble importert. Stille
  avkorting leses som datatap.
- **Antallstak:** maks 500 veipunkter per import, og et totaltak per bruker
  (foreslått 1 000 steder) håndhevet av en **trigger i basen**, ikke bare i
  ruta. Presedensen finnes: migrasjon 053 gjør nøyaktig dette for
  varselabonnement, fordi tabellen også kan nås direkte via PostgREST med
  authenticated-rollen. Uten trigger er taket i ruta bare en høflig anmodning.
- **Feltvalidering:** lat/lon innenfor gyldig område (ugyldige punkter
  forkastes og telles i kvitteringen), navn og notat kappes, kontrolltegn under
  U+0020 fjernes — samme rensing som `escapeXml` i eksporten allerede gjør,
  ellers kommer et innlimt Word-tegn tilbake og knekker vår egen eksport.
- **Ratelimit** på importruta (foreslått 5/time/bruker), i tillegg til taket.

## 6. Personvern

- Stedene er hemmelige soppsteder. Eier-RLS, ingen offentlig view, aldri i
  prediksjonsmodellen, aldri i noe aggregat.
- `saved_places` må legges til i **GDPR-eksporten** (`/api/me/export`) og telles
  i kvitteringen fra **kontosletting** (`/api/me/delete`) — FK-cascade tar
  radene, men tallet i kvitteringen må stemme.
- Ingen ny databehandler: fila leses lokalt, ingenting sendes ut av appen.
  Personvernerklæringa trenger ikke endring.

## 7. Ikke med i v1

- Sporlogger (`<trk>`) — eget backloggpunkt, egen datamodell.
- «Åpne i Mycelet» fra delingsmenyen på iOS — krever dokumenttyper i
  `Info.plist` og dermed et nytt native-bygg. Filvelgeren dekker behovet:
  Svampguiden+ eksporterer til Filer, og brukeren plukker den derfra.
- Import av ANDRES funn eller av offentlige datasett. Importen er brukerens
  egne data om egne steder — ikke noe annet.

## 8. Spørsmål Sindre må svare på

1. **(a), (b) eller (c)?** Anbefalingen er (c).
2. **Skal importen være gratis?** Anbefaling: ja, som eksporten. Det er
   brukerens egne data, og en betalingsmur foran selve byttespaken dreper
   spaken.
3. **Totaltak per bruker: 1 000 steder** — greit tall?
4. **Skal `saved_places` også bli hjemmet til «parkert bil»-markøren** (fra
   stjelelista), eller holder vi importen ren i v1?
