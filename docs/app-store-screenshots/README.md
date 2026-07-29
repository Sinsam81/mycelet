# App Store-skjermbilder (iPhone 6,9")

Tatt 2026-07-28 mot live www.mycelet.com, innlogget som QA-brukeren (Gratis-nivå),
mobilvisning 440×956 @3x → **1320×2868 px** (nøyaktig kravet for 6,9"-skjermen).
Cookie-banner, onboarding og kart-intro er ferdig lukket i alle bildene.

## Filene

| Fil | Viser |
|---|---|
| `1-soppkart.png` | /map — Kartverket-topokart over Oslomarka med funn-prikker, artssøkefelt, «Funn»/«Lovende steder»-knapper og score-pill nederst |
| `2-soppforhold.png` | Forsiden — «Sommer i skogen», soppforhold-måleren (72/100, «Perfekt soppdag i dag!»), 7-dagers utsikt og «Identifiser sopp»-kortet |
| `3-ai-identifikasjon.png` | /identify — AI-hjelp med tydelig sikkerhetsadvarsel (bra for App Review), «Ta bilde / velg bilde» og databasesøk |
| `4-lovende-steder.png` | /map med «Lovende steder» aktiv — nummererte nåler (1–3) i Nordmarka + «Se alle 12 lovende steder med Premium»-banner |
| `5-kalender.png` | /calendar — Sesongkalender for juli med Spiselig/Giftig-merker og «Tilpass til min posisjon» |
| `6-artsbibliotek.png` | /species — «Norske og svenske sopper», 72 arter, søk + filtre og bildekort |

## Opplasting i App Store Connect

- Slot: **6.9-inch display** (iPhone 16 Pro Max-klassen). 1320×2868 portrett godtas direkte.
- Apple gjenbruker 6,9"-settet for mindre skjermer hvis du ikke laster opp egne.
- Anbefalt rekkefølge (de to første synes i søkeresultatene — selg kart + forhold først):
  1. `1-soppkart.png`
  2. `2-soppforhold.png`
  3. `4-lovende-steder.png`
  4. `3-ai-identifikasjon.png`
  5. `5-kalender.png`
  6. `6-artsbibliotek.png`

## Verdt å vurdere før innsending

- **Score-pillen på kartet viser «10/100 Svake forhold»** (ekte juli-data), mens
  forsiden viser 72/100 «Perfekt soppdag». Det spriker litt hvis noen ser begge.
  Vurder å ta kartbildene på nytt i august/september når kart-scoren er høy —
  samme metode, bare kjør skriptet på nytt.
- `4-lovende-steder.png` viser Premium-oppsalgsbanneret. Det er ærlig og viser
  betalingsmodellen, men bytt til et Premium-innlogget bilde hvis du heller vil
  vise alle 12 nålene uten banner.
- Bildene er tatt i mobil-web (samme UI som Capacitor-appen laster), så de er
  representative for iOS-appen.
