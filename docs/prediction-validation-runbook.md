# Prediksjonsvalidering

Dette er runbooken for å skille tre ting som lett blandes sammen:

- timing: når er arten finnbar?
- romlig gjentakelse: finnes det gamle funn nær cellen?
- habitat: gir skogdata/vertstre/host-gate et ekte romlig signal?

Ikke bruk resultater fra disse scriptet til å påstå mer enn de faktisk tester.

## Kveldskjøring

Kjør dette fra repo-roten med lokal `.env.local` som inneholder `NEXT_PUBLIC_SUPABASE_URL` og `SUPABASE_SERVICE_ROLE_KEY`.

Først en rask sanity:

```bash
npm run typecheck
npm test -- --run src/lib --exclude '.claude/**'
```

Kalibrering mot ekte brukerfeedback:

```bash
npm run calibrate:spot-feedback
```

Kandidat-tabell for scorekalibrering når du har nok feedback:

```bash
npm run calibrate:fit-score
```

Maskinlesbart uttrekk, hvis du vil lime tall tilbake til Codex senere:

```bash
mkdir -p .next/validation
npm run calibrate:spot-feedback -- --json > .next/validation/spot-feedback.json
```

Sampled full-pipeline spatial audit:

```bash
MAX_TEST=300 NEG_PER_POS=3 FOREST_CONCURRENCY=4 npm run backtest:full-pipeline
```

Over-natten-variant når cache er varm eller du har tid:

```bash
mkdir -p .next/validation
MAX_TEST=1000 NEG_PER_POS=5 FOREST_CONCURRENCY=4 npm run backtest:full-pipeline -- --json > .next/validation/full-pipeline.json
```

`backtest:full-pipeline` bruker `.next/backtest-full-pipeline-forest-cache.json` som cache for NIBIO/CORINE-oppslag. Det er med vilje, og filen skal ikke committes.

## Hvordan lese spot_feedback

`calibrate:spot-feedback` svarer på: stemmer scoren vi viser med faktisk funnrate?

Viktigste felt:

- `Brier`: lavere er bedre.
- `baseline Brier`: hva du får ved å alltid gjette total funnrate.
- `Brier skill`: positivt betyr bedre enn baseline, negativt betyr verre.
- `ECE`: forventet kalibreringsfeil. Lavere er bedre.
- `AUC`: sekundart. Det sier bare om høyere score rangerer funn over ikke-funn.
- `By region`: se etter NO/SE-forskjeller. Svensk score kan være svakere fordi CORINE er grovere enn NIBIO SR16.

Tolkning:

- Under 100 rader: instrumenteringssjekk, ikke modellkonklusjon.
- 100-500 rader: bruk bare store avvik, spesielt hvis høye score-binner har lav funnrate.
- 500+ rader: begynn å justere scorekalibrering.
- Positiv `Brier skill` er et minimumskrav for å hevde at scoren er kalibrert bedre enn en flat baseline.
- Hvis `mean score` er mye høyere enn `found rate`, er produktet overkonfident.
- `calibrate:fit-score` lager bare et forslag. Ikke wire tabellen i produktet før du har nok rader og region-splitten ser stabil ut.

## Hvordan lese full-pipeline-backtesten

`backtest:full-pipeline` svarer på: gir habitat/skog/vertstre romlig lift mot steder folk faktisk leter?

Viktigste varianter:

- `occurrenceOnly`: avstandsvektet historisk funn-gjentakelse.
- `habitatWithinForest`: habitat/vertstre blant punkter der begge sider har skogdata.
- `habitatCandidate`: produksjonens kandidatmask + habitat. Ingen skogdata blir ingen lovende-sted-kandidat.
- `fullCore`: kandidatmask + habitat + occurrence + fenologi.
- `forestMask`: om grid-ruten i det hele tatt kan score punktet som skogcelle.

Tolkning av target-group AUC:

- 0.48-0.52: ingen påviselig romlig signal.
- 0.53-0.57: svakt signal. Bruk som internt prior, ikke som hard produktpåstand.
- 0.58-0.62: nyttig signal, men fortsatt sjekk sampling/region.
- Over 0.62: klart lovende, men verifiser med større sample og per-region-splitt.

Sammenligninger som betyr noe:

- `fullCore` må slå `occurrenceOnly` for at habitatdelen skal ha additiv verdi i kartet.
- `habitatWithinForest` over 0.5 betyr at vertstre/habitat rangerer bedre enn tilfeldig blant skogpunkter.
- Høy `forestMask` men lav `habitatWithinForest` betyr at skogmasken finner skog, men arts-habitatreglene gir ikke ekstra signal.
- NO bra og SE svak betyr sannsynligvis datakilde-asymmetri, ikke at svenske sopper er uforutsigbare.

## Dette er fortsatt ikke validert

Disse scriptet validerer ikke historisk værrespons. `backtest:full-pipeline` bruker ikke dagens vær som proxy for gamle funn, fordi det ville gitt falsk presisjon.

Neste ekte modellsteg trenger en datakilde for vær ved funntidspunkt:

- MET Frost for Norge.
- SMHI historiske observasjoner eller grid for Sverige.
- Et cachet feature table per occurrence: temperatur, nedbør siste 3/7/14 dager, luftfuktighet/jordfuktighet der tilgjengelig.

Først når dette finnes kan vi si om værleddet predikerer funn utover fenologi og occurrence-bias.

## Neste fase: historisk vær-cache

Migrasjon `022_occurrence_weather_features.sql` legger opp en intern feature-tabell for vær ved funntidspunkt. Byggescriptet fyller den fra MET Frost (NO) og SMHI corrected archive (SE):

```bash
npm run features:occurrence-weather -- --help
```

Start alltid med dry-run og liten batch:

```bash
LIMIT=25 DRY_RUN=1 npm run features:occurrence-weather
```

Skriv en liten norsk batch:

```bash
REGION=NO LIMIT=100 npm run features:occurrence-weather
```

Skriv en liten svensk batch:

```bash
REGION=SE LIMIT=50 npm run features:occurrence-weather
```

Viktige forbehold:

- Norge krever `MET_FROST_CLIENT_ID`.
- Sverige laster store SMHI CSV-arkiv per stasjon/parameter første gang. Cache ligger i `.next/weather-feature-cache/`.
- Standard er `SKIP_EXISTING=1`, så scriptet hopper over rader som allerede har features.
- Standard er `WRITE_ERRORS=0`, så manglende værdata forsøpler ikke feature-tabellen.
- Bruk `OFFSET=...` for å jobbe deg gjennom flere batcher.

## Hva du skal lime tilbake

Etter kveldskjøring, lim disse linjene tilbake til Codex:

- `Rows`, `found rate`, `mean score`, `Brier`, `baseline Brier`, `Brier skill`, `ECE`.
- `By region` fra `calibrate:spot-feedback`.
- AUC-tabellen fra `backtest:full-pipeline`.
- `AUC by presence region`.
- `Presence forest coverage` og `background forest coverage`.
- Fra `features:occurrence-weather`: `Features ready`, `By region`, og `Skipped/errors not written`.

Da kan neste steg være konkret: kalibrere score, endre habitatregler, eller konkludere med at stor SDM må prioriteres.
