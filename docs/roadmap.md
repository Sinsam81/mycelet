# SoppJakt — veikart

> Sist oppdatert: 6. mai 2026
> Eier: Sindre Øverås (`sindre.alstad@gmail.com`)

Dette dokumentet samler alt arbeid som gjenstår før beta-launch (mai-juni 2026) og åpen launch (august 2026), pluss strategiske avgjørelser som ikke er tatt enda.

For arkitektur og konvensjoner, se [`CLAUDE.md`](../CLAUDE.md).
For andre planleggingsdokumenter, se [`docs/commercial-mvp-plan.md`](commercial-mvp-plan.md), [`docs/8-step-status.md`](8-step-status.md), m.fl.

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
| `fetchFrost()` — norsk vær | ⏳ Venter på Frost-API-nøkkel |
| **Fase 2 prediksjon** (NIBIO + Frost + GBIF + raster-pipeline) | ⏳ Plan klar (se nedenfor), ikke startet |
| Lansering på Vercel | ⏳ Du har Vercel-konto, ingen prosjekt opprettet ennå |

---

## 👤 Sindres jobb (kan ikke gjøres i kode)

### Før beta-launch (mai-juni 2026)

- [ ] **Sett `SUPABASE_SERVICE_ROLE_KEY`** i Vercel produksjonsmiljø ✅ *allerede satt i lokal `.env.local`*
- [ ] **Sett opp `privacy@soppjakt.no`** mailboks (Google Workspace eller lignende). Adressen er referert i `/personvern` og `/api/me/export`-respons.
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

Dette er det strategiske kjernearbeidet — det som gjør SoppJakt unik. Alt under er nytt fra plan-økten 6. mai 2026.

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

**Konkrete starter-regler (fra denne planen):**

| Art | Habitat | Vær |
|-----|---------|-----|
| Kantarell | gammel barskog/blandingsskog (alder >40 år), moderat fuktighet, ikke for tett kronedekke, sur jord | akkumulert nedbør siste 2 uker >25mm, temp 12-22°C |
| Steinsopp | granskog eller eikeskog, eldre bestand, kantsoner mot åpninger | varmere temperatur enn kantarell |
| Traktkantarell | moserik granskog | tåler kjøligere temperaturer; senere sesong |

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

### Lanseringsstrategi (anbefaling)

> **v1 = "soppjakt sannsynlighetskart (beta)" for kantarell + steinsopp + traktkantarell**

Ikke lansere helt uten prediksjon — det er det som gjør SoppJakt unik.
Ikke lansere med 26 arter — du kan ikke kalibrere det godt.
Lansere med **3 utvalgte arter med distinkte habitater og mest treningsdata**.

### Realistisk timeline (uten geo-utvikler, du + Claude)

| Uke | Hva |
|-----|-----|
| 1 | Du registrerer Frost. Claude implementerer `fetchFrost()` + tester. |
| 2 | Schema-endring: negative observasjoner + habitat-tagging på `findings`. |
| 3 | Forklarings-UX ("eldre granskog, sørvendt, 32mm regn siste 14 dager"). |
| 4-5 | Du laster ned NIBIO SR16 manuelt. Claude lager import-pipeline + spatial join. |
| 6 | Daglig raster-job på Vercel Cron eller Supabase Edge. |
| 7 | GBIF-backfill av historiske kantarell-/steinsopp-/traktkantarell-observasjoner for kalibrering. |
| 8 | Beta-launch med 3 arter. |

Med geo-utvikler: halvere alt, og kan inkludere Sentinel-2 NDVI i v1.

### Åpne avgjørelser i Fase 2

- **2 eller 3 arter i v1?** Default = 3 (kantarell + steinsopp + traktkantarell). Sindre må bekrefte.
- **Mapbox vs MapLibre?** Default = MapLibre (gratis, riktig for beta). Mapbox koster ved skala. Sindre må velge.
- **Geo-utvikler ja/nei?** Strategisk avgjørelse Sindre tar når det er klart hvor mye tid han selv kan dedikere.

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
| **`next-pwa` → Serwist** (siste sikkerhets-advisorisety) | ⏳ ~90 min, breaking |
| **Distribuert rate limiting** (Upstash Redis eller Vercel KV) | ⏳ Når trafikken vokser |
| **Penetrasjonstest** | 👤 Eksternt firma, etter beta |

---

## 🎯 Strategiske avgjørelser ikke tatt

- **Utvide til flere land enn NO+SE?** Anbefaling: nei nå. Arkitekturen er klar (`getRegion`-funksjonen + væradapter-routing), men prediksjonens dybde i Norden er kjernemurveggen mot Picture Mushroom-typen. Utvid når NO+SE leverer treffsikre prediksjoner og du har betalende brukere som validerer modellen.
- **Beta-launch dato?** Plan: mai-juni 2026 før hovedsesong august-november.
- **Geo-utvikler for Fase 2?** Sindre vurderer dette; placeholder-data holder ikke for kommersielt produkt.
- **Antall arter i prediksjonens v1?** Default 3, men kan reduseres til 2 hvis NIBIO-integrasjon tar lengre tid.

---

## 🚨 Kjente sårbarheter (oppdatert 6. mai 2026)

| Pakke | Severity | Status |
|-------|----------|--------|
| ~~Næ 14.x — image-optimizer DoS, request smuggling, disk cache growth~~ | – | ✅ Fikset i Næ 16-oppgraderingen |
| `next-pwa` 5.6.0 → `serialize-javascript` | HIGH (RCE) | ⏳ Krever migrering til Serwist |
| `next-pwa` → `workbox-build` | HIGH (DoS) | Samme migrering |

`npm audit` etter Næ 16-oppgradering: 7 vulnerabilities gjenstår, alle i next-pwa-kjeden. Closes når vi migrerer til Serwist.

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
