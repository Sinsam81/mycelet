import type { ForestProperties } from '@/lib/forest';
import type { WeatherSummary } from '@/lib/weather';

const FOREST_TAGS: Partial<Record<ForestProperties['forestType'], string>> = {
  gran: 'granskog',
  furu: 'furuskog',
  bar: 'barskog',
  lauv: 'lauvskog',
  bjork: 'bjorkeskog',
  eik: 'eikeskog',
  bok: 'bokeskog',
  osp: 'ospeskog',
  or: 'oreskog',
  blandet: 'blandingsskog',
  apent: 'apent_landskap'
};

export function deriveHabitatTags(forest: ForestProperties | null): string[] | null {
  if (!forest) return null;

  const tags = new Set<string>();
  const forestTag = FOREST_TAGS[forest.forestType];
  if (forestTag) tags.add(forestTag);

  if (forest.ageYears != null) {
    if (forest.ageYears >= 80) tags.add('gammelskog');
    else if (forest.ageYears <= 30) tags.add('ungskog');
  }

  if (forest.productivity != null) {
    if (forest.productivity >= 17) tags.add('hoy_bonitet');
    else if (forest.productivity <= 8) tags.add('lav_bonitet');
  }

  return tags.size > 0 ? [...tags] : null;
}

export function buildWeatherSnapshot(
  weather: WeatherSummary | null,
  capturedAt: string
): (WeatherSummary & { capturedAt: string }) | null {
  return weather ? { ...weather, capturedAt } : null;
}

export async function bestEffortFieldContext(
  weatherPromise: Promise<WeatherSummary | null>,
  forestPromise: Promise<ForestProperties | null>,
  timeoutMs = 4_000
): Promise<{ weather: WeatherSummary | null; forest: ForestProperties | null }> {
  const timeout = <T>(promise: Promise<T>): Promise<T | null> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        }
      );
    });

  const [weather, forest] = await Promise.all([timeout(weatherPromise), timeout(forestPromise)]);
  return { weather, forest };
}
