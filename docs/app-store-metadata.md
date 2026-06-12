# App Store-metadata for Mycelet

Alt innhold klart til å limes inn i App Store Connect. Utarbeidet 2026-06-12.
Status: fase 1 (avtaler/bank/skatt) påbegynt — se nederst for Sindres sjekkliste.

## App-informasjon

| Felt | Verdi |
|---|---|
| Navn | `Mycelet` |
| Undertittel (maks 30 tegn) | `Soppkart, AI og sesongvarsler` |
| Bundle ID | `no.mycelet.app` (ligger allerede i capacitor.config.ts) |
| SKU | `mycelet-ios-001` |
| Primær kategori | Vær og friluftsliv → **Lifestyle** (alt: **Reference**) |
| Sekundær kategori | **Food & Drink** |
| Tilgjengelighet | Norge + Sverige (utvid senere ved behov) |
| Aldersgrense | 4+ (ingen flagg utløses — se aldersvurdering under) |
| Pris på selve appen | Gratis (inntekter via abonnement) |
| Support-URL | `https://www.mycelet.com/sikkerhet` (evt. egen /support-side senere) |
| Markedsførings-URL (valgfri) | `https://www.mycelet.com` |
| Personvern-URL | `https://www.mycelet.com/personvern` |
| Copyright | `© 2026 ØVERÅS APPS (org.nr 937 880 871)` |

## Beskrivelse (norsk)

```
Mycelet er sopplukkerens beste turvenn — laget for norske og svenske skoger.

FINN SOPPEN
• Soppkart med over 185 000 registrerte funn, fargekodet etter spiselighet
• «Beste steder» — prediksjon basert på ekte skogdata, vær og sesong viser
  hvor sjansene er størst akkurat nå
• Dagens soppforhold: én score som forteller om det er en god soppdag

IDENTIFISER TRYGT
• AI-soppkjenner: ta bilde, få artsforslag med treffsikkerhet
• Tydelige advarsler for giftige forvekslingsarter på hver art
• Artsbibliotek med over 70 arter, sesongkalender og kjennetegn
• Viktig: Mycelet erstatter aldri soppkontroll — vi lenker alltid til
  Soppkontrollen og Giftinformasjonen (22 59 13 00)

BLI MED I FELLESSKAPET
• Del funn og bilder i forumet (posisjonen din deles aldri mer presist
  enn du selv velger — offentlig, omtrentlig eller privat)
• Sopptur-modus: logg turen og se fangsten din etterpå

PREMIUM (valgfritt abonnement)
• Ubegrenset AI-identifikasjon (gratis: 5 per døgn)
• Full prediksjon — de beste stedene nær deg
• Offline-kart for områder uten dekning

Personvern først: bildene dine renses for GPS-data før opplasting, og du
bestemmer selv hvor synlige funnene dine er. Data lagres i EU.

God soppjakt! 🍄
```

## Nøkkelord (maks 100 tegn)

```
sopp,sopptur,soppkart,kantarell,steinsopp,soppkontroll,soppbok,skog,friluftsliv,svamp,svampkarta
```

## Reklametekst / Promotional text (maks 170 tegn, kan endres uten ny review)

```
Soppsesongen er i gang! Sjekk dagens soppforhold, se de beste stedene nær deg
og identifiser funn med AI — trygt, norsk og laget for skogen.
```

## Skjermbilder (krav: 6,9-tommer — iPhone 17 Pro Max-simulator, 1320×2868)

Plan (5–6 stk, i denne rekkefølgen):
1. Forsiden med «Soppforhold i dag»-måleren
2. Kartet med funn-klynger og «Beste steder»
3. AI-identifisering (resultatside med artsforslag)
4. Artsdetalj med fareadvarsel (viser sikkerhetsfokuset)
5. Sesongkalenderen
6. (Valgfri) Forum/fellesskap

Tas med `xcrun simctl io booted screenshot` fra simulatoren. RÅ skjermbilder
holder for innsending; polerte rammer/tekst kan legges på senere.

## Aldersvurdering — svar på Apples spørsmål

Alle kategorier: **None** (ingen vold, gambling, rus, medisinsk innhold osv.).
- «Unrestricted Web Access»: **No** (appen viser kun eget innhold)
- «Medical/Treatment Information»: **No** (giftinfo er sikkerhetsinnhold, ikke
  medisinsk rådgivning — vi henviser til Giftinformasjonen)
→ Resultat: **4+**

## App Privacy («nutrition labels») — svar

Tracking (på tvers av apper/ATT): **NEI** — ingen sporing, ingen annonser.

Data som samles inn (alle «Linked to you», ingen til tracking):
| Datatype | Formål |
|---|---|
| Contact Info → Email Address | Kontoopprettelse |
| User Content → Photos | Soppbilder (funn/forum/AI-id). GPS-strippes før opplasting |
| User Content → Other User Content | Funn, innlegg, kommentarer |
| Location → Precise Location | Kart, funnregistrering, prediksjon (kun når bruker tillater) |
| Identifiers → User ID | Kontodrift |
| Purchases → Purchase History | Abonnementsstatus (når IAP er aktiv) |

Ikke samlet: Diagnostics, Usage Data, Browsing History, Contacts, Financial Info
(betalingskort håndteres av Apple/Stripe, aldri av oss).

## Abonnementer (IAP) — opprettes i App Store Connect → Subscriptions

**Subscription Group:** `Mycelet Premium` (én gruppe, begge produkter på samme nivå)

| Felt | Produkt 1 | Produkt 2 |
|---|---|---|
| Referansenavn | `Premium månedlig` | `Sesongpass årlig` |
| Produkt-ID | `no.mycelet.app.premium.monthly` | `no.mycelet.app.seasonpass.yearly` |
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

Demo account for review:
  Email: [OPPRETTES FØR INNSENDING]
  Password: [OPPRETTES FØR INNSENDING]
The demo account has an active premium entitlement so all features are testable.

Safety note: the app never tells users a mushroom is safe to eat — every
identification result shows a warning and refers to official inspection
services (Soppkontrollen) and the national Poison Information hotline.
```

## Sindres fase-1-sjekkliste (Agreements, Tax & Banking)

1. Logg inn på **https://appstoreconnect.apple.com** (Apple-ID-en din)
2. Klikk **Business** (evt. «Agreements, Tax, and Banking»)
3. **Paid Apps Agreement** → Accept (privatperson — ingen org-nr trengs)
4. **Bank:** DNB — IBAN `NO4412251002345` (samme konto som Stripe),
   kontoinnehaver Sindre Alstad Øverås, valuta NOK
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
