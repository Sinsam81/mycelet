# NIBIO SR16 — oppsett for habitat-scoring

Dette dokumentet beskriver hvordan vi kobler **NIBIO SR16** (skogressurs-raster, 16×16 m) inn i prediksjons-pipelinen. Modulen ligger i `src/lib/nibio/` og er allerede skaffolet med riktig type-shape — det som mangler er den faktiske dataforbindelsen.

## Hva SR16 er

NIBIO sin **Skogressurser 16×16 m** dekker hele Fastlands-Norge med:

| Felt           | Type                                                  | Bruk i prediksjon                                  |
|----------------|-------------------------------------------------------|----------------------------------------------------|
| Treslag        | gran, furu, lauv, blandet                             | Direkte mycorrhiza-match (sterkeste signal)        |
| Bestandsalder  | år                                                    | Eldre = bedre soppnettverk → høyere score          |
| Bonitet (H40)  | meter (høyde dominerende trær ved 40 år)              | Indikator for kalkrik / næringsrik mark            |
| Volum          | m³/ha                                                 | Tett vs glissen skog (proxy for skog-modenhet)     |

Datasettet er **gratis**, oppdatert ca årlig, og lisensieres under CC BY 4.0 (kreditér NIBIO i UI).

## To implementasjonsveier

### Vei 1 — Live WFS-spørring mot NIBIO Kilden (raskeste å komme i gang)

Pros: Ingen lokal lagring. Alltid ferskt datasett.
Cons: Nettverkshopp per celle (langsomt for tile-generering). Avhengig av kilden.nibio.no oppetid. Ratebegrensninger uklare.

```typescript
// Pseudokode for src/lib/nibio/sr16.ts
const url = `https://wfs.nibio.no/cgi-bin/sr16?` + new URLSearchParams({
  service: 'WFS',
  request: 'GetFeature',
  typeName: 'sr16:tre',
  bbox: `${lon-0.001},${lat-0.001},${lon+0.001},${lat+0.001},EPSG:4326`,
  outputFormat: 'application/json'
});
const response = await fetch(url);
// Parse GeoJSON FeatureCollection, return first feature's properties
```

Test-WFS-endpoint må bekreftes mot https://nibio.no/tjenester/wms-tjenester. Hvis WFS ikke er åpen, fall tilbake til WMS GetFeatureInfo.

### Vei 2 — Lokal PostGIS-tabell (anbefalt for produksjon)

Pros: Single spatial query (≤10 ms), deterministisk latency, fungerer uten nett.
Cons: Engangs-jobb å laste inn (~10 GB raster nedlastet, ~1-2 GB i Postgres etter komprimering med ST_Tile). Må fornyes ved nye SR16-utgivelser (årlig).

Stegene (gjort manuelt + verifisert av Claude før migrasjon):

1. **Last ned SR16 GeoTIFF** fra NIBIO Kilden → "Skogressurser 16×16 m" → Last ned. Velg Sør- og Østlandet først (ca 4 GB) — dekker det meste av brukermassen.
2. **Konverter til Postgres med raster2pgsql**:
   ```bash
   raster2pgsql -s 25833 -t 256x256 -I -C -M sr16.tif sr16.tiles | psql -d soppjakt
   ```
   Bruker UTM Zone 33N (EPSG:25833) som er SR16 sin native projeksjon.
3. **Migrasjon 011** (lages av Claude når SR16 er importert) lager:
   - `sr16_cells` tabell med kolonnene over + `geom` (POLYGON, EPSG:4326)
   - GIST-indeks på geom
   - Funksjon `nibio_lookup(lat, lon)` som returnerer en row eller NULL
4. **Bytt ut stub i `src/lib/nibio/sr16.ts`** med `supabase.rpc('nibio_lookup', { lat, lon })`.

### Vei 3 — Tile-pre-baking (skal-vi-trenge-det-senere)

Hvis prediksjonen blir trafikktung, pre-beregn habitat-score per tile (typisk 100×100 m grid) i `prediction_tiles`-tabellen og hopp over runtime-lookup. Da blir `getForestProperties` aldri kalt fra `/api/prediction` — kun fra cron-jobben som genererer tiles.

## Hva som er klart i koden

- `src/lib/nibio/types.ts` — `ForestType`, `ForestProperties`, `SpeciesHabitatPreferences`, `HabitatScore`. Alle vokabulære matcher `mushroom_species.mycorrhizal_partners` fra migrasjon 009.
- `src/lib/nibio/habitat.ts` — `computeHabitatScore()` med tre signaler (treslag-match, alder-vindu, kalkrik-bonus), klemt til [0.2, 1.3]. Tester dekker ti tilfeller.
- `src/lib/nibio/sr16.ts` — `isWithinNorway()` (ferdig), `getForestProperties()` (stub returnerer null).
- `src/lib/nibio/__tests__/` — 17 vitest-cases på habitat + SR16-stubben.

## Dekningsavgrensning

SR16 dekker **fastlandet i Norge**. For:
- **Sverige** trengs egen adapter — Skogsstyrelsens "kNN-Sverige" raster har samme idé. Egen `src/lib/sr-sverige/` modul.
- **Finnmark og kysten** har SR16 noen huler — `getForestProperties` returnerer null, og `computeHabitatScore` håndterer det med nøytral score.
- **Svalbard** dekkes ikke. `isWithinNorway` slipper Svalbard inn (lat 78), så vi må snevre inn bbox når vi får ekte data.

## Faktiske handlinger for å aktivere

1. Velg vei 1 eller vei 2 over (anbefalt: vei 2).
2. Hvis vei 2: Last ned SR16 GeoTIFF (Sindre, manuelt — krever NIBIO-konto).
3. Si fra til Claude — så lager Claude migrasjon 011 og bytter ut stubben.
4. Test mot kjente koordinater (Sindre har testfunn ved Holmenkollen, Sognsvann, Maridalen — bekreft at NIBIO-data matcher det vi vet om områdene).
5. Generer prediksjons-tiles på nytt med habitat-score lagt til.
