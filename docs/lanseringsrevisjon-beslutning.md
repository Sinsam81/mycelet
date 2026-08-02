# Lanseringsrevisjon — hva vi ikke vet, og hva jeg anbefaler

> Del 8 og 9 i `docs/lanseringsrevisjon.md`. Kjørt mot commit `95b23fd` = produksjon.

## Rammen

Målet ble formulert som «100 % sikre på at appen er god nok for lansering». Det tallet finnes
ikke. Her er hva som faktisk ble oppnådd:

- 56 flater kartlagt, 59 brukervendte tall sporet til der de beregnes
- 188 rå funn, 55 gjennom motbevis, 50 overlevde, 23 nedgradert
- Hver fil:linje i kritisk/høy åpnet og kontrollert — null oppdiktede henvisninger
- Alle kvalitetsporter grønne: typecheck, lint, 752 tester, 0 sårbarheter

Og her er hva som **ikke** ble oppnådd, som er den viktigste delen av dokumentet.

---

## Det ingen kodegjennomgang kan avgjøre

### Krever soppsakkyndig

Dette er ikke teoretisk. Da vi gikk gjennom eksisterende svenske artsnavn viste **fire av 26** seg
å være feil, og tre av dem var navnet på en *annen* art.

| Spørsmål | Hvis det er galt |
|---|---|
| Er de 72 artsbeskrivelsene biologisk riktige? | En bruker spiser feil sopp. Den ene feilklassen i appen som kan drepe. |
| Er `symptoms` og latenstidene riktige? | Feil latenstid kan få en forgiftet bruker til å **utsette legekontakt** — nøyaktig det teksten skal hindre. |
| **Hvilke forvekslingspar mangler i `look_alikes`?** | 24 av 45 matsopper har ingen. Jeg kan telle hullene; bare en mykolog kan si hvilke som er farlige. |
| Viser artsbildene faktisk riktig art? | Brukeren lærer feil kjennetegn fra kilden som skal være fasit. |
| Hvor treffsikker er Kindwise på nordiske arter? | Hele sikkerhetsrammen er bygget rundt en presisjon vi ikke kjenner. |

Kolonnen `verified` er **`false` for alle 72 arter**, og det vises ikke for brukeren. Ved en
forgiftningssak er «vi visste at innholdet var ukontrollert og skjulte det» et skjerpende faktum.

### Krever jurist

- Holder ansvarsfraskrivelsen i vilkårene? **ØVERÅS APPS er et ENK, ikke et AS.**
- GA4 og overføring til USA — og se H11: samtykket kan gis ved et bomtrykk.
- Er jitteren på «omtrentlig» tilstrekkelig anonymisering? Et posisjonslekk er meldepliktig etter art. 33.
- Bildeattribusjon og lisenssmitte på artsbildene.
- Markedsføringen av det romlige signalet. Hvis den ikke holder: krav om tilbakebetaling fra alle som kjøpte for «hvor».

### Krever deg

- **Produktansvarsforsikring.** Ett erstatningskrav etter forgiftning treffer privatøkonomien
  direkte. Dette er den største enkeltrisikoen ved å lansere, og den er ikke teknisk.
  `docs/forsikring-foresporsel.md` ligger klar.
- **Live Stripe-priser.** `.env.local` har testnøkkelen, så jeg verifiserte testmodus: 79 kr/mnd og
  249 kr/år, riktige pris-ID-er. **Live-prisene kan jeg ikke se herfra.** Åpne Stripe Dashboard →
  Products og bekreft de samme to tallene.
- **Alt bak innlogging.** Jeg taster aldri passord. Kartet, profilen, funnregistrering, forumet og
  betalingsflyten må du åpne selv.
- **Alt på fysisk iPhone.** IAP-sandbox, kamera, GPS, og om offline faktisk virker i flymodus.

### Krever tid

Om prediksjonene stemmer kan bare måles mot ekte funn over en hel sesong. Det romlige signalet
ligger på AUC ~0,52 — nær myntkast. Det tidsmessige på 0,89. Ingenting i denne revisjonen endrer det.

---

## Klar / blokkerer, per flate

| Flate | Dom | Begrunnelse |
|---|---|---|
| Auth og sesjon | **Klar** | 15 redirect-angrep mot produksjon, 0 lekkasjer. 5 av 5 beskyttede ruter avviser. |
| Sikkerhetsheadere og CSP | **Klar** | Alle seks til stede, CSP enforcing. |
| Posisjonspersonvern | **Klar** | Kun `display_*` til anon, 0 private funn lekket, stabil grovkorning. |
| Kvalitetsporter | **Klar** | 752 tester, 0 sårbarheter, ingen drift mellom main og prod. |
| Artsbibliotek | **Blokkerer** | K1, K2, K3 — advarsler som finnes vises ikke, og advarsler som mangler markeres ikke. |
| AI-identifisering | **Blokkerer** | K3 — tomt forvekslingsresultat er ikke til å skille fra «ingen fare». |
| Svensk opplevelse | **Blokkerer** | K4 — sikkerhetsprosaen er norsk, inkludert de 14 forvekslingstekstene. |
| Offline-kart (betalt) | **Blokkerer** | K5 — laster ned tomt hav. Verifisert: 854 mot 111 250 bytes. |
| Prediksjonsraster | **Klar med begrensning** | H0 — kjør migrasjon 033. Fem minutter. |
| Værkilder | **Klar med begrensning** | H1/H8 — SMHI er død, Sverige kjører på Open-Meteo. Virker, men er ukreditert og feilkreditert. |
| 7-dagersstripen | **Klar med begrensning** | H2/H10 — samme score får motsatt farge på nabodager. |
| Betaling og abonnement | **Klar med begrensning** | H7/H14/H15/H16 — utløpt abonnement vises som aktivt. Ingen kunde har mistet tilgang. |
| App Store-innsending | **Blokkerer** | K5 + H17 + H18 — offline-løftet holder ikke, og demokontoen revokeres av reviewerens eget sandbox-kjøp. |

---

## Anbefalingen

**Web-appen skal ikke rulles tilbake.** Den er live, den fungerer, og ingen av de fem kritiske
funnene ødelegger noe som virker i dag — de handler om advarsler som *ikke vises* og en
premiumfunksjon som *ikke leverer*.

**App Store-innsendingen bør vente på fem ting.** Ikke fordi Apple ville avvist på alle, men
fordi tre av dem gjør at appen lover noe den ikke holder — og det er den ene tingen Apple
faktisk avviser for.

Rekkefølgen er valgt etter timer per risiko:

| # | Hva | Tid |
|---|---|---|
| 1 | **Migrasjon 033** — lim inn i SQL-editoren | 5 min |
| 2 | **K2** — fjern én betingelse, 45 advarsler blir synlige | < 1 time |
| 3 | **K1** — legg inn grønnkremle → grønn fluesopp | < 1 time |
| 4 | **K5** — én faktor ½ i kartmatematikken, pluss en test som kan feile | 1–2 timer |
| 5 | **K3** — skill «tomt» fra «mangler» fra «feilet» | 3–4 timer |
| 6 | **K4** — svenske kolonner + oversettelse | 2–4 dager + soppsakkyndig |

Punkt 1–4 er **under fire timer til sammen** og fjerner tre av fem kritiske funn.

## Om tidsvinduet

Det er august. Soppsesongens topp er nå, og det er det beste lanseringsvinduet i året.

Den avveiningen skal skrives ut, ikke skjules: **punkt 1–5 koster under en arbeidsdag.** Punkt 6
koster en uke og krever en ekstern fagperson. Å vente på K4 betyr å vente på soppsakkyndig
gjennomgang — som du uansett trenger før du kan si at artsdataene er kvalitetssikret.

Mitt råd: ta 1–5 nå, send inn til App Store, og kjør K4 som en oppdatering. Den svenske
markedsføringen bør vente til K4 er ute.

## Én ting til

Advarslene i K2 var allerede skrevet. Noen hadde tenkt gjennom at grønnkremle forveksles med
grønn fluesopp, formulert det, og lagt det i databasen. En enkelt betingelse i en JSX-blokk gjorde
at ingen har sett dem.

Det er verdt å merke seg hva slags feil det er. Ikke manglende arbeid — **usynlig arbeid.** Og den
eneste måten å finne den på var å sammenligne det appen viser med det som står i databasen.
