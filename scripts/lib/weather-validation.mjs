const EARTH_RADIUS_KM = 6371;

function radians(value) {
  return (value * Math.PI) / 180;
}

export function distanceKm(a, b) {
  if (![a.latitude, a.longitude, b.latitude, b.longitude].every(Number.isFinite)) return Infinity;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function observedMs(row) {
  return Date.parse(`${row.observedAt}T00:00:00Z`);
}

function observedYear(row) {
  return Number(String(row.observedAt).slice(0, 4));
}

export function splitTemporalRows(rows, testFraction = 0.3) {
  const sorted = [...rows].sort((a, b) => observedMs(a) - observedMs(b));
  if (sorted.length < 2) return { train: sorted, test: [], trainThrough: sorted.at(-1)?.observedAt ?? null };
  const testCount = Math.max(1, Math.min(sorted.length - 1, Math.ceil(sorted.length * testFraction)));
  const splitAt = sorted.length - testCount;
  const train = sorted.slice(0, splitAt);
  return {
    train,
    test: sorted.slice(splitAt),
    trainThrough: train.at(-1)?.observedAt ?? null
  };
}

/**
 * Prefer comparison observations exposed to the same broad weather event.
 * Candidates are already restricted to another species in the same region
 * and calendar month; these tiers add year and distance controls.
 */
export function chooseWeatherBackgrounds(presence, candidates, count, radiusKm = 150) {
  const presenceYear = observedYear(presence);
  const tiers = [
    {
      name: 'local_same_year',
      matches: (candidate) => observedYear(candidate) === presenceYear && distanceKm(presence, candidate) <= radiusKm
    },
    {
      name: 'regional_same_year',
      matches: (candidate) => observedYear(candidate) === presenceYear
    },
    {
      name: 'local_near_year',
      matches: (candidate) =>
        Math.abs(observedYear(candidate) - presenceYear) <= 1 && distanceKm(presence, candidate) <= radiusKm
    },
    { name: 'regional_month_fallback', matches: () => true }
  ];
  const chosen = [];
  const used = new Set();

  for (const tier of tiers) {
    const eligible = candidates
      .filter((candidate) => !used.has(candidate.occurrenceId) && tier.matches(candidate))
      .sort((a, b) => {
        const timeDelta = Math.abs(observedMs(a) - observedMs(presence));
        const distanceDelta = distanceKm(presence, a) - distanceKm(presence, b);
        return timeDelta - Math.abs(observedMs(b) - observedMs(presence)) || distanceDelta || a.occurrenceId - b.occurrenceId;
      });
    for (const candidate of eligible) {
      used.add(candidate.occurrenceId);
      chosen.push({ row: candidate, tier: tier.name });
      if (chosen.length >= count) return chosen;
    }
  }

  return chosen;
}
