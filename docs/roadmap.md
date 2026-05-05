# SoppJakt — veikart

> Sist oppdatert: 4. mai 2026
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
| SMHI vær-adapter | ✅ Ferdig (PR #10) |
| `/api/prediction` ruter gjennom `fetchWeatherSummary` | ✅ Ferdig (PR #11) |
| Tile-pathen returnerer ekte vær | ✅ Ferdig (PR #12) |
| Sikkerhets-headers (HSTS, Frame-Options, Permissions) | ✅ Ferdig (PR #13) |
| Fase A (sikkerhet/GDPR før beta) | ✅ Alle 8 stegene shippet |
| Fase 1 prediksjon: Frost-adapter, per-art-scoring | ⏳ Pågår |
| Fase B (sikkerhet/GDPR før åpen launch) | ⏳ Ikke startet |
| Fase 2 (NIBIO, Sentinel-2, GBIF) | ⏳ Krever geo-utvikler |

---

## 🟡 Åpne PR-er som venter merge

Alle uavhengige; merge i hvilken rekkefølge du vil.

| PR | Branch | Hva |
|----|--------|-----|
| [#14](https://github.com/Sinsam81/soppjakt/pull/14) | `codex/step-16-lockfile` | Generer `package-lock.json`, bump Next til 14.2.35 (3 HIGH-sårbarheter patchet) |
| [#15](https://github.com/Sinsam81/soppjakt/pull/15) | `codex/step-17-weather-auth` | Slett ubrukt `/api/weather` (var dødt — kvote-tappet OpenWeather) |
| [#16](https://github.com/Sinsam81/soppjakt/pull/16) | `codex/step-18-me-export` | `/api/me/export` — GDPR Art. 15 dataeksport |
| [#17](https://github.com/Sinsam81/soppjakt/pull/17) | `codex/step-19-me-delete` | `/api/me/delete` — GDPR Art. 17 sletting |
| [#18](https://github.com/Sinsam81/soppjakt/pull/18) | `codex/step-20-personvern` | `/personvern`-mal med `[FYLL INN]`-markører |
| [#19](https://github.com/Sinsam81/soppjakt/pull/19) | `codex/step-21-cookie-notice` | Cookie-info-banner |

---

## 👤 Sindres jobb (kan ikke gjøres i kode)

### Før beta-launch (mai-juni 2026)

- [ ] **Sett `SUPABASE_SERVICE_ROLE_KEY`** i Vercel produksjonsmiljø (kreves av `/api/me/delete`, billing-webhook, admin-ruter)
- [ ] **Sett opp `privacy@soppjakt.no`** mailboks (Google Workspace eller lignende). Adressen er referert i `/personvern` og `/api/me/export`-respons
- [ ] **Send `/personvern` til norsk personvern-advokat** for gjennomgang. Fyll inn alle `[FYLL INN]`-felter først (juridisk navn, org-nummer, retensjonsperioder, Supabase-region)
- [ ] **Signer DPA-er** i leverandør-dashboards:
  - [ ] Supabase
  - [ ] Stripe
  - [ ] Vercel
  - [ ] Plant.id / Kindwise (når aktivert)
- [ ] **Bestem retensjonsperioder:**
  - Konto-inaktivitet før auto-sletting (forslag: 24 mnd)
  - Backup-rotasjon (forslag: 30 dager)
  - Betalingsdata: 5 år (bokføringsloven)
- [ ] **Sjekk Supabase-region** (EU/Frankfurt eller US) — påvirker `/personvern` § 6
- [ ] **Skriv brudd-varslingsrutine** (Art. 33: 72 timer til Datatilsynet ved alvorlig brudd)
- [ ] **Registrer på [frost.met.no](https://frost.met.no/auth/requestCredentials.html)** for `MET_FROST_CLIENT_ID` (norsk vær-data)

### Valgfritt / senere

- [ ] Plant.id / Kindwise-konto for AI-soppidentifikasjon → `PLANTID_API_KEY`
- [ ] Stripe test mode + populere `STRIPE_*`-env vars
- [ ] OpenWeather-konto for ikke-Norden-fallback (CAPTCHA-utfordring per minnet)

---

## 🔧 Prediksjonsmotoren — Fase 1

| Oppgave | Status | Avhengighet |
|---------|--------|-------------|
| `fetchSmhi()` (Sverige-vær) | ✅ Ferdig (PR #10) | – |
| `/api/prediction` bruker `fetchWeatherSummary` | ✅ Ferdig (PR #11, #12) | – |
| `fetchFrost()` (Norge-vær) | ⏳ Venter | `MET_FROST_CLIENT_ID` |
| **Per-art-scoring** med `mycorrhizal_partners` + sesong + vær | ⏳ Ikke startet | – |

Per-art-scoring er den største forbedringen som kan gjøres uten Frost-nøkkel. Eksempel: kantarell trives etter regn, steinsopp foretrekker varmere uker — ulike arter bør score ulikt på samme vær.

---

## 🔧 Sikkerhet/GDPR — Fase B (før åpen launch)

| Oppgave | Tid | Verdi |
|---------|-----|-------|
| **B2:** Dataretensjon (cron sletter inaktive kontoer + gamle funn) | ~60 min | GDPR-prinsipp om lagringsbegrensning |
| **B3:** Audit-log-tabell for admin-handlinger | ~45 min | Sporbarhet ved misbruk eller tilsyn |
| **B4:** Rate limiting på alle `/api/*` | ~60 min | DDoS-vern, brute-force-vern |
| **B5:** Sentry feil-monitorering med PII-skrubbing | ~30 min | Vet om feil før brukere klager |
| **CSP-headere i report-only mode → enforce** | ~90 min | XSS-vern (utsatt fra A1 fordi krever testing) |
| **Migrere bort fra `next-pwa`** til Serwist | ~90 min | Fjerner serialize-javascript RCE (HIGH) |
| **Major Next-oppgradering 14.x → 16.x** | ~120 min | Fjerner gjenværende Next-sårbarheter (request smuggling, image cache, m.fl.) |
| **Add nav-lenke til `/personvern`** | ~10 min | Synlig fra hele appen |

### Sindres Fase B-jobb

- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` (samme som Fase A)
- [ ] Brudd-varslingsrutine (samme som Fase A)
- [ ] Penetrasjonstest før betalende brukere (eksternt firma)

---

## 🔧 Fase 2 — Avanserte data-pipelines

Krever sannsynligvis hjelp fra geo-utvikler.

- **NIBIO SR16** (skogressurs-data fra Norsk institutt for bioøkonomi) — gir tre-art, høyde, alder per piksel. Kjernedata for prediksjon i norske skoger.
- **Sentinel-2 NDVI** — vegetasjonshelse via satellitt-data fra ESA Copernicus. Brukes til å oppdage våte/grønne områder hvor sopp trives.
- **GBIF / Artsdatabanken backfill** — historiske soppfunn for ML-treningsdata. Gjør prediksjonsmodellen faktisk treffsikker.

Se [`docs/vegetation-analysis-mvp.md`](vegetation-analysis-mvp.md) for tidligere planlegging.

---

## 🎯 Strategiske avgjørelser ikke tatt

- **Utvide til flere land enn NO+SE?** Min anbefaling: nei nå. Arkitekturen er klar (`getRegion`-funksjonen + væradapter-routing), men prediksjonens dybde i Norden er kjernemotstand mot Picture Mushroom-typen. Utvid når NO+SE leverer treffsikre prediksjoner og du har betalende brukere som validerer modellen.
- **Beta-launch dato?** Plan: mai-juni 2026 før hovedsesong august-november.
- **Geo-utvikler for Fase 2?** Sindre vurderer dette; placeholder-data holder ikke for kommersielt produkt.

---

## 🚨 Kjente sårbarheter (dokumentert)

| Pakke | Severity | Status |
|-------|----------|--------|
| Next 14.x — image-optimizer DoS, request smuggling, disk cache growth | HIGH | Krever Next 16-oppgradering (Fase B) |
| `next-pwa` 5.6.0 → `serialize-javascript` | HIGH (RCE) | Krever migrering til Serwist (Fase B) |
| `next-pwa` → `workbox-build` | HIGH (DoS) | Samme migrering som over |

Tre HIGH-severity Next-feil er allerede patchet i PR #14 (Next 14.2.31 → 14.2.35).

---

## 📚 Relaterte dokumenter

- [`CLAUDE.md`](../CLAUDE.md) — arkitektur og konvensjoner
- [`docs/8-step-status.md`](8-step-status.md) — historisk fremgang fra Codex-tiden
- [`docs/commercial-mvp-plan.md`](commercial-mvp-plan.md) — kommersiell strategi
- [`docs/offline-map-mvp.md`](offline-map-mvp.md) — premium-feature for offline-bruk
- [`docs/vegetation-analysis-mvp.md`](vegetation-analysis-mvp.md) — Fase 2-bakgrunn
- [`docs/payment-model.md`](payment-model.md) — abonnementsmodell
- [`docs/forum-trust.md`](forum-trust.md) — moderering og verified-foragers

---

*Veikartet oppdateres etter hver større arbeidsøkt. Hvis noe her motsier seg med GitHub eller koden, er koden fasit.*
