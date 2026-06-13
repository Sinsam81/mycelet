/**
 * Swedish surficial-deposit (jordart) adapter — live SGU OGC API Features.
 *
 * A STATIC per-cell moisture/drainage signal. Unlike weather (fetched once for
 * the view centre, so constant across a heatmap) the deposit type varies per
 * cell, so it adds real spatial discrimination — and it does so independently
 * of where people happen to look, which the spatial backtest showed the
 * occurrence signal cannot (it's mostly accessibility bias). It's also
 * Sweden's first soil signal at all (CORINE gives only forest type).
 *
 * Data: SGU "Jordarter 1:25 000–1:100 000", collection `grundlager` (the
 * bedrock-overlying deposit), with `ytlager` (thin surface layer) as a
 * fallback. Free, anonymous, CC0. OGC API Features (GeoJSON).
 *
 * Drainage → mushroom suitability is NOT monotonic: mesic till (morän) is the
 * classic productive Nordic forest soil and scores best; waterlogged peat and
 * thin soil over bedrock score worst; well-drained glaciofluvial sand sits in
 * between (good for pine-associated species). The factor is a modest
 * multiplier so it nuances, never dominates.
 */

const SGU_BASE = 'https://api.sgu.se/oppnadata/jordarter25k-100k/ogc/features/v1';
const SGU_TIMEOUT_MS = 8000;

export interface SoilDrainage {
  /** Raw SGU jordart text (jg2_tx), e.g. "Sandig morän". */
  jordart: string;
  /** Coarse drainage/suitability class label (Norwegian, for explanations). */
  klass: string;
  /** Suitability multiplier in [0.7, 1.15]; 1.0 = neutral / no signal. */
  factor: number;
}

/**
 * Map a Swedish jordart name to a drainage-suitability class + multiplier.
 * Pure + keyword-based (robust to the many SGU variants). Order matters:
 * peat is checked before sand, morän before clay (moränlera → mesic), etc.
 */
export function jordartToDrainage(jordartText: string | null | undefined): SoilDrainage {
  const raw = jordartText ?? '';
  const t = raw.toLowerCase();
  if (!t) return { jordart: '', klass: 'ukjent', factor: 1.0 };

  // Waterlogged: peat / bog / mire — most edibles avoid it.
  if (/(torv|kärr|karr|mosse|myr)/.test(t)) {
    return { jordart: raw, klass: 'vassmettet (torv/myr)', factor: 0.7 };
  }
  // Mesic till (morän) — the classic productive Nordic forest soil. Best.
  if (/morän|moran/.test(t)) {
    return { jordart: raw, klass: 'mesisk morenemark', factor: 1.15 };
  }
  // Well-drained glaciofluvial / wave-washed sand & gravel — good for
  // pine-associated species (Suillus, Cantharellus on sandy heath).
  if (/(isälv|isalv|glacifluv|svallsediment)/.test(t) || /\b(sand|grus)\b/.test(t)) {
    return { jordart: raw, klass: 'godt drenert (sand/grus)', factor: 1.05 };
  }
  // Clay / silt — moisture-retentive, heavy, often open/agricultural ground.
  if (/(lera|silt|ler\b)/.test(t)) {
    return { jordart: raw, klass: 'leire/silt', factor: 0.9 };
  }
  // Thin soil over bedrock — dry, shallow, poor mycelium.
  if (/(urberg|berg|tunt|block)/.test(t)) {
    return { jordart: raw, klass: 'tynt jordlag/berg', factor: 0.8 };
  }
  // Anthropogenic fill / water — no usable signal.
  if (/(fyllning|fyllnad|vatten)/.test(t)) {
    return { jordart: raw, klass: 'fyllmasse/vann', factor: 1.0 };
  }
  return { jordart: raw, klass: 'annet', factor: 1.0 };
}

async function sguFeatures(collection: string, lat: number, lon: number): Promise<{ jg2_tx?: string; geom_area?: number }[] | null> {
  // ~50 m bbox so usually only the containing polygon (or a close neighbour)
  // matches; OGC API bbox is lon,lat,lon,lat (CRS84).
  const d = 0.0005;
  const url = `${SGU_BASE}/collections/${collection}/items?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&f=json&limit=10`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SGU_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mycelet (mushroom prediction; data: SGU CC0)' }
    });
    if (!res.ok) return null;
    const json = await res.json();
    const feats = Array.isArray(json?.features) ? json.features : [];
    return feats.map((f: { properties?: Record<string, unknown> }) => ({
      jg2_tx: (f.properties?.jg2_tx as string | undefined) ?? undefined,
      geom_area: (f.properties?.geom_area as number | undefined) ?? undefined
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Pick the dominant (largest-area) deposit polygon near the point. */
function dominant(feats: { jg2_tx?: string; geom_area?: number }[] | null): string | null {
  if (!feats || feats.length === 0) return null;
  const withType = feats.filter((f) => f.jg2_tx);
  if (withType.length === 0) return null;
  return withType.reduce((best, f) => ((f.geom_area ?? 0) > (best.geom_area ?? 0) ? f : best)).jg2_tx ?? null;
}

/**
 * Fetch the surficial-deposit drainage class for a Swedish coordinate.
 * Tries `grundlager` (main deposit) then `ytlager` (thin surface layer).
 * Returns null on no data / network error → caller leaves the score unchanged.
 */
export async function getSwedishSoilDrainage(query: { lat: number; lon: number }): Promise<SoilDrainage | null> {
  const grund = dominant(await sguFeatures('grundlager', query.lat, query.lon));
  const jordart = grund ?? dominant(await sguFeatures('ytlager', query.lat, query.lon));
  if (!jordart) return null;
  return jordartToDrainage(jordart);
}
