# App Store-innsending — én liste, i rekkefølge

> ## 📍 START HER — status 2026-08-05, kl. 23:45
>
> **Alt i App Store Connect er ferdig. Det eneste som gjenstår er å laste opp et bygg.**
>
> ```
> ✅ Steg 0   Tre lekkede passord rotert og verifisert
> ✅ Steg 1   Paid Apps, bank, skatt og DSA — alle Active
> ✅ Steg 2   Tre RevenueCat-nøkler på Production i Vercel
> ⛔ Steg 3   Sandbox-kjøp — BLOKKERT til en binær er lastet opp (se under)
> 🔜 Steg 4   Xcode: IAP-capability + distribusjonssertifikat  ← NESTE
> ✅ Steg 5   Alle skjemaene i App Store Connect
> 🔜 Steg 6   Arkiver, last opp, send inn
> ```
>
> **Neste økt starter på steg 4.** Rekkefølgen er snudd: bygget må opp FØR
> sandbox-kjøpet kan testes. Begrunnelsen står under steg 3.
>
> Alt agenten kunne gjøre i repoet er gjort og merget (PR #148–#151).

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

## ~~Steg 1 — avtalene~~ ✅ AVKLART 2026-08-05

**Alle Apple-sperrene er borte.** Kontrollert på
[appstoreconnect.apple.com/agreements](https://appstoreconnect.apple.com/agreements/):

| | status |
|---|---|
| Free Apps Agreement | **Active** (26.06.2026 – 17.06.2027) |
| **Paid Apps Agreement** | **Active** (17.06.2026 – 17.06.2027) |
| Bankkonto — Mycelet (2345), NOK | **Active** |
| W-8BEN + Certificate of Foreign Status | **Active** (26.06.2026) |
| **Digital Services Act / EU trader** | **Active** — 27 land, oppdatert 17.06.2026 |

Motsigelsen mellom dokumentene er dermed avgjort: `launch-critical-path.md` hadde
rett, `neste-okt.md` tok feil om DSA. **Ingenting på Apples avtaleside blokkerer
lenger** — verken salg av abonnementer eller distribusjon i EU/EØS.

Det som gjensto av frykt her — at Apple måtte verifisere identiteten og legge
dager til uker på planen — er **allerede gjort**.

- [ ] Det ene som gjenstår å se etter: **banner om ny Program License Agreement**
      på [developer.apple.com/account](https://developer.apple.com/account). En
      ventende avtale sperrer både opplasting og innsending. Ikke observert ennå.

ℹ️ **Verdt å vite:** DSA-statusen betyr at navn, adresse og telefonnummer vises
offentlig på App Store-produktsiden. Det er hele poenget med regelverket, og det
er ikke til å komme unna for en næringsdrivende — men det er greit å ha registrert.

⚠️ **App-oppføringen finnes allerede** — app-id `6784672944`, SKU `mycelet-ios`,
status «Prepare for Submission». `launch-critical-path.md:43` ber deg opprette
den; det er feil.

## ~~Steg 2 — nøklene i Vercel~~ ✅ BEKREFTET 2026-08-05

Alle tre finnes på **Production** i prosjektet `mycelet` (team **Mycelet**, Pro):
`NEXT_PUBLIC_REVENUECAT_APPLE_KEY`, `REVENUECAT_WEBHOOK_AUTH`,
`REVENUECAT_ALLOW_SANDBOX`.

`REVENUECAT_WEBHOOK_AUTH` er i tillegg verifisert utenfra: webhooken svarer
**401** på en uautorisert forespørsel. Koden gir **503** når nøkkelen mangler, så
401 beviser at serveren har en verdi å sammenligne mot.

⚠️ **Verdien av `REVENUECAT_ALLOW_SANDBOX` er IKKE verifisert.** Den må være
nøyaktig strengen `1` (`route.ts:148` sjekker `!== '1'`), og fordi variabelen er
merket «Sensitive» kan den ikke leses tilbake i Vercel. Sandbox-kjøpet i steg 3
beviser den ende-til-ende. **Uteblir raden i `billing_subscriptions`, er dette
mistenkt nummer én** — sett den til `1` og redeploy.

### ⚠️ Feil Vercel-prosjekt finnes — ikke sett nøkler der

Det finnes et duplikat, `mycelet-7uj6`, under Hobby-teamet. Det er **ikke** den
live appen (siste deploy 5. juni, ingen custom domain), men det er koblet til
**produksjonsdatabasen** — `/api/health` rapporterer `database: ok` og Next
16.2.6 mot live-appens 16.2.12.

Det betyr en offentlig tilgjengelig deploy med to måneders manglende
kodefiks mot ekte data: private funn-bilder til feil bøtte, dataeksport som ikke
var fail-closed, prediksjonsfliser kallbare av anonyme. Databasefiksene gjelder
begge; kodefiksene gjør det ikke.

**Slett prosjektet**, eller fjern i det minste miljøvariablene så det ikke lenger
når databasen.

## ~~Steg 5 — skjemaene i App Store Connect~~ ✅ FERDIG 2026-08-05, kveld

Alt er fylt ut og lagret. Hva som ble funnet underveis:

| felt | status | merknad |
|---|---|---|
| App Information | ✅ | var nesten ferdig; SKU bekreftet `mycelet-ios` |
| **Content Rights** | ✅ | «Yes» — appen viser GBIF, Kartverket, Artsdatabanken m.fl. |
| **Aldersvurdering** | ✅ **13+** | UGC = Yes var allerede riktig satt. Apples nye skala (iOS 26) har 4/9/13/16/18, så 13+ er det jeg tidligere kalte 12+. Matcher våre egne vilkår (13 år). |
| Beskrivelse | ✅ | **måtte byttes** — den gamle lovet forum + sopptur-modus (avslåtte flagg) og sa 185 000 funn mot faktiske 428 829 |
| Promotional Text, Keywords, URL-er | ✅ | support-URL rettet til `/kontakt` |
| Skjermbilder | ✅ | seks nye fra august, via **Media Manager** (den innebygde visningen låste seg) |
| **App Privacy** | ✅ | var allerede publisert 29. juli, og de seks datatypene stemmer eksakt med `PrivacyInfo.xcprivacy` |
| **App Review Information** | ✅ | demo-passord synkronisert mot Supabase og verifisert; notatene skrevet om |
| Pricing and Availability | ✅ | 2 land (NO+SE), Public, ikke Mac/Vision Pro |

⚠️ **To feller å huske:**

1. **Tegntelleren i App Store Connect teller NEDOVER fra grensen.** «2 977» betyr
   1 023 tegn brukt av 4 000. Jeg leste den feil og trodde tekst hadde forsvunnet.
2. **Emoji avvises i Description.** Én 🍄 ga «This field contains one or more
   invalid characters». Kulepunkt, tankestrek og «» er greie. Nå voktet av
   `app-store-metadata.test.ts`.

## ⛔ Steg 3 — sandbox-kjøpet BLOKKERES av at ingen binær er lastet opp

**Forsøkt 2026-08-05 kl. 23:00–23:45. Virket ikke, og årsaken er funnet.**

Prissiden i appen viser fortsatt web-modus: prisene i kroner, bunnteksten
«Prisene er i norske kroner», ingen kjøpsknapper i det hele tatt.

### Hva som er utelukket (ikke gjør dette om igjen)

| hypotese | resultat |
|---|---|
| Appen kjøres ikke native | ❌ utelukket — var den ikke native, ville Stripe-knappene vist seg (`!native ? true : planOffer !== null`) |
| RevenueCat-nøkkelen mangler i web-bygget | ❌ utelukket — `isIapAvailable` kompilerte til `isNativePlatform() && !0`, altså er nøkkelen bakt inn |
| RevenueCat ikke lenket inn i app-bygget | ❌ utelukket — `RevenueCat_RevenueCat.bundle` ligger i `App.app`. NB: SPM-pakker lenkes **statisk**, så de vises IKKE i `Frameworks/` — jeg trakk feil konklusjon der først |
| Appen på telefonen var for gammel | ❌ utelukket — bygget på nytt med Capacitor 8.3.4 og installert, samme resultat |
| Paid Apps / bundle-ID / produkt-ID-er | ❌ alle verifisert riktige |

### Det som står igjen

**Ingen binær er lastet opp til App Store Connect.** Apples egen tekst på
Subscriptions-siden sier det rett ut:

> «Once your **binary has been uploaded** and your first subscription has been
> submitted for review, additional subscriptions can be submitted…»

Dette er den vanligste årsaken til tomme RevenueCat-offerings, og den siste som
står igjen på RevenueCats egen feilsøkingsliste.

### Rekkefølgen snus derfor

```
FØR:  test sandbox  →  arkiver  →  last opp  →  send inn
NÅ:   arkiver  →  last opp  →  test via TestFlight  →  send inn
```

Det er ikke et tap. Bygget skal opp uansett, og en TestFlight-test er nærmere det
reviewer faktisk gjør enn et lokalt debug-bygg.

## Steg 4 — Xcode (👤 15–30 min) ← **NESTE**

- [ ] Slå på **In-App Purchase**-capability på App-targetet
      (Signing & Capabilities → + Capability)
- [ ] La Xcode utstede distribusjonssertifikatet — skjer automatisk første gang
      du velger «Distribute App». Du har i dag bare et utviklersertifikat.

ℹ️ **Bygging fra kommandolinja VIRKER**, i motsetning til hva gamle notater sier.
Det gamle rådet om at codesign feiler i iCloud-mappa er feildiagnostisert — det
går fint så lenge byggemappa ligger utenfor iCloud:

```bash
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'id=EBCC8060-6E43-519C-A25F-B1D5CDD76E54' \
  -derivedDataPath /private/tmp/mycelet-ios-build \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=WUFJ6UBMPG CODE_SIGN_STYLE=Automatic build
xcrun devicectl device install app --device EBCC8060-6E43-519C-A25F-B1D5CDD76E54 \
  /private/tmp/mycelet-ios-build/Build/Products/Debug-iphoneos/App.app
```

Selve **arkiveringen** for App Store gjøres likevel i Xcode-vinduet første gang,
siden distribusjonssertifikatet utstedes der.

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

**Nedjustert 2026-08-05 til 1–3 uker** (var 3–6). Grunnen er at det store
usikkerhetsmomentet forsvant: DSA/EU trader-status og Paid Apps er begge Active,
så Apple-verifiseringen som kunne tatt uker er allerede unnagjort.

Det som fortsatt kan sprekke:

- **Sandbox-kjøpet** feiler som regel første gang — feil produkt-ID, feil
  sandbox-konto, gammelt bygg. Regn med to økter. Dette er nå den største
  gjenværende usikkerheten, fordi betalingsstien aldri har kjørt mot ekte StoreKit.
- **Minst én avvisningsrunde** er normalt. 1–3 dager per runde.
- **Xcode-signering** første gang. Distribusjonssertifikatet finnes ikke ennå.

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
