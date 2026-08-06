# App Store-metadata for Mycelet

Alt innhold klart til å limes inn i App Store Connect. Utarbeidet 2026-06-12.
Status: fase 1 (avtaler/bank/skatt) påbegynt — se nederst for Sindres sjekkliste.

## App-informasjon

| Felt | Verdi |
|---|---|
| Navn | `Mycelet` |
| Undertittel (maks 30 tegn) | `Soppkart, AI og sesongvarsler` |
| Bundle ID | `no.mycelet.app` (ligger allerede i capacitor.config.ts) |
| SKU | `mycelet-ios` — ⚠️ appen ER ALLEREDE OPPRETTET (ASC app-id `6784672944`, status «Prepare for Submission»). Ikke lag en ny. Doket sa tidligere `mycelet-ios-001`; det var aldri SKU-en som faktisk ble brukt. |
| Primær kategori | Vær og friluftsliv → **Lifestyle** (alt: **Reference**) |
| Sekundær kategori | **Food & Drink** |
| Tilgjengelighet | Norge + Sverige (utvid senere ved behov) |
| Aldersgrense | **12+** — appen har forum med brukerskapt innhold. Se aldersvurdering under. |
| Pris på selve appen | Gratis (inntekter via abonnement) |
| Support-URL | `https://www.mycelet.com/kontakt` — Apple krever en side der brukeren finner KONTAKTINFO. `/sikkerhet` er soppfaglige råd, ikke support. |
| Markedsførings-URL (valgfri) | `https://www.mycelet.com` |
| Personvern-URL | `https://www.mycelet.com/personvern` |
| Copyright | `© 2026 ØVERÅS APPS (org.nr 937 880 871)` |

## Beskrivelse (norsk)

> ⚠️ **Beskrivelsen må matche det appen FAKTISK gjør.** Apples regel 2.3 handler om
> nøyaktig metadata, og en reviewer som leter etter en lovet funksjon og ikke finner
> den, avviser. Teksten under lovet tidligere «Del funn og bilder i forumet» og
> «Sopptur-modus» — begge står bak feature-flagg satt til `false`
> (`src/lib/flags.ts`), og forumfanen er fjernet fra bunnmenyen. De er strøket.
>
> **Skrur du på et flagg igjen, må teksten oppdateres samtidig.** Det finnes en test
> som vokter dette: `src/lib/__tests__/app-store-metadata.test.ts`.

```
Mycelet er sopplukkerens beste turvenn — laget for norske og svenske skoger.

FINN SOPPEN
• Soppkart med over 400 000 registrerte funn, fargekodet etter spiselighet
• «Lovende steder» — prediksjon basert på ekte skogdata, vær og sesong peker på
  steder som ser mest lovende ut akkurat nå
• Dagens soppforhold: én score som forteller om det er en god soppdag

IDENTIFISER TRYGT
• AI-soppkjenner: ta bilde, få artsforslag med treffsikkerhet
• Tydelige advarsler for giftige forvekslingsarter på hver art
• Artsbibliotek med over 75 arter, sesongkalender og kjennetegn
• Viktig: Mycelet erstatter aldri soppkontroll — vi lenker alltid til
  Soppkontrollen og Giftinformasjonen (22 59 13 00)

MED DEG UT I SKOGEN
• Lagre egne funn med kamera og GPS, rett der du står
• Mine steder: finn tilbake til plassene som leverte i fjor
• Du bestemmer hvor synlig hvert funn er — offentlig, omtrentlig eller privat

PREMIUM (valgfritt abonnement)
• Ubegrenset AI-identifikasjon (gratis: 5 per døgn)
• Full prediksjon — lovende steder nær deg
• Offline-kart for områder uten dekning

Personvern først: bildene dine renses for GPS-data før opplasting, og du
bestemmer selv hvor synlige funnene dine er. Data lagres i EU.

God soppjakt!
```

## Nøkkelord (maks 100 tegn)

```
sopp,sopptur,soppkart,kantarell,steinsopp,soppkontroll,soppbok,skog,friluftsliv,svamp,svampkarta
```

## Reklametekst / Promotional text (maks 170 tegn, kan endres uten ny review)

```
Soppsesongen er i gang! Sjekk dagens soppforhold, se lovende steder nær deg
og identifiser funn med AI — trygt, norsk og laget for skogen.
```

## Skjermbilder (krav: 6,9-tommer — iPhone 17 Pro Max-simulator, 1320×2868)

Plan (5–6 stk, i denne rekkefølgen):
1. Forsiden med «Soppforhold i dag»-måleren
2. Kartet med funn-klynger og «Lovende steder»
3. AI-identifisering (resultatside med artsforslag)
4. Artsdetalj med fareadvarsel (viser sikkerhetsfokuset)
5. Sesongkalenderen
6. (Valgfri) Forum/fellesskap

Tas med `xcrun simctl io booted screenshot` fra simulatoren. RÅ skjermbilder
holder for innsending; polerte rammer/tekst kan legges på senere.

## Aldersvurdering — svar på Apples spørsmål

> ⚠️ **Rettet 2026-08-05. Det gamle svaret var 4+, og det ville ikke holdt.**
> Appen har forum med brukerskapte innlegg, kommentarer og bildeopplasting
> (`src/app/forum/`). Apples skjema har egne spørsmål om nettopp dette, og et
> 4+-svar for en app med UGC blir enten overstyrt av Apple eller brukt som
> avvisningsgrunn. Våre egne vilkår sier dessuten **13 år** som minstealder for
> konto — det motsier 4+ direkte.
>
> At forumfanen er skjult i navigasjonen (`flags.ts: forumInNav = false`) endrer
> ingenting: `/forum` er fortsatt nåbar på URL, og innholdet finnes i appen.
> Svar på hva appen KAN, ikke på hva som er lett å finne.

Innholdskategorier (vold, gambling, rus, seksuelt innhold osv.): **None** — alle.

Spørsmålene som faktisk gjelder oss:

| Apples spørsmål | Svar | Hvorfor |
|---|---|---|
| Unrestricted Web Access | **No** | Appen er låst til egne domener via `WKAppBoundDomains`; eksterne lenker åpnes i systemnettleseren |
| Medical/Treatment Information | **No** | Giftinformasjonens nummer er en sikkerhetshenvisning, ikke medisinsk rådgivning |
| **User Generated Content** | **Yes** | Forum, kommentarer og bildeopplasting |
| ├ Moderering før publisering | **Yes** | Innholdsfilter kjører før innlegg lagres |
| ├ Rapportering av innhold | **Yes** | Rapportknapp på innlegg og kommentarer |
| ├ Blokkering av brukere | **Yes** | Bygget for Apple-krav 1.2 |
| └ Kontaktinfo til utvikler | **Yes** | `/kontakt` med post@mycelet.com |

→ Resultat: **12+**

**Dette er en styrke, ikke en svakhet.** Apples 1.2-krav for UGC-apper er
moderering, rapportering, blokkering og kontaktinfo — vi har alle fire. Å svare
ærlig «Yes» og vise de fire mekanismene er langt tryggere enn å svare «No» og la
reviewer finne forumet selv.

## App Privacy («nutrition labels») — svar

Tracking (på tvers av apper/ATT): **NEI** — ingen sporing, ingen annonser.

> **NB (2026-07-29):** Google Analytics 4 er lagt til på **web-versjonen**, men er
> bevisst skrudd AV i den native appen (`NonNativeOnly` rundt `<Analytics/>` og
> `<CookieNotice/>` i `src/app/layout.tsx`). App Store-bygget sender altså ingen
> analysedata, og App Privacy-svarene under er fortsatt korrekte. Ikke fjern
> denne gatingen uten samtidig å oppdatere App Privacy i App Store Connect
> (Usage Data → Product Interaction).

Data som samles inn — **åtte** datatyper, ingen til tracking. De seks første er
«Linked to you», de to siste er «**Not** Linked to You»:

| Datatype | Kobling | Formål |
|---|---|---|
| Contact Info → Email Address | Linked | Kontoopprettelse |
| User Content → Photos | Linked | Soppbilder (funn/forum/AI-id). GPS-strippes før opplasting |
| User Content → Other User Content | Linked | Funn, innlegg, kommentarer |
| Location → Precise Location | Linked | Kart, funnregistrering, prediksjon (kun når bruker tillater) |
| Identifiers → User ID | Linked | Kontodrift |
| Purchases → Purchase History | Linked | Abonnementsstatus (når IAP er aktiv) |
| Diagnostics → Crash Data | **Not Linked** | Feilrapportering (Sentry) |
| Diagnostics → Other Diagnostic Data | **Not Linked** | Brødsmuler før en krasj (Sentry) |

Ikke samlet: Usage Data, Browsing History, Contacts, Financial Info
(betalingskort håndteres av Apple/Stripe, aldri av oss).

> **NB (2026-08-06):** De to Diagnostics-radene kom med Sentry. At de kan stå som
> «Not Linked to You» er ikke en antakelse — det hviler på tre ting som alle må
> holdes ved like samtidig:
>
> 1. **«Prevent Storing of IP Addresses» er skrudd PÅ** i Sentry-organisasjonen
>    (Settings → Security & Privacy). En IP-adresse er en identifikator; uten
>    denne er «Not Linked» usant.
> 2. **Rensingen i `src/lib/sentry/scrub.ts`** fjerner bruker, cookies, headere,
>    query-strenger og kartfliser fra både hendelser og brødsmuler — i alle tre
>    runtimene. Vokternes tester ligger i `src/lib/sentry/__tests__/scrub.test.ts`
>    og `src/lib/__tests__/sentry-personvern.test.ts`.
> 3. **Ingen tracing.** `tracesSampleRate` settes bevisst ikke. Skrur du den på,
>    blir det «Performance Data», som IKKE er erklært — da må denne tabellen og
>    App Store Connect oppdateres i samme slengen.
>
> Manifestet i `ios/App/App/PrivacyInfo.xcprivacy` må stemme med tabellen over.
> `NSPrivacyTrackingDomains` skal være TOM: Apple blokkerer nettverkskall til
> domener som står der når ATT-tillatelse mangler — feilrapporteringen ville dødd
> stille.

## Abonnementer (IAP) — opprettes i App Store Connect → Subscriptions

**Subscription Group:** `Mycelet Premium` (én gruppe, begge produkter på samme nivå)

> ✅ **ALLEREDE OPPRETTET 2026-07-27** — ikke lag dem på nytt. Produkt-ID-ene under
> er de faktiske, og de kan ikke endres i App Store Connect etter opprettelse.
> Koden er enig: `src/lib/billing/revenuecat.ts` bruker nøyaktig disse to som
> standardverdier bak `REVENUECAT_PRODUCT_*`. (Dette dokumentet oppga tidligere
> `no.mycelet.app.…` — med `.app.` — i strid med `docs/launch-critical-path.md`.)

| Felt | Produkt 1 | Produkt 2 |
|---|---|---|
| Referansenavn | `Premium månedlig` | `Sesongpass årlig` |
| Produkt-ID | `no.mycelet.premium.monthly` | `no.mycelet.seasonpass.yearly` |
| Varighet | 1 måned | 1 år |
| Pris (Norge) | **79 NOK** (velg nærmeste prispunkt) | **249 NOK** (velg nærmeste prispunkt) |
| Visningsnavn (nb-NO) | `Premium` | `Sesongpass` |
| Beskrivelse (nb-NO) | `Ubegrenset AI-identifikasjon, full prediksjon og offline-kart.` | `Alle Premium-fordeler hele året — fornyes årlig.` |

NB: Apple tar 15 % (Small Business Program, søk om det — gratis, krever <1 M USD/år)
ellers 30 %. Web-priser via Stripe påvirkes ikke.

## Review-notater til Apple (limes inn på engelsk ved innsending)

```
Mycelet is a mushroom foraging companion for Norway and Sweden: a map of
mushroom observations, AI-assisted species identification (with prominent
safety warnings and links to official mushroom inspection services), a season
calendar and a small community forum.

The app uses native camera (species identification), native geolocation
(map and finds) and supports offline use. All content is in Norwegian.

Demo account for review (opprettet 2026-07-29, aktivt sesongpass til 2028-01-01):
  Email: applereview@mycelet.com
  Password: se App Store Connect → App Review Information
The demo account has an active premium entitlement so all features are testable.

Safety note: the app never tells users a mushroom is safe to eat — every
identification result shows a warning and refers to official inspection
services (Soppkontrollen) and the national Poison Information hotline.
```

## Sindres fase-1-sjekkliste (Agreements, Tax & Banking)

1. Logg inn på **https://appstoreconnect.apple.com** (Apple-ID-en din)
2. Klikk **Business** (evt. «Agreements, Tax, and Banking»)
3. **Paid Apps Agreement** → Accept (privatperson — ingen org-nr trengs)
4. **Bank:** DNB, samme konto som Stripe bruker. Kontonummeret står i
   passordbehandleren og hos Stripe — det skal ikke stå her, se notatet nederst.
   Kontoinnehaver Sindre Alstad Øverås, valuta NOK
5. **Skatt:** W-8BEN-veiviser → privatperson, bosatt i Norge, «No US activities».
   Adresse: Liaveien 21 A, 1459 Nesodden
6. Apple bruker vanligvis 1–3 dager på å godkjenne bankinfoen — resten av
   arbeidet går parallelt og blokkeres ikke av dette

## Gjenstår etter fase 1 (rekkefølge)

- [ ] RevenueCat-konto (gratis) + koble produktene → SDK-nøkler
- [ ] [Claude koder] `@revenuecat/purchases-capacitor` + kjøps-UI (native) +
      RevenueCat-webhook → `billing_subscriptions` (samme premium-logikk som Stripe)
- [ ] Sandbox-test av kjøp på ekte iPhone
- [ ] Demo-bruker til Apple-review (med premium)
- [ ] Skjermbilder + lim inn metadata fra dette dokumentet
- [ ] Arkiver i Xcode (GUI, pga iCloud-codesign-fella) → last opp → send til review

## Hemmeligheter hører ikke hjemme i denne fila

Passordet til `applereview@mycelet.com` sto i klartekst i denne fila fra
30. juli til 1. august 2026. **Repoet er offentlig.** Passordet er derfor
kompromittert og må byttes, uansett hva som gjøres med git-historikken.

Kontonummeret (IBAN) sto samme sted og er nå fjernet på samme måte. Et
kontonummer er ikke en hemmelighet på linje med et passord — det står på enhver
faktura — men det hører ikke hjemme i et offentlig repo, og fjernes gratis.

Passordet skal ligge to steder, og bare der:

1. **App Store Connect → App Review Information → Sign-In Information.**
   Det er stedet Apple faktisk leser det fra. De trenger det ikke i repoet.
2. Passordbehandleren din.

Historikken inneholder det fortsatt (commit `34060c4`, `0b3a54f`, `d7ea3b5`).
Å skrive om offentlig historikk er en egen operasjon med egne bivirkninger, og
hjelper uansett ikke mot noen som allerede har lest det. Bytt passordet først.
