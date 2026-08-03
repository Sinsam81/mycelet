# Hvor langt rekker det forhåndsberegnede rasteret?

**Målt 2026-08-02.** Kom ut av spørsmålet «hvorfor ser kartet likt ut overalt?».
Terskelkalibreringen (se [kalibrering-av-dommene.md](kalibrering-av-dommene.md))
forklarte hvorfor fargene var like. Denne målingen forklarer hvorfor det er så få
ruter å se på i utgangspunktet.

## Målt

```
prediction_tiles     16 812 rader  ·  226 unike ruter
utstrekning          58,85 – 63,49 °N     5,05 – 11,56 °Ø
                     ≈ 515 km nord–sør
```

Det er Sør-Norge, omtrent Stavanger–Trondheim. Til sammenligning er Norge ~1750
km nord–sør og Sverige ~1570 km.

⚠️ **Målefelle:** PostgREST kapper på 1000 rader. Første forsøk leste bare den
første siden og ga «148 ruter, 181 km» — altså for lite. Tallene over er hentet
paginert med `Range`-hode, og ytterpunktene i tillegg bekreftet med
`order=center_lat.desc&limit=1`. Bruk samme framgangsmåte når dette måles på nytt.

## Hva brukeren får utenfor rasteret

`/api/prediction` (dev, 2026-08-02):

| sted | kilde | score | dom | ruter |
|---|---|---|---|---|
| Nesodden | `prediction_tiles` | 48 | poor | 3 |
| Oslo | `prediction_tiles` | 48 | poor | 3 |
| Trondheim | `prediction_tiles` | 57 | moderate | 3 |
| Göteborg | `computed_fallback` | 27 | poor | **0** |
| Tromsø | `computed_fallback` | 35 | poor | **0** |

Fallbacken svarer — den er ikke ødelagt — men den returnerer **ingen hotspots**.
Innenfor rasteret får man 3, utenfor 0.

## Det som IKKE er verifisert

Kartets fargede ruter tegnes ikke av `/api/prediction`, men av
`/api/prediction/grid`, og det endepunktet krever innlogging. Om grid-banen
degraderer på samme måte i Sverige og Nord-Norge er derfor **ikke** målt her.

Det er den neste tingen som bør sjekkes, og den krever en innlogget økt — enten
manuelt, eller via QA-testbrukeren (`npm run qa:setup`). Ikke anta at tabellen
over gjelder kartet før noen har sett etter.

## Hvorfor dette betyr noe

Sverige er et marked appen aktivt selger i. Hvis grid-banen også gir null ruter
der, ser en svensk bruker et kart uten et eneste søkeområde — uavhengig av hvor
riktig fargene og dommene er. Da er ingen av forbedringene i
[kalibrering-av-dommene.md](kalibrering-av-dommene.md) synlige for dem.

Rutene lages av `scripts/generate-prediction-tiles.ts`. Å utvide dekningen er en
kjøring, ikke en omskriving — men den bør gjøres bevisst, og kostnaden ved flere
ruter (lagring + generereringstid + vær-API-kall) bør regnes på først.
