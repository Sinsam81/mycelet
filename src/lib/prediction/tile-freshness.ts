export interface RegionTileState {
  region: string;
  tileDate: string | null;
  updatedAt: string | null;
  error?: string;
}

export interface AssessedRegionTileState extends RegionTileState {
  fresh: boolean;
}

/**
 * Klokkeslettet (UTC) da nattens flisjobb senest skal være ferdig.
 *
 * Cron-en er planlagt «15 1 * * *» i vercel.json, og en full kjøring tar under
 * ett minutt i produksjon. Fram til dette tidspunktet finnes det derfor ingen
 * fliser for dagens UTC-dato — helt normalt, ikke en feil. Uten dette vinduet
 * svarte /api/health/predictions 503 «degraded» hver eneste natt mellom 00:00
 * og cron-en var ferdig, altså en falsk alarm ~76 minutter i døgnet for en som
 * kobler oppetidsovervåking mot ruta.
 */
export const TILE_CRON_DEADLINE_UTC_HOUR = 2;

/** Gårsdagens dato (UTC) for en ISO-dato på formen YYYY-MM-DD. */
export function previousDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Er vi fortsatt inne i vinduet der nattens jobb ikke har rukket å kjøre?
 * `now` er alltid UTC — det er samme tidsakse som både `tile_date` og cron-en.
 */
export function withinCronGraceWindow(now: Date): boolean {
  return now.getUTCHours() < TILE_CRON_DEADLINE_UTC_HOUR;
}

export function assessTileFreshness(
  states: RegionTileState[],
  expectedDate: string,
  /**
   * Ekstra dato som også teller som fersk. Settes til gårsdagen mens nattens
   * jobb ennå ikke er kjørt — se withinCronGraceWindow.
   */
  alsoAcceptDate?: string | null
): { fresh: boolean; regions: AssessedRegionTileState[] } {
  const regions = states.map((state) => ({
    ...state,
    fresh:
      !state.error &&
      state.tileDate != null &&
      (state.tileDate === expectedDate || (alsoAcceptDate != null && state.tileDate === alsoAcceptDate))
  }));

  return {
    fresh: regions.length > 0 && regions.every((region) => region.fresh),
    regions
  };
}
