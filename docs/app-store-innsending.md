# App Store-innsending — én liste, i rekkefølge

**Skrevet 2026-08-05.** Erstatter rekkefølgen i `launch-critical-path.md` og
`neste-okt.md`, som motsa hverandre på tre punkter. De to filene beholdes for
historikk; **denne gjelder.**

Alt som kunne gjøres i repoet er gjort (PR #148). Det som står igjen krever din
Apple-innlogging, din iPhone eller din underskrift.

---

## 🔴 FØRST: tre passord har lekket i det offentlige repoet

Ikke App Store-relatert, men det haster mest. Alle tre står fortsatt i
git-historikken — å slette dem fra filene stopper bare blødningen.

| konto | hva | gjør |
|---|---|---|
| `applereview@mycelet.com` | demo-konto for Apples reviewer | bytt passord, legg det nye **bare** i App Store Connect |
| `qa-autotest@mycelet.com` | **ekte konto på live-appen** | bytt i Supabase → Authentication → Users, oppdater `QA_TEST_PASSWORD` i `.env.local` + GitHub Actions |
| Apple sandbox-tester | `sindre.alstad+sandbox@gmail.com` | bytt i App Store Connect → Sandbox Testers |

Kontonummeret (IBAN) lå også ute. Det er mindre kritisk — et IBAN alene lar ingen
ta penger — men du bør vite det.

En test hindrer nå at det skjer igjen: `docs-uten-hemmeligheter.test.ts` feiler
hvis noen skriver et passord i klartekst under `docs/`.

---

## Steg 1 — Én innlogging som avklarer alt (👤 30 min)

**Gjør dette først.** Tre ting i prosjektdokumentasjonen motsier hverandre, og
ingen av dem kan avgjøres uten din konto. Ett av dem kan legge en måned på planen.

Logg inn på App Store Connect og sjekk i denne rekkefølgen:

- [ ] **Banner om ny Program License Agreement?** Godta den. En ventende avtale
      sperrer både opplasting av bygg og innsending.
- [ ] **DSA / EU trader status — er den Active?**
      ⚠️ `launch-critical-path.md:31` sier Active siden 26. juni.
      `neste-okt.md` (12 dager nyere) sier den mangler.
      **Uten den kan appen ikke selges i EU/EØS i det hele tatt.** Er den ikke
      aktiv, må Apple verifisere identiteten din — dager til uker.
- [ ] **Agreements, Tax and Banking — står Paid Apps som Active?**
      Bankkontoen sto som «Processing» 26. juni. Uten aktiv Paid Apps-avtale kan
      ingen IAP selges, uansett hvor ferdig koden er.
- [ ] **Bekreft at app-oppføringen finnes** — app-id `6784672944`, SKU
      `mycelet-ios`, status «Prepare for Submission».
      ⚠️ **Ikke opprett en ny.** `launch-critical-path.md:43` ber deg gjøre det;
      det er feil, appen finnes allerede.

## Steg 2 — Bekreft nøklene i Vercel (👤 10 min)

- [ ] `NEXT_PUBLIC_REVENUECAT_APPLE_KEY` — uten den forsvinner kjøpsknappene, og
      reviewer møter en abonnementsapp uten kjøpsmulighet
- [ ] `REVENUECAT_WEBHOOK_AUTH`
- [ ] `REVENUECAT_ALLOW_SANDBOX=1` — **må stå PÅ gjennom hele reviewen.**
      Reviewere kjøper i sandbox, og uten flagget forkaster webhooken kjøpet
      deres. Fjernes først etter godkjenning.

## Steg 3 — Sandbox-kjøp på din iPhone (👤 + agent, 1–2 timer)

**Hele betalingsstien har aldri kjørt mot ekte StoreKit.** All testing så langt er
enhetstester med mocket plugin. Å sende inn uten dette er å sende inn en
betalingsflyt ingen har sett virke.

Agenten bygger og installerer på telefonen; du trykker gjennom Apples kjøpsark;
agenten verifiserer at det faktisk kommer en rad i `billing_subscriptions`.
Oppskrift i `neste-okt.md` punkt 1. **Regn med at det feiler første gang.**

## Steg 4 — Xcode (👤 15–30 min)

- [ ] Slå på **In-App Purchase**-capability på App-targetet
      (Signing & Capabilities → + Capability)
- [ ] La Xcode utstede distribusjonssertifikatet — skjer automatisk første gang
      du velger «Distribute App». Du har i dag bare et utviklersertifikat.
      Krever at avtalene i steg 1 er i orden.

## Steg 5 — Fyll skjemaene i App Store Connect (👤 1,5–2 timer)

Alle svarene ligger ferdig i [`app-store-metadata.md`](app-store-metadata.md).

- [ ] Butikktekst (navn, undertittel, nøkkelord, beskrivelse)
- [ ] Skjermbilder — de seks i `app-store-screenshots/`, slot **6.9-inch**.
      iPad-bilder trengs ikke; appen er satt til iPhone-only.
- [ ] **App Privacy** («nutrition labels») — svarene er kodeverifiserte
- [ ] **Aldersvurdering → 12+**, ikke 4+. Appen har forum med brukerinnhold.
      Svar ærlig «Yes» på UGC og vis de fire 1.2-mekanismene; alle finnes.
- [ ] **App Review Information** — demo-konto + det nye passordet fra steg 0

## Steg 6 — Arkiver, last opp, send inn (👤 1–2 timer)

- [ ] Product → Archive → Distribute App → App Store Connect
- [ ] Velg bygget, kontroller at det ikke står «Missing Compliance»
      (skal være løst — `ITSAppUsesNonExemptEncryption` ligger i Info.plist)
- [ ] **Submit for Review**

## Steg 7 — Etter godkjenning (👤 20 min)

- [ ] Fjern `REVENUECAT_ALLOW_SANDBOX` fra Vercel — så lenge den står på, gir
      ethvert sandbox-kjøp ekte premium
- [ ] Meld deg på **App Store Small Business Program** — 15 % Apple-kutt i stedet
      for 30 %. Gratis, under $1M/år.
- [ ] Bytt «Kommer snart i App Store» til ekte lenke på landingssiden

---

## Ærlig tidsanslag

**3–6 uker**, ikke dager. Regnestykket sier under to uker hvis alt går på skinner.
Det gjør det sjelden:

- **DSA-statusen** kan alene legge en måned på planen. Sjekk den i dag.
- **Sandbox-kjøpet** feiler som regel første gang — feil produkt-ID, feil
  sandbox-konto, gammelt bygg. Regn med to økter.
- **Minst én avvisningsrunde** er normalt. 1–3 dager per runde.

## Største avvisningsrisiko

1. ~~Beskrivelsen lovet funksjoner som er skrudd av~~ — **rettet i #148**, og en
   test hindrer at det skjer igjen
2. ~~iPad-skjermbilder manglet~~ — **rettet**, appen er iPhone-only
3. **Regel 4.2 «for lite native funksjonalitet»** — den reelle usikkerheten.
   Motvekten er ekte: native kamera, native GPS, offline-kart, Apple-kjøp. Og
   offline-siden sier ikke lenger «Kartet og funnene trenger nett», som var
   nøyaktig den bekreftelsen en reviewer i flymodus lette etter.

## Ikke gjort, med vilje

- **Svenske tillatelsestekster.** iOS-prosjektet har ingen lokalisering satt opp
  (`knownRegions = en, Base`), og å legge det til krever håndredigering av
  `project.pbxproj`. Apple krever det ikke, og risikoen for å ødelegge
  Xcode-prosjektet rett før innsending er større enn gevinsten. Svenske brukere
  ser norsk tillatelsestekst.
- **Produktansvarsforsikring.** Blokkerer ikke innsending, og jeg kan ikke tegne
  den. Men du driver som ENK — et erstatningskrav treffer privatøkonomien din
  direkte. Sikkerhetsrammen i appen er god, men den er ikke en forsikring.
