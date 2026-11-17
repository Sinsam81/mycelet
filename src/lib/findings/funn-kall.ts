/**
 * Nettleserens kall mot /api/findings/:id — endre, slette, gjenopprette.
 *
 * Rutene svarer med `error` (og iblant `details`) på leserens språk, så
 * meldingen kan vises som den er. `reserve` er teksten når svaret ikke lar seg
 * lese — nettet falt ut, eller noe foran appen svarte i stedet for den.
 *
 * Ligger her og ikke hos komponentene som bruker den i dag (Mine steder): den
 * har ingen avhengighet til React, og neste flate som skal endre et funn —
 * kartets popup, profilen — skal kalle rutene på samme måte.
 */

export class FunnKallFeil extends Error {
  /** Stabil kode fra ruta (se src/lib/findings/feil.ts), null når den mangler. */
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'FunnKallFeil';
    this.code = code;
  }
}

/**
 * Sier svaret at siden viser noe som ikke stemmer lenger — og i så fall hva?
 *
 *  · 'borte' (`not_found`): funnet er slettet, gjenopprettet eller ryddet et
 *    annet sted — en annen fane, appen på telefonen, ryddejobben.
 *  · 'karantene' (`sharing_cooldown`): funnet er endret et annet sted, så
 *    karantenen siden ikke visste om, gjelder.
 *
 * I begge tilfeller skal lista hentes på nytt, ellers gir hvert trykk samme
 * nei. `null` for alle andre feil.
 */
export type UtdatertGrunn = 'borte' | 'karantene';

export function utdatertGrunn(error: unknown): UtdatertGrunn | null {
  if (!(error instanceof FunnKallFeil)) return null;
  if (error.code === 'not_found') return 'borte';
  if (error.code === 'sharing_cooldown') return 'karantene';
  return null;
}

async function kall(url: string, init: RequestInit, reserve: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new FunnKallFeil(reserve);
  }
  if (res.ok) return;

  const body = (await res.json().catch(() => null)) as { error?: unknown; details?: unknown; code?: unknown } | null;
  // `details` først: når en migrasjon mangler, er det den som sier hva som
  // IKKE skjedde med funnet. Samme rekkefølge som kartets slettevei.
  const tekst = [body?.details, body?.error].find((v): v is string => typeof v === 'string' && v.trim() !== '');
  throw new FunnKallFeil(tekst ?? reserve, typeof body?.code === 'string' ? body.code : null);
}

const sti = (id: string) => `/api/findings/${encodeURIComponent(id)}`;

/**
 * Bare feltene som sendes, endres. Posisjonen kan ikke endres — ruta avviser
 * den. Rutestørrelsen til et sone-funn heller ikke: feltet finnes ikke her, og
 * en utelatt størrelse betyr «den funnet står med» (se «SONERUTA» i
 * delingsendring.ts).
 */
export interface FunnEndring {
  visibility?: 'approximate' | 'private';
  isZoneFinding?: boolean;
  zoneLabel?: string | null;
  notes?: string | null;
}

export function endreFunn(id: string, endring: FunnEndring, reserve: string): Promise<void> {
  return kall(
    sti(id),
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(endring) },
    reserve
  );
}

export function slettFunn(id: string, reserve: string): Promise<void> {
  return kall(sti(id), { method: 'DELETE' }, reserve);
}

export function gjenopprettFunn(id: string, reserve: string): Promise<void> {
  return kall(`${sti(id)}/restore`, { method: 'POST' }, reserve);
}

/**
 * En beskjed på et VELLYKKET lagre-svar fra POST /api/findings: funnet er
 * lagret, men ikke helt slik brukeren ba om. I dag bare sonevakta
 * (`zone_saved_private`, se src/lib/findings/sonevakt.ts): sone-funnet ble
 * lagret som privat. `message` er på leserens språk og vises som den er.
 */
export interface LagreBeskjed {
  code: string;
  message: string;
}

/**
 * Leser svaret på POST /api/findings. Tåler et svar som ikke er JSON (null inn
 * gir null ut), så en lagring som gikk, aldri ser ut som en som feilet.
 */
export function lesLagreSvar(body: unknown): { id: string | null; notice: LagreBeskjed | null } {
  const b = (body && typeof body === 'object' ? body : {}) as { id?: unknown; notice?: unknown };
  const id = typeof b.id === 'string' && b.id !== '' ? b.id : null;
  const n = (b.notice && typeof b.notice === 'object' ? b.notice : null) as { code?: unknown; message?: unknown } | null;
  const notice =
    n && typeof n.code === 'string' && typeof n.message === 'string' && n.message.trim() !== ''
      ? { code: n.code, message: n.message }
      : null;
  return { id, notice };
}
