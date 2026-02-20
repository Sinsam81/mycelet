# Vegetasjonsanalyse MVP (Fase 1)

## Mål
Levere prediksjon av sannsynlighet for soppfunn i nærområde uten satellitt-pipeline, ved å kombinere:
- Værdata (temp, fuktighet, nedbør)
- Historiske funn i området
- Sesongeffekt

## Inputs
- `lat`, `lon`
- valgfritt: `radiusKm` (default 15), `speciesId`

## Scoringsmodell (0-100)
- Miljøscore (0-50):
  - Temperatur 8-18C gir høy score
  - Fuktighet > 70 gir høy score
  - Nedbør siste 3 døgn gir høy score
- Historisk score (0-35):
  - Funn siste 30 dager i området
  - Funn siste 365 dager i området
- Sesongscore (0-15):
  - Peak i august-oktober

## API
- `GET /api/prediction?lat=..&lon=..&radiusKm=..&speciesId=..`
- Returnerer:
  - `score`, `condition`
  - `components` (miljø/historikk/sesong)
  - `hotspots[]` med koordinat, antall funn, score

## Fase 2 (satellitt)
- Koble inn NDVI/jordfuktighet (Sentinel)
- Batch-jobb som pregenererer grid-score
- Server vektorfliser/heatmap

## Implementert overgang (MVP -> Fase 2)
- Kartet forsøker å hente fliser fra `prediction_tiles` via `get_prediction_tiles_in_bounds`.
- Hvis ingen fliser finnes i området, brukes hotspot-output fra `/api/prediction`.
- Artsfilter (`speciesId`) sendes både til prediksjons-API og tile-RPC.
- `/api/prediction` bruker nå også `prediction_tiles` som primærkilde og returnerer `source: "prediction_tiles"` ved treff, ellers `source: "computed_fallback"`.
- Prediksjonsrespons inkluderer `model.version` og faktorer:
  - `vegetation`, `moisture`, `terrain`, `soil`, `weatherTrend`.
- Gratisbrukere får avrundet/forkortet faktorvisning (`free_limited`), premium får full detalj (`premium_full`).
