# Mycelet — veikart

> Sist oppdatert: 10. juni 2026
> Eier: Sindre Øverås (`sindre.alstad@gmail.com`)

Dette dokumentet samler alt arbeid som gjenstår før beta-launch (mai-juni 2026) og åpen launch (august 2026), pluss strategiske avgjørelser som ikke er tatt enda.

For arkitektur og konvensjoner, se [`CLAUDE.md`](../CLAUDE.md).
For andre planleggingsdokumenter, se [`docs/commercial-mvp-plan.md`](commercial-mvp-plan.md), [`docs/8-step-status.md`](8-step-status.md), m.fl.

---

## 🍄 Nylig shippet — 10. juni 2026 (artsutvidelse 36 → 72)

Live på mycelet.com (migrasjon 017):
- **Soppkatalogen doblet:** 36 nye arter — 13 gift/uspiselige (inkl. de fire klassiske dødelige: grønn fluesopp, flatklokkehatt, steinmorkel, butt giftslørsopp) + 23 spiselige/betinget spiselige. Alle latinske navn EXACT-verifisert mot GBIF, alle 36 bilder HTTP-200-sjekket, alle `verified=false` (venter ekspertgodkjenning, som de 36 første).
- **11 forvekslings-advarsler** koblet — hver ny matsopp er knyttet til sin giftige tvilling (vintersopp↔flatklokkehatt, morkel↔steinmorkel, snøballsjampinjong↔grønn fluesopp, nellikhatt↔hvit trakttsopp, m.fl.). Alle ankerarter fantes fra før, så ingen kobling ble hoppet over.
- **Gjenstår:** GBIF-funnpunkter for de nye artene — var blokkert av en GBIF-nedetid (HTTP 503) 10. juni; en bakgrunnsjobb kjører importen automatisk (`ONLY_MISSING=1`) når GBIF er tilbake. Nye arter virker allerede på kartets «lovende steder» via live-fallback. Importskriptet feiler nå tydelig ved GBIF-feil (tidligere ble 503 stille tolket som «0 funn»).

---

## 🔒 Nylig shippet — 9.–10. juni 2026 (sikkerhetsrevisjon + fikserunde)

Full defensiv revisjon før App Store, etterfulgt av seks fiksesteg (alle live):
- **Kritisk tettet:** rå funn-koordinater kan ikke lenger leses via databasens REST-API (owner-only `findings` + maskert view, migrasjon 015) — «omtrentlig» posisjon er nå reelt omtrentlig. Premium-prediksjonsrasteret kan ikke scrapes utenom betalingsmuren.
- **Kritisk tettet:** alle bildeopplastinger EXIF-strippes på enheten (canvas-reenkoding) — bilder kan ikke lenger lekke eksakt GPS-posisjon for hemmelige steder.
- CSP håndhevende (`unsafe-eval` kun dev, X-Frame-Options DENY), koordinater i serverlogger avrundes til ~1 km, e-postbekreftelse på igjen (profil opprettes nå i auth/callback — rotårsaken fra mai).
- **Juridisk:** GBIF-data refiltrert til kun frie lisenser (CC0/CC BY) — 186 117 funn, 7 952 ulisensierte slettet (migrasjon 016); ny `/datakilder`-side krediterer alle kilder.
- **iOS-skall:** `PrivacyInfo.xcprivacy` (Apple-krav) opprettet og registrert, `server.url` → www.mycelet.com, offline-feilside med auto-retry.
- Gjenstår til lansering: Upstash rate limit, Vercel Pro, personvern-advokat, native plugins + Apple-konto.

---

## 🗺️ Nylig shippet — 6. juni 2026 (stor kart- + forside-økt)

Alt live på mycelet.com (etter konkurrent-analyse + UX-ønsker):
- **Kart:** base-layer-velger (Terreng/Kart/Satellitt), 187k registrerte GBIF-funn (fargekodet etter spiselighet + filter Alle/Spiselige/Giftige + «kun i sesong» + funn-dato), «Lovende steder» (erstattet grovt, upresist heatmap) med «🍄 mest lovende her»-arter per sted, «Hvilken sopp vil du finne?»-søk → lovende steder for arten, «Finn meg»-knapp, stedssøk (Kartverket Stedsnavn), sopptur-modus, førstegangs-intro. Ryddet verktøylinja (rent, funksjonelt design — søk-øverst + én handlingsrad + toasts).
- **Forside:** «Soppforhold i dag»-måler (fargekodet score-ring + «hvorfor»), «Dine funn»-statistikk, «Din siste sopptur».
- **«Perfekt soppdag»-hjerne:** `src/lib/prediction/mushroom-day.ts` (`assessMushroomDay`) + `/api/mushroom-day` — klar for proaktivt daglig varsel. **Push er utsatt til native-appen** (web-push har dårlig iOS-rekkevidde uten PWA-install).

Gjenstår av dette: 7-dagers værtrend-graf (MET Locationforecast 2.0 — gratis, global), og migrasjon `014_occurrences_observed_at.sql` (Sindre limer i Supabase SQL Editor for presise funn-datoer + sesong-filter — degraderer pent uten).

---

## 🎯 Statusoversikt

| Område | Status |
|---|---|
| Kjernefunksjonalitet (sider, profil, kalender, sikkerhet, look-alikes) | ✅ Ferdig |
| Nordic-grunnmur (NO/SE-region, vær-adapter) | ✅ Ferdig |
| SMHI vær-adapter | ✅ Ferdig |
| `/api/prediction` ruter gjennom `fetchWeatherSummary` | ✅ Ferdig |
| Per-art-scoring (slekt-baserte profiler) | ✅ Ferdig — kalibreres mot ekte data senere |
| Sikkerhets-headers (HSTS, Frame-Options, Permissions, CSP-RO) | ✅ Ferdig |
| Fase A (sikkerhet/GDPR før beta) | ✅ Alle 8 stegene shippet |
| Fase B sikkerhet (audit-log, rate limiting, Næ 16-oppgradering) | ✅ De fleste stegene shippet |
| Logger + observability (struktet logging, PII-redaksjon, /api/health) | ✅ Ferdig |
| `fetchFrost()` — norsk vær | ✅ Kode ferdig (`src/lib/weather/index.ts`) — aktiveres automatisk når `MET_FROST_CLIENT_ID` settes (Sindres oppgave) |
| Live skogdata i prediksjon: NIBIO SR16 (NO) + CORINE (SE) | ✅ Implementert og live-verifisert (`/api/prediction`, modell `v4_computed_habitat`) |
| **Fase 2 prediksjon** (habitat + vær + per-art kombinert) | 🟡 Kjernen bygget via live-API-kall (ikke raster-pipeline som opprinnelig planlagt). Gjenstår: GBIF-kalibrering + daglig tile-cron i skala |
| Lansering på Vercel | ⏳ Du har Vercel-konto, ingen prosjekt opprettet ennå |

---

## 👤 Sindres jobb (kan ikke gjøres i kode)

### Før beta-launch (mai-juni 2026)

- [ ] **Sett `SUPABASE_SERVICE_ROLE_KEY`** i Vercel produksjonsmiljø ✅ *allerede satt i lokal `.env.local`*
- [ ] **Sett opp `privacy@mycelet.no`** mailboks (Google Workspace eller lignende). Adressen er referert i `/personvern` og `/api/me/export`-respons.
- [ ] **Send `/personvern` til norsk personvern-advokat** for gjennomgang. Fyll inn alle `[FYLL INN]`-felter først (juridisk navn, org-nummer, retensjonsperioder, Supabase-region).
- [ ] **Signer DPA-er** i leverandør-dashboards:
  - [ ] Supabase
  - [ ] Stripe
  - [ ] Vercel
  - [ ] Plant.id / Kindwise (når aktivert)
- [ ] **Bestem retensjonsperioder:**
  - Konto-inaktivitet før auto-sletting (forslag: 24 mnd)
  - Backup-rotasjon (forslag: 30 dager)
  - Betalingsdata: 5 år (bokføringsloven)
- [ ] **Sjekk Supabase-region** (EU/Frankfurt eller US) — påvirker `/personvern` § 6.
- [ ] **Skriv brudd-varslingsrutine** (Art. 33: 72 timer til Datatilsynet ved alvorlig brudd).
- [ ] **Registrer på [frost.met.no](https://frost.met.no/auth/requestCredentials.html)** for `MET_FROST_CLIENT_ID` (norsk vær-data).
- [ ] **Importer repo til Vercel + sett alle env-vars** for prod-deploy.

### Valgfritt / senere

- [ ] Plant.id / Kindwise-konto for AI-soppidentifikasjon → `PLANTID_API_KEY`.
- [ ] Stripe test mode + populere `STRIPE_*`-env vars.
- [ ] Sentry-konto for feilmonitorering (Phase B5).

---

## 🔬 Fase 2 prediksjonsmotoren (planen)

Dette er det strategiske kjernearbeidet — det som gjør Mycelet unik. Alt under er nytt fra plan-økten 6. mai 2026.

> **Statusoppdatering 14. juli 2026:** Kjernen i Fase 2 henter skogdata **live per punkt** (NIBIO WMS for Norge, CORINE for Sverige) og kombinerer med vær + habitat-scoring i sanntid (`v4_computed_habitat`). Koordinatbasert pseudo-støy er erstattet med nøytrale fallback-verdier, og historisk GBIF-tetthet vises kun som datakilde fordi korrigert target-group-validering ikke viste positivt løft. Daglig `prediction_tiles`-generering er registrert i `vercel.json` (01:15 UTC) og overvåkes separat på `/api/health/predictions`.
>
> Feltfeedback går via serverruter som lagrer modellversjon og prediksjonskilde, samt best-effort vær- og skogkontekst. Positive og negative feltobservasjoner får automatisk vær-snapshot og habitat-tags; negative observasjoner brukes som treningsdata, men vises ikke som fellesskapsfunn eller i positive funnstatistikker.

### Hva vi har bygget grunnmur for

- `src/lib/utils/species-scoring.ts` — slekt-profiler + `computeSpeciesAdjustment()`-multiplikator
- `mushroom_species`-skjemaet har `mycorrhizal_partners`, `habitat`, `season_start/end`, `peak_season_start/end`
- `prediction_tiles`-tabellen + `get_prediction_tiles_in_bounds`-RPC (klar for daglig prekompilering)
- SMHI for Sverige, OpenWeather for "andre" land
- `fetchFrost()`-stub klar til å aktiveres med nøkkel

### Datakilder (offentlig norsk data — sterkere grunnlag enn de fleste land har)

| Kilde | Hva | Tilgang |
|-------|-----|---------|
| **NIBIO Kilden** | AR5/AR50 (arealressurs), **SR16** (treslag, alder, bonitet, volum per 16×16m for hele Norge), jordsmonn | WMS/WFS, gratis |
| **Artsdatabanken / GBIF / soppregistrering.no** | Historiske soppobservasjoner — våre treningsdata | API + nedlastbart datasett |
| **MET Frost API** | Værhistorikk per stasjon. **Akkumulert nedbør siste 10-14 dager er en av de sterkeste prediktorene** | Krever `MET_FROST_CLIENT_ID` |
| **seNorge** (MET) | Interpolerte vær-rastre — temperatur, jordfuktighet | API |
| **Hoydedata.no (Kartverket)** | Høyde, helning, eksposisjon (sørvendte lier varmer raskere om våren, nordvendte holder fukt) | WMS/WCS |
| **Sentinel-2 (ESA Copernicus)** | NDVI-vegetasjonsindeks for å oppdage våte/grønne områder | Krever pipeline; v2 |

### Modelleringsstrategi: rule-based per art (IKKE deep learning fra dag én)

For hver art:
- **Habitat-score** (statisk, fra NIBIO + Hoydedata): treslag, alder, bonitet, helning, eksposisjon
- **Værvindu-score** (dynamisk, fra Frost): akkumulert nedbør, temperatur-vindu, fuktighet
- Kombineres til én score per 100×100m-celle

**Hvorfor regelbasert først:**
1. **Forklarbart** — appen kan vise "eldre granskog + 32mm regn siste 10 dager" som begrunnelse
2. **Forsvarbart** — du kan stå inne for hver kalibrering basert på feltkunnskap
3. **Iterabel** — du justerer parametre når brukerdata kommer inn; ML kommer i v2

**Konkrete starter-regler (5 arter for v1):**

| Art (latin) | Slekt-profil | Habitat | Vær / sesong |
|-------------|--------------|---------|---------------|
| **Kantarell** (*Cantharellus cibarius*) | `Cantharellus` ✅ | gammel barskog/blandingsskog (alder >40 år), moderat fuktighet, ikke for tett kronedekke, sur jord | akkumulert nedbør siste 2 uker >25mm, temp 12-22°C, juli-september |
| **Steinsopp** (*Boletus edulis*) | `Boletus` ✅ | granskog eller eikeskog, eldre bestand, kantsoner mot åpninger | varmere enn kantarell (15-22°C), kommer 5-7 dager etter regn, juli-oktober |
| **Traktkantarell** (*Craterellus tubaeformis*) | `Craterellus` ✅ | moserik granskog | tåler kjøligere temperaturer (8-16°C); senere sesong, august-november |
| **Piggsopp** (*Hydnum repandum*) | `Hydnum` ✅ | kalkrik granskog/blandingsskog, ikke for sur jord | sen-sesongsart (september-november), kald-tolerant (6-15°C), tåler frostnetter, mindre regn-avhengig enn kantarell |
| **Svart trompetsopp** (*Craterellus cornucopioides*) | `Craterellus` ⚠ | **fuktig løvskog** (særlig bøk og eik), bunn-vegetasjon med mose | september-oktober, høy fuktighet kritisk, vanskelig å se i løvet — heatmap-funksjonen er spesielt verdifull her |

⚠ **Craterellus deles** av traktkantarell og svart trompetsopp i slekt-profilen vår. Default-profilen passer traktkantarell best (granskog-bias). For svart trompetsopp må vi overstyre på art-nivå (eller utvide habitat-input når NIBIO er på plass — løvskog vs barskog vil differensiere dem automatisk).

### UX-prinsipper: under-lov, over-leverer

- ❌ **Aldri** "her finner du sopp"
- ✅ **Alltid** "områder som matcher kantarell-habitat akkurat nå" eller "sannsynlighetskart"
- ✅ Heatmap med gradient (ikke pins) — visualiser usikkerhet
- ✅ Hvert markert område får en **forklaring**: "eldre granskog, sørvendt, 32mm regn siste 14 dager"
- ✅ Beta-/eksperimentell-merking i v1
- ✅ Dette beskytter når prediksjonen feiler, og bygger tillit når den treffer

### Feedback-loop = forretningsmodellen

- Hver bruker som logger funn forbedrer modellen
- **Negative observasjoner er like verdifulle** ("her var det ingenting") — be eksplisitt om dem
- Etter ett år → Norges beste soppprediksjonsmodell + datamoat ingen utenlandsk konkurrent kan matche
- **Konsekvens for datamodellen NÅ:** funn-logging må være strukturert (art, antall/mengde, habitat-tags) — IKKE fritekst. Schema-endring kreves.

### Compute-arkitektur

- Backend prekompilerer prediksjonsraster (100×100m grid for fokus-region) **daglig** basert på vær
- Lagres som `prediction_tiles`-rader (struktur eksisterer)
- Serveres som vector tiles eller via vår eksisterende `/api/prediction`-rute
- **Kan ikke kjøre på telefonen** — dette er en reell driftskostnad, må budsjetteres

**Realistisk for v1 uten geo-utvikler:**

```
Datalag (engang-jobb):
  - Last ned NIBIO SR16 for Sør- og Østlandet først
  - Konverter til Postgres/PostGIS via QGIS eller ogr2ogr
  - Spatial-indeks på treslag, alder, bonitet

Daglig job (Vercel Cron / Supabase Edge / GitHub Actions):
  - For hver kjent skog-polygon, beregn habitat-score per art (statisk)
    + værvindu-score (dynamisk fra Frost for nærmeste stasjon)
  - Skriv til prediction_tiles
  - ~10 min for hele Sør-Norge med riktig indekssystem

Frontend:
  - Hent prediction_tiles (allerede på plass via /api/prediction)
  - Render som heatmap-gradient i Leaflet (allerede leaflet.heat)
  - Forklaring-overlay per tile (ny komponent)
```

### Lanseringsstrategi (besluttet 7. mai)

> **v1 = "mycelet sannsynlighetskart (beta)" for fem arter:**
> kantarell, steinsopp, traktkantarell, piggsopp, svart trompetsopp

Ikke lansere helt uten prediksjon — det er det som gjør Mycelet unik.
Ikke lansere med 26 arter — du kan ikke kalibrere det godt.
Lansere med **fem strategisk utvalgte arter med distinkte habitater og god treningsdata-dekning**:

- **2 i barskog** (kantarell, steinsopp)
- **2 i granskog** (traktkantarell, piggsopp)
- **1 i løvskog** (svart trompetsopp)

Sesong-spredning fra juli til november — appen er nyttig hele sesongen, ikke bare i én topp-uke.

### Realistisk timeline (uten geo-utvikler, du + Claude)

| Uke | Hva |
|-----|-----|
| 1 | Du registrerer Frost. Claude implementerer `fetchFrost()` + tester. |
| 2 | Schema-endring: negative observasjoner + habitat-tagging på `findings`. |
| 3 | Forklarings-UX ("eldre granskog, sørvendt, 32mm regn siste 14 dager"). |
| 4-5 | Du laster ned NIBIO SR16 manuelt. Claude lager import-pipeline + spatial join. |
| 6 | Daglig raster-job på Vercel Cron eller Supabase Edge. |
| 7 | GBIF-backfill av historiske observasjoner for alle 5 arter (kantarell, steinsopp, traktkantarell, piggsopp, svart trompetsopp) for kalibrering. Overstyre Craterellus-profilen på art-nivå for å skille traktkantarell fra svart trompetsopp. |
| 8 | Beta-launch med 5 arter. |

Med geo-utvikler: halvere alt, og kan inkludere Sentinel-2 NDVI i v1.

### Åpne avgjørelser i Fase 2

- ~~**Antall arter i v1?**~~ ✅ Besluttet 7. mai: **5 arter** (kantarell, steinsopp, traktkantarell, piggsopp, svart trompetsopp).
- **Mapbox vs MapLibre?** Default = MapLibre (gratis, riktig for beta). Mapbox koster ved skala. Sindre må velge.
- **Geo-utvikler ja/nei?** Strategisk avgjørelse Sindre tar når det er klart hvor mye tid han selv kan dedikere. NB: 5 arter (mot opprinnelig forslag på 3) er fortsatt håndterbart uten geo-utvikler — alle 5 har genus-profiler i `species-scoring.ts` allerede.

---

## 🛡️ Sikkerhet/GDPR — gjenstående arbeid før åpen launch

| Oppgave | Status |
|---------|--------|
| ~~B3 Audit-log~~ | ✅ Shippet |
| ~~B4 Rate limiting~~ | ✅ Shippet (in-memory; Redis senere ved skala) |
| ~~CSP report-only~~ | ✅ Shippet, ikke flippet til enforce ennå |
| ~~Major Næ-oppgradering~~ | ✅ Næ 14 → 16 ferdig |
| **B2 Dataretensjon** (cron sletter inaktive kontoer + gamle funn) | ⏳ Krever beslutning fra Sindre på perioder |
| **B5 Sentry feil-monitorering** med PII-skrubbing | ⏳ Krever Sentry-konto fra Sindre |
| **CSP enforce mode** (etter en uke i prod) | ⏳ |
| ~~**`next-pwa` → Serwist**~~ | ✅ Utgått — `next-pwa` er fjernet fra prosjektet, HIGH-sårbarheten finnes ikke lenger |
| **Distribuert rate limiting** (Upstash Redis eller Vercel KV) | ⏳ Når trafikken vokser |
| **Penetrasjonstest** | 👤 Eksternt firma, etter beta |

---

## 🎯 Strategiske avgjørelser ikke tatt

- **Utvide til flere land enn NO+SE?** Anbefaling: nei nå. Arkitekturen er klar (`getRegion`-funksjonen + væradapter-routing), men prediksjonens dybde i Norden er kjernemurveggen mot Picture Mushroom-typen. Utvid når NO+SE leverer treffsikre prediksjoner og du har betalende brukere som validerer modellen.
- **Beta-launch dato?** Plan: mai-juni 2026 før hovedsesong august-november.
- **Geo-utvikler for Fase 2?** Sindre vurderer dette; placeholder-data holder ikke for kommersielt produkt.
- ~~**Antall arter i prediksjonens v1?**~~ ✅ Besluttet 7. mai: 5 arter. Hvis NIBIO-integrasjon tar lengre tid enn ventet kan vi falle tilbake til 3 (kantarell + steinsopp + traktkantarell), men 5 er målet.

---

## 🚨 Kjente sårbarheter (oppdatert 29. mai 2026)

| Pakke | Severity | Status |
|-------|----------|--------|
| ~~Next 14.x — image-optimizer DoS, request smuggling, disk cache growth~~ | – | ✅ Fikset i Next 16-oppgraderingen |
| ~~`next-pwa` → `serialize-javascript` (RCE) / `workbox-build` (DoS)~~ | ~~HIGH~~ | ✅ Borte — `next-pwa` er fjernet fra prosjektet |
| `next` → bundlet `postcss` <8.5.10 (XSS i CSS-stringify) | MODERATE | 🟡 Akseptert — fix krever nedgradering til `next@9.3.3` (urealistisk). Lav praktisk risiko. |

`npm audit` per 29. mai 2026: **2 moderate** sårbarheter, begge i `next` sin egen bundlede `postcss`. De tidligere 7 HIGH-funnene i next-pwa-kjeden er borte etter at `next-pwa` ble fjernet.

---

## 📚 Relaterte dokumenter

- [`CLAUDE.md`](../CLAUDE.md) — arkitektur og konvensjoner
- [`docs/logging.md`](logging.md) — logger + audit + observability
- [`docs/8-step-status.md`](8-step-status.md) — historisk fremgang fra Codex-tiden
- [`docs/commercial-mvp-plan.md`](commercial-mvp-plan.md) — kommersiell strategi
- [`docs/offline-map-mvp.md`](offline-map-mvp.md) — premium-feature for offline-bruk
- [`docs/vegetation-analysis-mvp.md`](vegetation-analysis-mvp.md) — Fase 2-bakgrunn
- [`docs/payment-model.md`](payment-model.md) — abonnementsmodell
- [`docs/forum-trust.md`](forum-trust.md) — moderering og verified-foragers

---

*Veikartet oppdateres etter hver større arbeidsøkt. Hvis noe her motsier seg med GitHub eller koden, er koden fasit.*
