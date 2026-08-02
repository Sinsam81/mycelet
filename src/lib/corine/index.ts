/**
 * CORINE Land Cover adapter — the Swedish / pan-European forest source.
 *
 * NIBIO (Norway) gives rich SR16 data (tree species, bonitet, volume). Outside
 * Norway there's no equally-open live API, so we use CORINE Land Cover via the
 * EEA ArcGIS `identify` endpoint: a free, no-account point query that returns
 * the land-cover class (Code_18). It gives forest TYPE only — no age/bonitet/
 * volume — so those fields are null and the prediction leans on type match +
 * weather + observations.
 *
 * CLC forest classes we map:
 *   311 Broad-leaved forest → 'lauv'
 *   312 Coniferous forest   → 'bar'
 *   313 Mixed forest        → 'blandet'
 * Everything else (urban, agriculture, water, wetland, transitional shrub …)
 * → null, so the cell is treated as "no forest signal" (not scored as a spot).
 */

import type { ForestProperties, ForestType, HabitatQuery } from '@/lib/nibio/types';

const IDENTIFY_URL = 'https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2018_WM/MapServer/identify';

const CLC_TO_FOREST: Record<string, ForestType> = {
  '311': 'lauv',
  '312': 'bar',
  '313': 'blandet'
};

export async function getCorineForest(query: HabitatQuery): Promise<ForestProperties | null> {
  try {
    const params = new URLSearchParams({
      f: 'json',
      geometry: JSON.stringify({ x: query.lon, y: query.lat, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPoint',
      sr: '4326',
      layers: 'all',
      tolerance: '2',
      mapExtent: `${query.lon - 0.1},${query.lat - 0.1},${query.lon + 0.1},${query.lat + 0.1}`,
      imageDisplay: '400,400,96',
      returnGeometry: 'false'
    });

    const res = await fetch(`${IDENTIFY_URL}?${params.toString()}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;

    const json = (await res.json()) as { results?: { attributes?: Record<string, string> }[] };

    // `tolerance: 2` betyr at endepunktet returnerer ALT innenfor ~110 m av
    // punktet, ikke bare polygonet punktet står i — typisk 3-4 rader i
    // vilkårlig rekkefølge. Vi brøt tidligere på FØRSTE rad med en Code_18, og
    // en åkerkant (211) på nabocella slo dermed ut barskogen (312) i samme
    // svar: cella ble levert som «ingen skogsignal», rutenettet hoppet over
    // den, og brukeren fikk «fant ingen lovende steder» midt i skogen.
    // Rammer bare Sverige og resten av Europa — Norge bruker SR16.
    //
    // Vi ser derfor gjennom alle treffene og foretrekker en skogsklasse.
    // Ikke-skog vinner bare når INGEN av treffene er skog.
    let forestType: ForestType | undefined;
    let sawAnyCode = false;
    for (const result of json.results ?? []) {
      const value =
        result.attributes?.['Code_18'] ??
        result.attributes?.['CODE_18'] ??
        result.attributes?.['Raster.CODE_18'];
      if (!value) continue;
      sawAnyCode = true;
      const match = CLC_TO_FOREST[String(value)];
      if (match) {
        forestType = match;
        break;
      }
    }
    if (!sawAnyCode) return null;
    if (!forestType) return null; // non-forest land cover → no forest signal

    return { forestType, ageYears: null, productivity: null, volumePerHa: null, source: 'corine' };
  } catch {
    return null;
  }
}
