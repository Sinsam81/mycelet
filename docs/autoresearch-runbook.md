# AutoResearch-runbook: fenologi-loopen

Inspirert av Karpathys AutoResearch (mars 2026): en agent foreslår én endring,
måler, beholder bare det som slår beste kjente resultat, og gjentar. Mycelets
variant retter loopen mot fenologi-scoringen — appens validerte kjernesignal.

**Avtalt oppstart: 14. september 2026, kl. 21 (etter annonse-sjekkpunktet 13.).**

## Målet (dommeren)

```bash
CUTOFF=2019-01-01 CUTOFF_END=2021-01-01 NEG_IN_SEASON=1 npm run backtest:phenology -- --json   # DEV-splitt (loopen)
NEG_IN_SEASON=1 npm run backtest:phenology -- --json                                           # KANONISK (kun til slutt)
```

Metrikken er `auc.empiricalPhenology`. Kjøretid ~80 s (målt 2026-09-01).

**Hvorfor dev-splitten ser slik ut (rettet 2026-09-05 etter ekstern
gjennomgang):** første utgave brukte `CUTOFF=2020-01-01` alene. Uten øvre
grense er «test» alt ≥ 2020 — og 85 % av de radene ER det kanoniske
sluttsettet (≥2021). Loopen ville altså optimalisert på fasiten, og
sluttkjøringen ville ikke vært uavhengig av noe som helst. Nå: dev = tren
<2019, test 2019–2020 (`CUTOFF_END` holder 2021+ helt utenfor, også utenfor
treningen). Kanonisk = tren <2021, test ≥2021, rørt én gang.

`NEG_IN_SEASON=1` trekker negativ-uker fra april–november i stedet for hele
året. Vinteruker har ~0 i alle kurver og vinnes trivielt; hel-års-tallet
(0,882) er derfor høyere enn oppgaven brukeren har. Innen-sesong-tallet er
det konservative, og det loopen skal måles på. Journalfør begge for
basislinjen så tallene på /apenhet kan oppdateres ærlig.

**Basislinje 2026-09-01, kanonisk splitt (tren <2021, test ≥2021):**
`0.88226` over 456 064 sammenligninger, 72 kurver, 114 016 testfunn.
Dev-basislinjen (CUTOFF=2020) måles som iterasjon 0 i selve kjøringen.

## Mutasjonsflaten (det ENESTE agenten får røre)

`scripts/phenology-core.mjs` — kurvebygging og oppslag: båndinndeling
(BANDS), minimumsutvalg (MIN_SAMPLE_ALL/BAND), glatting i finalizeCurve,
vekting, priors. Én liten, begrunnet endring per iterasjon.

Uenerbart: backtest-skriptet selv, splitt-logikken, datainnhenting, alt i
src/ — OG `FRUITING_MONTH_MIN`/`FRUITING_MONTH_MAX` i phenology-core.mjs.
De to ligger i fila agenten får røre, men styrer hvilke rader som blir
positiver i testen (`weekIndexFromISO`): snevres vinduet, forsvinner de
vanskelige skuldersesong-funnene og devAUC stiger uten at modellen ble
bedre. En «forbedring» som kommer av å endre målingen er juks, ikke funn.
Tilsvarende: ingen endring som gjør at `report.method.testRows` endrer seg
mellom iterasjoner er lovlig — testsettet skal være identisk hele natten.

## Protokollen

1. `git checkout -b autoresearch-YYYYMMDD` fra fersk main.
2. Iterasjon 0: kjør DEV-splitten urørt → dev-basislinje. Journalfør i
   `.next/autoresearch/journal.md` (hypotese, diff, devAUC, beslutning — hver
   iterasjon, også de forkastede: forkastede hypoteser er også kunnskap).
3. Loop (maks 40 iterasjoner ELLER 4 timer, det som kommer først):
   hypotese → minimal diff i phenology-core.mjs → DEV-backtest →
   **behold hvis devAUC > beste + 0.0003**, ellers `git checkout` tilbake.
   Terskelen finnes fordi ±0.0002 er støy mellom kjøringer.
4. Sluttritual, i rekkefølge:
   a. `npm run test -- src/lib/prediction` — TS-porten av fenologien skal
      fortsatt være grønn (det finnes ingen egne tester for phenology-core.mjs;
      båndgrensene der er duplisert i src/lib/prediction/phenology.ts og MÅ
      holdes like — en BANDS-endring uten src-endring når aldri produksjon)
   b. ÉN kjøring på kanonisk splitt (med `NEG_IN_SEASON=1`) — første og eneste
      gang under hele løpet
   c. Rapport i journalen: dev-gevinst vs. kanonisk gevinst, tabell over
      beholdte endringer, forkastede hypoteser verdt å nevne
5. Push branch + PR med hele journalen. **ALDRI merge selv** — eieren og
   hoved-Claude gjennomgår diffen som enhver annen modellendring.

## Ærlighetsreglene (arver runbooken for prediksjonsvalidering)

- Reproduserer ikke dev-gevinsten på kanonisk splitt, er det OVERTILPASNING
  og rapporteres som det — det er også et resultat, og et viktig ett.
- Metrikken måler «findability timing» (når folk finner OG leter), ikke
  fruktifisering i seg selv. Ingen påstander utover det.
- Tallene på /apenhet oppdateres først når PR-en er menneskegodkjent, merget
  og kurvene regenerert.
- Kostnadsramme: én kveldskjøring. Ingen kontinuerlig loop uten ny beslutning.

## Fra funn til produksjon (etter godkjent PR)

Produksjonen leser ferdigbygde kurver, ikke phenology-core direkte. Etter
merge: regenerer 52-ukers-kurvene med `node --env-file=.env.local
scripts/generate-phenology.mjs` (IKKE `calibrate:season-windows` — det lager
månedsvinduene til season-window-data.ts, ikke kurvene), speil eventuelle
BANDS-endringer i src/lib/prediction/phenology.ts, kjør full testsuite, og la
neste netlige tilegenerering plukke opp endringen. Dette steget står eksplisitt i PR-en som eierens sjekkliste.
