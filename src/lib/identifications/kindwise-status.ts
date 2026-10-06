/**
 * Kindwise (Mushroom.id) sin egen status for nøkkelen vår, lest fra
 * GET /api/v1/usage_info. Kallet koster ingen kreditter.
 *
 * Hvorfor dette finnes: fra mai til 29. september 2026 feilet HVERT kall til
 * Kindwise (ruta sendte to parametre i kroppen som hører hjemme i URL-en), og
 * ingenting i appen sa fra. Feilen gikk til Vercel-loggen, Sentry filtrerer
 * kindwise.com med vilje, helsesjekken så ikke på nøkkelen, og dagsrapporten
 * telte ikke AI-kall. «Ingen bruker funksjonen» og «funksjonen er død» var
 * umulige å skille — i fire måneder, med 2 050 urørte kreditter.
 *
 * Nå leses status her, av to steder:
 *   · /api/health (checks.ai): er nøkkelen gyldig, og er det kreditter igjen?
 *   · dagsrapporten: kreditter igjen og brukt siste uke, ved siden av våre
 *     egne tall for vellykkede og feilede kall.
 *
 * Svaret fra Kindwise (verifisert 29. sep 2026):
 *   { active, credit_limits: {day,week,month,total}, used: {day,week,month,total},
 *     can_use_credits: {value, reason}, remaining: {day,week,month,total} }
 * `week`/`month` er flytende vinduer. Tallene er Kindwise sin telling av
 * VELLYKKEDE identifiseringer — en avvist forespørsel trekker ikke.
 */

export const KINDWISE_USAGE_URL = 'https://mushroom.kindwise.com/api/v1/usage_info';

/** Samme regel som isAiEnabled i /api/identify: satt, ikke plassholderen, lang nok. */
export function erAiNokkelSatt(apiKey: string | undefined): apiKey is string {
  return Boolean(apiKey && apiKey !== 'your-api-key-here' && apiKey.length >= 20);
}

export interface KindwiseStatus {
  aktiv: boolean;
  /** Kindwise sitt eget «kan bruke kreditter nå» — false når tomt eller sperret. */
  kanBruke: boolean;
  grunn: string | null;
  /** Kreditter igjen totalt. null når Kindwise ikke oppgir tallet. */
  igjen: number | null;
  bruktUke: number | null;
  bruktMaaned: number | null;
  bruktTotalt: number | null;
}

export type KindwiseStatusResultat =
  | { ok: true; status: KindwiseStatus }
  | { ok: false; httpStatus: number | null; feil: string };

function tall(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Ren tolkning av JSON-kroppen. Eksportert for testen. */
export function tolkUsageInfo(json: unknown): KindwiseStatus {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const used = (o.used && typeof o.used === 'object' ? o.used : {}) as Record<string, unknown>;
  const remaining = (o.remaining && typeof o.remaining === 'object' ? o.remaining : {}) as Record<string, unknown>;
  const can = (o.can_use_credits && typeof o.can_use_credits === 'object' ? o.can_use_credits : {}) as Record<string, unknown>;
  return {
    aktiv: o.active === true,
    kanBruke: can.value === true,
    grunn: typeof can.reason === 'string' && can.reason ? can.reason : null,
    igjen: tall(remaining.total),
    bruktUke: tall(used.week),
    bruktMaaned: tall(used.month),
    bruktTotalt: tall(used.total)
  };
}

/**
 * Henter status. Kaster aldri: nett- og formatfeil kommer som {ok:false},
 * fordi begge kallstedene skal kunne si «ikke målt» og gå videre.
 */
export async function hentKindwiseStatus(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000
): Promise<KindwiseStatusResultat> {
  try {
    const res = await fetchImpl(KINDWISE_USAGE_URL, {
      method: 'GET',
      headers: { 'Api-Key': apiKey },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      const tekst = (await res.text().catch(() => '')).slice(0, 200);
      return { ok: false, httpStatus: res.status, feil: tekst || `HTTP ${res.status}` };
    }
    return { ok: true, status: tolkUsageInfo(await res.json()) };
  } catch (err) {
    return { ok: false, httpStatus: null, feil: err instanceof Error ? err.message : 'ukjent feil' };
  }
}
