# App Store-skjermbilder (iPhone 6,9")

**Tatt på nytt 2026-08-05** mot live www.mycelet.com, innlogget som QA-brukeren
(Gratis-nivå), posisjon Nordmarka. 440×956 @3x → **1320×2868 px**, som er nøyaktig
Apples krav for 6,9"-skjermen.

## ⚠️ Bildene er reproduserbare nå

Den forrige README-en sa «kjør skriptet på nytt» — men det skriptet fantes ikke.
Bildene fra juli var tatt for hånd og kunne ikke gjenskapes, så score-spriket de
selv flagget kunne aldri fikses.

Nå finnes det:

```bash
node scripts/capture-app-store-screenshots.mjs
```

Krever `QA_TEST_EMAIL` / `QA_TEST_PASSWORD` i `.env.local` (`npm run qa:setup`).
Tar ~2 minutter. Lukker cookie-banner, onboarding og kart-intro automatisk, og
klikker faktisk på «Lovende områder» for bilde 4.

## Filene

| Fil | Viser |
|---|---|
| `1-soppkart.png` | /map — Kartverket-topokart over Nordmarka, 6000 funn, artsfiltre og score-pill |
| `2-soppforhold.png` | Forsiden — «Høysesong! 42 matsopp i sesong nå», soppforhold-måler, flush-varsel og 7-dagers utsikt |
| `3-ai-identifikasjon.png` | /identify — AI-hjelp med tydelig sikkerhetsadvarsel (bra for App Review) |
| `4-lovende-steder.png` | /map med «Lovende områder» aktiv — 3 nummererte områder + «Se alle 12 med Premium» |
| `5-kalender.png` | /calendar — sesongkalender med Spiselig/Giftig-merker |
| `6-artsbibliotek.png` | /species — artsbiblioteket med søk og filtre |

## Opplasting i App Store Connect

- Slot: **6.9-inch display**. 1320×2868 portrett godtas direkte.
- Apple gjenbruker 6,9"-settet for mindre skjermer hvis du ikke laster opp egne.
- **iPad-bilder trengs ikke** — appen er satt til iPhone-only
  (`TARGETED_DEVICE_FAMILY = "1"`, endret 2026-08-05). Støtter du iPad igjen,
  kreves et eget 13"-sett.
- Anbefalt rekkefølge (de to første synes i søkeresultatene):
  1. `1-soppkart.png` · 2. `2-soppforhold.png` · 3. `4-lovende-steder.png`
  4. `3-ai-identifikasjon.png` · 5. `5-kalender.png` · 6. `6-artsbibliotek.png`

## Verdt å vite om tallene i bildene

Forsiden viser **69/100**, kartet viser **37–38/100**. Det ser ut som en
motsigelse og er det ikke: forsidetallet er vær og sesong for regionen, kartets
tall er hvor god akkurat den skogruta er for én art. Appen forklarer det selv i
bilde 2 — «Kartet regner på en annen måte, så tallene kan ikke sammenlignes
direkte».

**Vurder likevel å ta bildene på nytt om et par uker.** Forsiden sier akkurat nå
«marka er fortsatt for tørr etter tørkeperioden» og varsler regn om fem dager,
altså sopp rundt 18. august. Da blir begge tallene høye, og «Lite sopp her nå» på
kartet blir til noe som selger bedre. Ett skriptkall, to minutter.

Det er samtidig **ingen grunn til å vente med innsendingen** for dette. Ærlige tall
er ikke en svakhet på en sikkerhetsapp, og skjermbilder kan byttes i App Store
Connect uten ny gjennomgang.
