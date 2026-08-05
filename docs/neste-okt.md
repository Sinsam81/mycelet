# Neste økt — start her

> ⚠️ **ERSTATTET 2026-08-05.** Statustabellen under motsa `launch-critical-path.md`
> på tre punkter (DSA-status, Paid Apps, og om app-oppføringen skulle opprettes),
> og ingen av dem kan avgjøres uten Sindres Apple-innlogging. Bruk
> [`app-store-innsending.md`](app-store-innsending.md) — denne beholdes for
> historikk, og sandbox-oppskriften i punkt 1 er fortsatt gyldig.

> Oppdatert 2026-07-31 etter at PR #99 gikk live. Lim kickoff-linja nederst inn i et nytt Claude Code-vindu.

## Neste oppgave: gjennomgå Codex sin tekniske rapport

Sindre har fått en full teknisk gjennomgang av appen fra Codex med mange forbedringspunkter. **Rapporten er ikke i repoet ennå** — Sindre limer den inn, eller legger den i `docs/reports/`.

Nyttig å vite før du leser den:

- **Repoet er rent og fullt merget.** Ingen åpne PR-er. Brancher som `codex/day-review-reports`, `feat/ga4-pwa`, `claude/happy-elbakyan-eda7ae` m.fl. ligger alle BAK main og inneholder ingen filer main mangler — de er trygge å ignorere eller slette.
- **Mye kan allerede være fikset.** Runden 30.–31. juli tok bl.a.: svensk lokalisering av all server-generert tekst, 46 manglende svenske artsnavn, vilkår/kjøpsvilkår/personvern, Apple-retningslinje 1.2 (blokkering, innholdsfilter, kontaktinfo i appen), og fire feil i prediksjonsmodellen. Sjekk `docs/reports/deploys.md` (nederste oppføring) FØR du tar et punkt fra rapporten — det sparer dobbeltarbeid.
- **Vurder hvert punkt, ikke bare implementer.** Erfaringen fra forrige runde: av 28 forslag i en adversariell gjennomgang ble alle 28 korrigert eller forkastet før implementering. Codex-rapporten er et sett hypoteser, ikke en arbeidsordre.
- **Den harde begrensningen:** temporalt signal er målt til ~0,89 AUC, spatialt til ~0,52. Ingenting i appen skal påstå mer om HVOR sopp er enn 0,52 tåler. Prosjektet har gått tilbake på overdreven ordlyd én gang allerede.

## Hvor vi står ellers

**Alt teknisk OG all metadata i App Store Connect er ferdig.** Gjenstår: sandbox-testkjøp bekreftet, App Review-info (demo-bruker), IAP-capability, arkivering, innsending.

| Område | Status |
|---|---|
| Web-appen (mycelet.com) | ✅ Live, sist deployet 31.07 (PR #99) |
| Migrasjoner 030–032 | ✅ Kjørt i produksjon 31.07 |
| Landingsside for utloggede + 3 sanketips-artikler | ✅ Live (PR #92–#95) |
| Apple: avtaler, bank, skatt | ✅ Alle Active |
| Abonnementer i ASC (79 kr/mnd + 249 kr/år) | ✅ Komplette |
| RevenueCat | ✅ Konfigurert + verifisert |
| IAP-koden i appen | ✅ Deployet (PR #90/#91) |
| Apple 1.2 (brukerinnhold) | ✅ Alle fire krav dekket (PR #99) |
| Lovpålagt kontaktinfo (adresse, telefon, MVA-status) | ✅ Live på `/kontakt` |
| **Sandbox-testkjøp** | ⏳ |
| App Review-info: demo-bruker opprettet, må limes inn i ASC | ⏳ |
| Xcode: IAP-capability → arkiv → innsending | ❌ |
| DSA trader-status i App Store Connect | ❌ Må gjøres FØR EU-distribusjon |
| Tilgjengelighetserklæring (norsk forskrift, WCAG 2.0 AA) | ❌ |

## 1. Sandbox-kjøpet (2 min, på iPhonen)

> 🔴 **PASSORDET SOM STO HER ER KOMPROMITTERT — BYTT DET.**
>
> Fram til 2026-08-05 sto passordet til både QA-brukeren og sandbox-Apple-ID-en
> i klartekst i denne fila. **Repoet er offentlig**, og passordet står fortsatt i
> git-historikken. Å fjerne det herfra stopper bare blødningen; det hjelper ikke
> mot noen som allerede har lest det.
>
> Passordet ga tilgang til `qa-autotest@mycelet.com` — en **ekte konto på den
> live appen** — og til Apple sandbox-testeren.
>
> **Gjør dette:**
> 1. Bytt passord på `qa-autotest@mycelet.com` (Supabase → Authentication → Users)
> 2. Oppdater `QA_TEST_PASSWORD` i `.env.local` og i GitHub Actions-hemmelighetene
> 3. Bytt passord på sandbox-Apple-ID-en i App Store Connect → Sandbox Testers
> 4. La de nye passordene ligge i passordbehandleren, aldri i en fil i repoet
>
> Dette er det tredje passordet som har lekket denne veien (se også
> `docs/app-store-metadata.md`, om `applereview@mycelet.com` og IBAN-et). Mønsteret
> er at oppskrifter skrives med ekte verdier «bare for nå». **Skriv aldri en
> hemmelighet i en fil under `docs/`** — skriv hvor den ligger i stedet.

Appen ligger allerede på telefonen. Passordene finner du i passordbehandleren.

1. Force-quit Mycelet, åpne den på nytt
2. Person-ikonet øverst til høyre → logg inn som `qa-autotest@mycelet.com`
3. Trykk «Gratis»-merket øverst → Priser
4. «Velg Premium» → Apple-arket skal vise **[Environment: Sandbox]** → bekreft
   - Sandbox-Apple-ID settes i Innstillinger → Utvikler → Sandbox Apple Account
     (`sindre.alstad+sandbox@gmail.com`)
5. Claude verifiserer at `billing_subscriptions` får rad med `metadata.provider = 'revenuecat'` for QA-brukeren, og at appen flipper til aktiv plan

Blir bygget for gammelt: bygg på nytt fra worktreet med
`xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'id=EBCC8060-6E43-519C-A25F-B1D5CDD76E54' -derivedDataPath /private/tmp/mycelet-ios-build -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM=WUFJ6UBMPG CODE_SIGN_STYLE=Automatic build`
→ `xcrun devicectl device install app --device EBCC8060-6E43-519C-A25F-B1D5CDD76E54 /private/tmp/mycelet-ios-build/Build/Products/Debug-iphoneos/App.app`

## 2. Metadata i App Store Connect (👤 Sindre, copy-paste)

Teksten ligger ferdig i `docs/app-store-metadata.md`. Skjermbilder i `docs/app-store-screenshots/` (6,9-tommers slot). App Privacy-skjemaet må fylles ut — Claude guider.

## 3. Arkiv + innsending (👤 i Xcode GUI, Claude guider)

- Slå på **In-App Purchase**-capability på App-targetet
- ⚠️ `capacitor.config.ts` `server.url` skal være `https://www.mycelet.com` (er det)
- ⚠️ Hovedmappa (`sopp appen/`) står på en gammel commit med ukommittert PWA-arbeid fra juni — **synk den mot main før arkivering**, eller arkiver fra worktreet
- CLI-codesign feiler i iCloud-mappa → bruk Xcode-appen til selve arkiveringen

## Etter lansering

- Fjern `REVENUECAT_ALLOW_SANDBOX` fra Vercel (må stå PÅ gjennom App Review)
- Meld på **App Store Small Business Program** → 15 % kutt fra dag én
- Bytt «Kommer snart i App Store» til ekte lenke i `public/landing/index.html`
- Vurder svensk landingsside (samme oppskrift via Claude Design)

## Nyttige kommandoer

```
npm run build && npm run test && npm run typecheck   # før hver deploy
npm run qa:prod                                       # røyktest mot live
node scripts/build-articles.mjs                       # bygg sanketips-artiklene på nytt
```

---

**Kickoff-linje til nytt vindu:**

> Les `docs/neste-okt.md` og fortsett der vi slapp — neste steg er sandbox-testkjøpet på iPhonen.
