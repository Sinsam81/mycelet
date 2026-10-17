import * as Sentry from '@sentry/nextjs';

/**
 * Hver mislykket AI-identifisering i nettleseren og appen blir én
 * Sentry-hendelse med hvor den stoppet.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Etter 29. september 2026 ser serveren to ting: vellykkede kall
 * (ai_identifications) og kall Kindwise avviste (ai_identifiseringsfeil,
 * migrasjon 073). Alt som stopper FØR det — kameraet, nedskaleringen på
 * telefonen, nettverket, Vercels 413, en 401, et tidsavbrudd — var usynlig:
 * siden fanget feilen og viste bare en tekst. 17. oktober sa eieren at
 * gjenkjenningen «fortsatt ikke virker i appen», mens 13 iOS-brukere hadde fått
 * svar og begge tabellene var tomme for eierens forsøk. Ingen kunne si hvor
 * forsøket døde. Med denne hendelsen står svaret i Sentry, med enhet, iOS-
 * versjon og release.
 *
 * Personvern: ingen bilder, ingen posisjon, ingen bruker-ID (Sentry-oppsettet
 * har userInfo: false og vasker alle hendelser). Bare steg, HTTP-status,
 * rutens feilkode, feilnavn, en avkortet feiltekst fra plugin/server og
 * bildestørrelser i tegn. Det er diagnostikk «Not Linked to You», som App
 * Privacy allerede erklærer.
 */

/** Hvor forsøket stoppet. */
export type IdentifiseringsSteg =
  /** Kamera-/bildevelgeren (Capacitor) kastet. */
  | 'kamera'
  /** Nedskalering/omkoding på enheten feilet. */
  | 'bilde'
  /** Bildene ble samlet for store før sending (klientens tak). */
  | 'for-store-bilder'
  /** Kallet til /api/identify feilet eller svarte ikke OK. */
  | 'foresporsel';

export interface Identifiseringsfeil {
  steg: IdentifiseringsSteg;
  /** HTTP-status fra /api/identify, når et svar kom. */
  status?: number;
  /** Rutens `code`, når svaret var JSON. */
  kode?: string;
  /** Om svaret var rutens JSON. Vercels 413/504 er HTML og når aldri ruta. */
  json?: boolean;
  /** Feilen som ble kastet, når det var en. */
  feil?: unknown;
  /** Lengden i tegn på hvert base64-bilde som var lagt inn. */
  bildetegn?: number[];
}

/** Svar som er forventede tilstander, ikke feil: de har egne paneler i siden. */
const FORVENTEDE_KODER = new Set(['daily_quota', 'ai_disabled']);

function feilnavn(feil: unknown): string | undefined {
  if (feil instanceof Error) return feil.name;
  return feil == null ? undefined : typeof feil;
}

function feiltekst(feil: unknown): string | undefined {
  const tekst = feil instanceof Error ? feil.message : typeof feil === 'string' ? feil : undefined;
  return tekst ? tekst.slice(0, 200) : undefined;
}

/** Det som skiller én feiltype fra en annen — styrer grupperingen i Sentry. */
export function feilnokkel(f: Identifiseringsfeil): string {
  if (f.kode) return f.kode;
  if (f.status != null) return String(f.status);
  return feilnavn(f.feil) ?? 'ukjent';
}

/**
 * Meld en mislykket identifisering. Kaster aldri: rapporteringen skal ikke
 * kunne ta ned siden som allerede viser brukeren en feil.
 */
export function meldIdentifiseringsfeil(f: Identifiseringsfeil): void {
  if (f.kode && FORVENTEDE_KODER.has(f.kode)) return;
  try {
    const nokkel = feilnokkel(f);
    const bildetegn = f.bildetegn ?? [];
    Sentry.captureMessage(`Identifisering feilet: ${f.steg} (${nokkel})`, {
      level: 'warning',
      fingerprint: ['identifisering-feilet', f.steg, nokkel],
      tags: {
        område: 'identifisering',
        steg: f.steg,
        ...(f.status != null ? { status: String(f.status) } : {}),
        ...(f.kode ? { kode: f.kode } : {}),
        ...(f.json != null ? { json: String(f.json) } : {})
      },
      extra: {
        feilnavn: feilnavn(f.feil),
        feiltekst: feiltekst(f.feil),
        antallBilder: bildetegn.length,
        bildetegn,
        totaltTegn: bildetegn.reduce((sum, n) => sum + n, 0)
      }
    });
  } catch {
    // Se over.
  }
}
