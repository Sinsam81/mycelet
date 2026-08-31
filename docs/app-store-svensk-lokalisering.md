# Svensk App Store-side — ✅ ALLEREDE LIVE (verifisert 2026-08-30)

Dette dokumentet ble opprettet 2026-08-30 som «ferdige tekster til innliming»,
men en sjekk av den faktiske svenske butikksiden samme kveld viste at jobben
ALT VAR GJORT — den svenske lokaliseringen gikk ut med **v1.0.1** (~2026-08-26,
versjonsnotat: «Svensk butiksbeskrivning och småfix»). Gjeld-notatet i
`app-store-metadata.md` («Svenske ord er bevisst ute») er dermed historikk.

Verifisert live på https://apps.apple.com/se/app/id6784672944 :

| Felt | Live verdi |
|---|---|
| Tittel | `Mycelet: Svampkarta & prognos` |
| Undertittel | `Svamptur, kantarell och AI` |
| Beskrivelse | Full svensk — svampkonsulent + Giftinformationscentralen 010-456 67 00 / 112 |
| Priser i beskrivelsen | Løst elegant: «Aktuella priser i din valuta visas i appen och i App Store» (godkjent av review) |
| Skjermbilder | Svenske (lastet opp av Sindre) |

Konsekvens: **SE-kampanjen i `apple-search-ads-oppsett.md` er IKKE blokkert**
— svenske annonser lander på en svensk side.

Rest-notater (småting, ingen hast):
- App Store viser «SPRÅK: norska bokmål» — det er binærens deklarerte språk
  (CFBundleLocalizations), ikke butikksiden. Å legge `sv` til i Xcode-prosjektets
  localizations viser «norska, svenska» der. Kosmetisk.
- Nøkkelordfeltet (100 tegn) er ikke offentlig synlig — kan kun verifiseres i
  App Store Connect. Kandidatliste hvis det trenger påfyll:
  `svamp,svampapp,svampguide,matsvamp,svampplockning,karljohan,kantarell,trattkantarell,giftsvamp` (94/100).
