# Kjerneforbedringer

Prioritet er vurdert som bruker-/inntektsverdi delt på risiko og innsats.

## Implementert

| Prioritet | Område | Forbedring | Hvorfor det betyr noe |
|---:|---|---|---|
| 1 | Prediksjon | Daglige, overvåkede fliser og ærlig nøytral fallback | Betalt kjernefunksjon leverer ferske data og unngår falsk presisjon |
| 2 | Prediksjon | Historisk NO/SE-værcache + streng holdout-audit | Gjør fremtidige artsvekter evidensbaserte |
| 3 | Prediksjon | Feltfeedback med negative observasjoner og full kontekst | Skaper treningsdata som faktisk kan kalibrere sannsynlighet |
| 4 | Kart | Progressiv kontrollflate og mobilvennlige ark | Løser den tydeligste brukerklagen uten funksjonstap |
| 5 | Sverige | Svenske navn i katalog, kalender, kart og søk | Fjerner en direkte troverdighets-/konverteringsfeil |
| 6 | Drift | Prediksjonsferskhet som egen helseindikator | Gjør stille modellstans synlig før brukerne merker den |

## Neste anbefalte arbeid

1. **[Høy verdi / middels innsats] Artsvis værmodell.** Utvid til minst 500 uavhengige profiler per kjerneart og region. Test kantarell-temperatur og traktkantarell-jordfuktighet på en ny, urørt holdout før en liten artsspesifikk vektendring.
2. **[Høy verdi / lav innsats] Gjør «når» til hovedproduktet.** Løft beste dag, flush-status og artsvis toppvindu frem i onboarding, betalingsside og prediksjon. Dette er AUC 0,882-signalet.
3. **[Høy verdi / ekstern avhengighet] Svensk skogdata.** Skaff Skogsstyrelsen-konto, bygg feature-flagget adapter med CORINE-fallback og krev forbedret SE-AUC før aktivering.
4. **[Høy verdi / datatid] Feedbackkalibrering.** Vent på minst 100 rader for instrumentkontroll og 500+ for første reelle kalibrering. Mål Brier skill mot flat og enkel sesongbaseline.
5. **[Middels verdi / middels innsats] Turverktøy.** GPX, bilposisjon og offline-status bak «Mer» kan øke premium-retensjon uten å blande seg inn i modellpoeng.

## Bevisst utsatt

- Trenet romlig SDM settes ikke live: korrigert AUC er for svak.
- Universell værvekt settes ikke live: arter reagerer forskjellig, og flere signaler er under 0,5 i holdout.
- MapLibre/vector-migrasjon utsettes: stor risiko, svak direkte inntektsverdi nå.
- Forumflagget endres ikke: ingen evidens for at det er viktigere enn prediksjon, IAP og drift.

