/**
 * Pure helpers for leakage-resistant spatial prediction validation.
 *
 * A target-group background should represent a place where mushroom observers
 * were active, without accidentally using a known presence of the species we
 * are evaluating. Matches therefore prefer another species observed in the
 * same country, season window and local area.
 */

export function circularMonthDistance(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isInteger(left) || !Number.isInteger(right) || left < 1 || left > 12 || right < 1 || right > 12) {
    return Infinity;
  }
  const direct = Math.abs(left - right);
  return Math.min(direct, 12 - direct);
}

export function monthFromIso(iso) {
  const month = Number(String(iso ?? '').slice(5, 7));
  return month >= 1 && month <= 12 ? month : null;
}

/** Roughly 55 km north/south by 25-55 km east/west in the Nordics. */
export function spatialBlock(lat, lng, sizeDeg = 0.5) {
  const y = Math.floor(Number(lat) / sizeDeg);
  const x = Math.floor(Number(lng) / sizeDeg);
  return `${y}:${x}`;
}

export function buildTargetGroupIndex(rows, regionOf) {
  const byRegion = new Map();
  const byRegionMonth = new Map();
  for (const row of rows) {
    const region = regionOf(row.lat, row.lng);
    if (region !== 'NO' && region !== 'SE') continue;
    const regionRows = byRegion.get(region) ?? [];
    regionRows.push(row);
    byRegion.set(region, regionRows);

    const month = monthFromIso(row.iso);
    if (month == null) continue;
    const key = `${region}:${month}`;
    const monthRows = byRegionMonth.get(key) ?? [];
    monthRows.push(row);
    byRegionMonth.set(key, monthRows);
  }
  return { byRegion, byRegionMonth };
}

function sampleWithoutReplacement(rows, count, rng) {
  if (rows.length <= count) return [...rows];
  const copy = [...rows];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

/**
 * Match target-group backgrounds for one held-out presence.
 *
 * Preference order:
 *  1. same region, nearby, same ±month window, different species
 *  2. same region and ±month window, different species
 *  3. same region, nearby, different species
 *  4. same region, different species
 */
export function chooseTargetGroupBackgrounds({
  presence,
  index,
  count,
  rng,
  regionOf,
  distanceKm,
  radiusKm = 150,
  monthWindow = 1
}) {
  const region = regionOf(presence.lat, presence.lng);
  const month = monthFromIso(presence.iso);
  const sameRegion = (index.byRegion.get(region) ?? []).filter((row) => row.sid !== presence.sid);

  const seasonal = [];
  if (month != null) {
    for (let candidateMonth = 1; candidateMonth <= 12; candidateMonth++) {
      if (circularMonthDistance(month, candidateMonth) > monthWindow) continue;
      for (const row of index.byRegionMonth.get(`${region}:${candidateMonth}`) ?? []) {
        if (row.sid !== presence.sid) seasonal.push(row);
      }
    }
  }

  const isNearby = (row) => distanceKm(presence.lat, presence.lng, row.lat, row.lng) <= radiusKm;
  const pools = [
    { tier: 'local_seasonal', rows: seasonal.filter(isNearby) },
    { tier: 'regional_seasonal', rows: seasonal },
    { tier: 'local_any_season', rows: sameRegion.filter(isNearby) },
    { tier: 'regional_any_season', rows: sameRegion }
  ];
  const selected = pools.find((pool) => pool.rows.length >= count) ?? pools.find((pool) => pool.rows.length > 0);
  if (!selected) return { rows: [], tier: 'unmatched' };
  return { rows: sampleWithoutReplacement(selected.rows, count, rng), tier: selected.tier };
}

