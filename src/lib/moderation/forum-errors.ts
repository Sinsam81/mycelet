import { isProhibitedContentError } from './content-filter';

/**
 * Feilen forum-hookene kaster når brukeren ikke er innlogget.
 *
 * De kastet tidligere `new Error('Ikke innlogget')`, og komponentene viste
 * `err.message` rått — så svenske brukere fikk norsk tekst. En kode i stedet
 * for en setning lar visningen velge språk.
 */
export class ForumAuthError extends Error {
  readonly code = 'NOT_AUTHENTICATED';

  constructor() {
    super('NOT_AUTHENTICATED');
    this.name = 'ForumAuthError';
  }
}

export function isNotAuthenticatedError(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { code?: unknown }).code === 'NOT_AUTHENTICATED';
}

/**
 * Innlegget finnes ikke for denne leseren: slettet, skjult av en moderator,
 * eller skrevet av noen leseren har blokkert. RLS gir null rader i alle tre
 * tilfellene, og det er et SVAR — ikke en feil som går over.
 *
 * `useForumPost` kastet tidligere `new Error('Innlegg ikke funnet')`, og da
 * kunne trådsiden ikke skille «innlegget er borte» fra et nettverksbrudd. Den
 * måtte velge mellom å la et borte innlegg stå igjen under feilmeldingen, eller
 * å rive ned tråden (og kommentarutkastet) hver gang en henting i bakgrunnen
 * feilet på dårlig dekning.
 */
export class ForumPostNotFoundError extends Error {
  readonly code = 'POST_NOT_FOUND';

  constructor() {
    super('POST_NOT_FOUND');
    this.name = 'ForumPostNotFoundError';
  }
}

export function isPostNotFoundError(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { code?: unknown }).code === 'POST_NOT_FOUND';
}

/** TanStacks standard: tre nye forsøk etter det første. */
const MAKS_NYE_FORSOK = 3;

/**
 * `retry` for `useForumPost`. «Finnes ikke» blir ikke sannere av å spørre tre
 * ganger til: med standardregelen sto et innlegg som nettopp ble usynlig igjen
 * på skjermen i sju sekunder (1 + 2 + 4 s) før siden fikk vite det. Alt annet
 * — nettverk, tidsavbrudd — prøves på nytt som før.
 */
export function skalHenteInnleggPaaNytt(failureCount: number, error: unknown): boolean {
  return !isPostNotFoundError(error) && failureCount < MAKS_NYE_FORSOK;
}

export interface ForumFeiltekster {
  /** Handlingens egen «kunne ikke …»-tekst. */
  fallback: string;
  /** Innholdsfilteret slo til (klient eller databasetrigger). */
  prohibited: string;
  notLoggedIn: string;
}

/**
 * Teksten brukeren skal se når en forumhandling feiler.
 *
 * Faller ALDRI tilbake på `err.message`: det er enten en intern kode
 * («MYCELET_PROHIBITED_CONTENT» sto i klartekst under redigeringsfeltet) eller
 * en engelsk PostgREST-melding. Alt som ikke kjennes igjen får handlingens egen
 * oversatte feiltekst.
 */
export function forumErrorMessage(error: unknown, tekster: ForumFeiltekster): string {
  if (isProhibitedContentError(error)) return tekster.prohibited;
  if (isNotAuthenticatedError(error)) return tekster.notLoggedIn;
  return tekster.fallback;
}

/** Deling avbrutt av brukeren (lukket delingsarket) er ikke en feil. */
export function erAvbruttDeling(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError' || name === 'InvalidStateError';
}
