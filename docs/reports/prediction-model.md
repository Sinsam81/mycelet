# Prediksjonsmodell — status og beslutninger

## Hva modellen kan selge i dag

Mycelets dokumenterte fortrinn er arts- og breddegradsjustert timing. Temporal test med trening før 2021 og holdout fra 2021 ga:

- gammel månedsheuristikk: AUC 0,831
- empirisk fenologi: AUC 0,882

Dette er et tydelig signal for «når er det verdt å dra?». Det er sterkere enn dokumentasjonen for «nøyaktig hvor ligger soppen?».

## Romlig validering

Bakgrunner er nå andre sopparter i samme land/sesong og, når mulig, lokalt; logistisk SDM bruker geografiske blokker og region er ikke en standardfeature.

| Variant | AUC |
|---|---:|
| Full produksjonsform, korrigert | 0,521 |
| Habitat innen skog | 0,536 |
| Norge fullmodell | 0,539 |
| Sverige fullmodell | 0,513 |
| Forekomsttetthet alene | 0,471 |
| Romlig logistisk habitatmodell | 0,536 |

Beslutning: forekomsttetthet er ikke lenger poengboost; manglende habitat er nøytralt; en trent SDM er ikke satt i produksjon.

## Historisk værgrunnlag

Produksjonscache 14. juli 2026:

| Region/kilde | Rader | Temperatur | Fuktighet | 14d regn | Jordfuktighet |
|---|---:|---:|---:|---:|---:|
| Norge / Frost | 664 | 664 | 643 | 658 | 658 |
| Sverige / SMHI | 1 000 | 1 000 | 998 | 1 000 | 1 000 |

Kjerneartene har 200 svenske og 25 norske profiler hver. Frost-ruten bruker stasjoner som var gyldige på selve funndatoen. Manglende målinger forblir `null`; de erstattes ikke med 0 eller standardfuktighet i treningsdata.

## Streng vær-holdout

Vinduene læres på de eldste 70 % av hver arts rader og måles på nyeste 30 %. Bakgrunner er andre arter i samme region og måned, med prioritet for samme år og innen 150 km.

| Art | Temp AUC | 3d regn AUC | Fukt AUC | Jordfukt AUC |
|---|---:|---:|---:|---:|
| Kantarell | **0,623** | 0,551 | 0,495 | 0,436 |
| Steinsopp | 0,370 | 0,520 | 0,412 | 0,444 |
| Traktkantarell | 0,512 | 0,574 | 0,415 | **0,666** |
| Piggsopp | 0,520 | 0,527 | 0,484 | 0,446 |
| Svart trompetsopp | 0,510 | 0,483 | 0,438 | 0,525 |

Dette er screening, ikke en ferdig kalibrert sannsynlighetsmodell. Utvalget er fortsatt SE-tungt, og den norske kjerneartsdelen er bare 25 per art.

## Anbefalt neste modellversjon

1. Samle minst 500 profiler per art/region med spredning i år og geografi.
2. Reserver en helt ny testperiode som ikke brukes til valg av features.
3. Test kun artsspesifikke kandidater som allerede viser holdout-signal: kantarell-temperatur og traktkantarell-jordfuktighet først.
4. Krev forbedring mot fenologi-only og flat baseline i AUC, Brier score og kalibreringskurve.
5. Bruk nye positive/negative feltbesøk som ekstern virkelighetstest; forekomstregistre alene har innsamlingsbias.
6. Rull ut én liten vektendring om gangen, med modellversjon, før/etter-backtest og rollback.

## Svensk skogdata

Skogsstyrelsen beskriver volum, høyde, grunnflate, diameter og biomasse i 10×10 m-celler, men REST/WMS-raster krever brukerkonto. Offentlig ArcGIS viser metadata, ikke de nødvendige pikselverdiene. CORINE beholdes derfor som sikker fallback til tilgang er på plass og en ny adapter slår SE-baseline.

